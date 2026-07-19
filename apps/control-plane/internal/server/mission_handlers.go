package server

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
)

// Coding agent engine — missions decompose a goal into ordered sub-tasks the engine runs
// autonomously (plan → approve → sequential execution with verify/retry → report). Every
// route is scoped to an owned project; ownership flows through the owning project.

type mission struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Goal      string    `json:"goal"`
	Status    string    `json:"status"`
	Plan      []string  `json:"plan"`
	Summary   string    `json:"summary"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type missionTask struct {
	ID        string    `json:"id"`
	Ordinal   int       `json:"ordinal"`
	Objective string    `json:"objective"`
	Status    string    `json:"status"`
	Attempts  int       `json:"attempts"`
	Result    string    `json:"result"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const missionCols = `id, project_id, goal, status, plan, summary, created_at, updated_at`

func scanMission(row pgx.Row) (mission, error) {
	var m mission
	var planRaw []byte
	if err := row.Scan(&m.ID, &m.ProjectID, &m.Goal, &m.Status, &planRaw, &m.Summary, &m.CreatedAt, &m.UpdatedAt); err != nil {
		return mission{}, err
	}
	if len(planRaw) > 0 {
		_ = json.Unmarshal(planRaw, &m.Plan)
	}
	if m.Plan == nil {
		m.Plan = []string{}
	}
	return m, nil
}

func (s *Server) loadMissionTasks(ctx context.Context, missionID string) ([]missionTask, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, ordinal, objective, status, attempts, result, updated_at
		   FROM agent_mission_tasks WHERE mission_id = $1 ORDER BY ordinal ASC`, missionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []missionTask{}
	for rows.Next() {
		var t missionTask
		if err := rows.Scan(&t.ID, &t.Ordinal, &t.Objective, &t.Status, &t.Attempts, &t.Result, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// loadMission fetches an owned project's mission plus its tasks (404 semantics via ErrNoRows).
func (s *Server) loadMission(ctx context.Context, projectID, missionID string) (mission, []missionTask, error) {
	m, err := scanMission(s.pool.QueryRow(ctx,
		`SELECT `+missionCols+` FROM agent_missions WHERE id = $1 AND project_id = $2`, missionID, projectID))
	if err != nil {
		return mission{}, nil, err
	}
	tasks, err := s.loadMissionTasks(ctx, missionID)
	if err != nil {
		return mission{}, nil, err
	}
	return m, tasks, nil
}

func (s *Server) handleListMissions(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+missionCols+` FROM agent_missions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 50`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []mission{}
	for rows.Next() {
		m, err := scanMission(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleGetMission(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	m, tasks, err := s.loadMission(r.Context(), projectID, chi.URLParam(r, "missionID"))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Mission not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"mission": m, "tasks": tasks})
}

func (s *Server) handleCreateMission(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Goal string `json:"goal"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	goal := strings.TrimSpace(body.Goal)
	if goal == "" {
		writeError(w, http.StatusBadRequest, "Mission goal is required")
		return
	}

	// Plan the goal with the existing agent plan mode. planMissionGoal mirrors the Runner
	// construction in agent_handlers.go (workspace + model resolution) but with Mode:"plan"
	// and returns the proposed ordered objectives.
	steps, err := s.planMissionGoal(r.Context(), r, projectID, goal)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if len(steps) == 0 {
		writeError(w, http.StatusUnprocessableEntity, "The planner did not propose any steps; rephrase the goal.")
		return
	}

	m, err := scanMission(s.pool.QueryRow(r.Context(),
		`INSERT INTO agent_missions (project_id, user_id, goal, status, plan)
		 VALUES ($1, $2, $3, 'awaiting_approval', $4) RETURNING `+missionCols,
		projectID, userID(r), goal, jsonMarshal(steps)))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	for i, obj := range steps {
		if _, err := s.pool.Exec(r.Context(),
			`INSERT INTO agent_mission_tasks (mission_id, ordinal, objective) VALUES ($1, $2, $3)`,
			m.ID, i, obj); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	tasks, err := s.loadMissionTasks(r.Context(), m.ID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"mission": m, "tasks": tasks})
}

// jsonMarshal is a tiny helper returning JSON bytes (plan column is jsonb).
func jsonMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	if b == nil {
		return []byte("[]")
	}
	return b
}

// planMissionGoal runs the agent in plan mode over the goal and returns the proposed ordered
// objectives. Mirrors the Runner construction in handleAgentRunSSE (agent_handlers.go) via the
// shared resolveAgentRun resolution, but with Mode:"plan".
func (s *Server) planMissionGoal(ctx context.Context, r *http.Request, projectID, goal string) ([]string, error) {
	provider, rt, ws, apiKey, _, err := s.resolveAgentRun(ctx, r, projectID, "")
	if err != nil {
		return nil, err
	}
	runner := agent.NewRunner(provider, rt, agent.Config{
		WorkspaceID: ws.ProjectID,
		Mode:        "plan",
		APIKey:      apiKey,
		Memory:      &projectMemoryStore{s: s, projectID: ws.ProjectID, userID: userID(r)},
		Skills:      s.loadEnabledSkills(ctx, ws.ProjectID),
	})
	res, err := runner.Run(ctx, goal, nil)
	if err != nil {
		return nil, err
	}
	return res.Plan, nil
}
