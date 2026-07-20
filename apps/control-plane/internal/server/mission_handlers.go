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
	"github.com/magnetoid/torsor/control-plane/internal/orchestrator"
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

	// Enforce the engine's max-tasks cap before persisting the plan.
	cfg := s.loadEngineConfig(r.Context())
	if cfg.MaxTasks > 0 && len(steps) > cfg.MaxTasks {
		steps = steps[:cfg.MaxTasks]
	}
	// Verification gate: every mission ends with an explicit verify objective (planner
	// plans are asked to end with verification, but models don't always comply). Appended
	// before persisting so the user sees it at approval time; the orchestrator's normal
	// retry machinery then applies to the verification itself.
	steps = ensureVerifyObjective(steps, cfg.MaxTasks)

	// Persist the mission row and its per-task rows in one transaction so a mid-loop failure
	// can't leave a partial mission behind.
	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer tx.Rollback(r.Context())

	m, err := scanMission(tx.QueryRow(r.Context(),
		`INSERT INTO agent_missions (project_id, user_id, goal, status, plan)
		 VALUES ($1, $2, $3, 'awaiting_approval', $4) RETURNING `+missionCols,
		projectID, userID(r), goal, jsonMarshal(steps)))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	for i, obj := range steps {
		if _, err := tx.Exec(r.Context(),
			`INSERT INTO agent_mission_tasks (mission_id, ordinal, objective) VALUES ($1, $2, $3)`,
			m.ID, i, obj); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		s.fail(w, r, err)
		return
	}

	tasks, err := s.loadMissionTasks(r.Context(), m.ID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"mission": m, "tasks": tasks})
}

// verifyObjective is the canonical verification sub-task appended to mission plans that
// lack one — the engine's "did it actually work?" gate before a mission reports done.
const verifyObjective = "Final verification: run the project's tests if it has any, then verify the running app end-to-end — use verify_app (and read_preview_errors) and fix every console error, uncaught exception, or failed request found, re-verifying until the check is clean."

// ensureVerifyObjective guarantees the plan ends with a verification step. Plans that
// already contain a verify/test step are left untouched; otherwise the canonical objective
// is appended, evicting the last step only if the max-tasks cap would be exceeded. A cap of
// 1 leaves the plan alone (a mission that is only verification would do no work).
func ensureVerifyObjective(steps []string, maxTasks int) []string {
	for _, st := range steps {
		ls := strings.ToLower(st)
		if strings.Contains(ls, "verif") || strings.Contains(ls, "test") {
			return steps
		}
	}
	if maxTasks == 1 {
		return steps
	}
	if maxTasks > 0 && len(steps) >= maxTasks {
		steps = steps[:maxTasks-1]
	}
	return append(steps, verifyObjective)
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

// dbMissionStore adapts the missions tables to orchestrator.Store for one mission, so the
// DB-agnostic orchestrator can persist progress (making a mission resumable and observable).
type dbMissionStore struct {
	s         *Server
	missionID string
}

func (d *dbMissionStore) SetTaskStatus(ctx context.Context, taskID, status string, attempts int, result string) error {
	_, err := d.s.pool.Exec(ctx,
		`UPDATE agent_mission_tasks SET status=$2, attempts=$3, result=$4, updated_at=NOW() WHERE id=$1`,
		taskID, status, attempts, result)
	return err
}

func (d *dbMissionStore) SetMissionStatus(ctx context.Context, status, summary string) error {
	_, err := d.s.pool.Exec(ctx,
		`UPDATE agent_missions SET status=$2, summary=$3, updated_at=NOW() WHERE id=$1`,
		d.missionID, status, summary)
	return err
}

// handleApproveMission approves an awaiting-approval mission (optionally with an edited plan)
// and launches its orchestrated execution in the background.
func (s *Server) handleApproveMission(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	missionID := chi.URLParam(r, "missionID")
	m, tasks, err := s.loadMission(r.Context(), projectID, missionID)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Mission not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if m.Status != "awaiting_approval" {
		writeError(w, http.StatusConflict, "Mission is not awaiting approval")
		return
	}
	// Optional edited plan: replace task objectives if provided (same count).
	var body struct {
		Plan []string `json:"plan"`
	}
	_ = decodeJSON(r, &body)
	if len(body.Plan) == len(tasks) {
		for i, obj := range body.Plan {
			obj = strings.TrimSpace(obj)
			if obj == "" {
				continue
			}
			_, _ = s.pool.Exec(r.Context(),
				`UPDATE agent_mission_tasks SET objective=$2 WHERE id=$1`, tasks[i].ID, obj)
			tasks[i].Objective = obj
		}
	}

	// Engine caps (single-row config; safe defaults on any read error so the engine never
	// wedges on a config read).
	cfg := s.loadEngineConfig(r.Context())
	if !cfg.Enabled {
		writeError(w, http.StatusServiceUnavailable, "The agent engine is disabled")
		return
	}

	// Reserve an in-process concurrency slot before moving the mission to running. The slot is
	// released either here on failure or by runMission's deferred release once it finishes.
	if cfg.MaxConcurrentMissions > 0 && s.activeMissions.Load() >= int64(cfg.MaxConcurrentMissions) {
		writeError(w, http.StatusTooManyRequests, "Too many missions are already running; try again shortly")
		return
	}
	s.activeMissions.Add(1)

	// Compare-and-swap awaiting_approval → running so two concurrent approvals can't both
	// launch the mission. Release the reserved slot on any failure to move it to running.
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE agent_missions SET status='running', updated_at=NOW() WHERE id=$1 AND status='awaiting_approval'`, m.ID)
	if err != nil {
		s.activeMissions.Add(-1)
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		s.activeMissions.Add(-1)
		writeError(w, http.StatusConflict, "Mission is no longer awaiting approval")
		return
	}

	uid := userID(r)
	go s.runMission(projectID, m.ID, uid, cfg.MaxRetries)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "running"})
}

// runMission executes a mission to completion in the background. It uses a detached context so
// it survives the originating request; the context is cancelable via the mission cancel
// registry (stop). Already-done tasks are marked for resume.
func (s *Server) runMission(projectID, missionID, uid string, maxRetries int) {
	ctx, cancel := context.WithCancel(context.Background())
	defer s.activeMissions.Add(-1) // always release the concurrency slot reserved at approval
	s.missionCancels.Store(missionID, cancel)
	defer s.missionCancels.Delete(missionID)

	tasks, err := s.loadMissionTasks(ctx, missionID)
	if err != nil {
		s.logger.Warn("mission: load tasks failed", "err", err, "mission", missionID)
		return
	}
	subs := make([]orchestrator.SubTask, len(tasks))
	for i, t := range tasks {
		subs[i] = orchestrator.SubTask{ID: t.ID, Ordinal: t.Ordinal, Objective: t.Objective}
		if t.Status == "done" {
			subs[i].Done()
		}
	}

	o := &orchestrator.Orchestrator{
		Store: &dbMissionStore{s: s, missionID: missionID},
		Cfg:   orchestrator.Config{MaxRetries: maxRetries},
		Run:   s.subAgentRunner(projectID, uid),
	}
	status, summary := o.Execute(ctx, subs)
	if status == "completed" {
		s.emitNotification(ctx, uid, "agent_mission", "Mission complete",
			"Your agent mission finished successfully.", "", map[string]any{"missionId": missionID})
	} else if status == "failed" {
		s.emitNotification(ctx, uid, "agent_mission", "Mission failed",
			"A sub-task could not be completed.", "", map[string]any{"missionId": missionID})
	}
	_ = summary
}

// subAgentRunner returns a RunSubTask that runs one sub-task as a direct-mode agent run in the
// project workspace and reports Ok when the run finished without erroring (returned a final).
func (s *Server) subAgentRunner(projectID, uid string) orchestrator.RunSubTask {
	return func(ctx context.Context, t orchestrator.SubTask) orchestrator.SubTaskResult {
		provider, rt, ws, apiKey, _, err := s.resolveAgentRunCtx(ctx, projectID, uid, "")
		if err != nil {
			return orchestrator.SubTaskResult{Ok: false, Summary: err.Error()}
		}
		runner := agent.NewRunner(provider, rt, agent.Config{
			WorkspaceID:   ws.ProjectID,
			Mode:          "direct",
			APIKey:        apiKey,
			CheckApp:      checkAppProbe(rt, ws.ProjectID),
			VerifyApp:     s.verifyAppTool(rt, ws.ProjectID),
			PreviewErrors: s.previewErrorsTool(ws.ProjectID),
			PreviewPort:   previewPort(),
			Memory:        &projectMemoryStore{s: s, projectID: ws.ProjectID, userID: uid},
			Skills:        s.loadEnabledSkills(ctx, ws.ProjectID),
			Secrets:       &userSecretVault{s: s, uid: uid},
			GuardCommands: true,
		})
		res, err := runner.Run(ctx, t.Objective, nil)
		if err != nil {
			return orchestrator.SubTaskResult{Ok: false, Summary: err.Error()}
		}
		// A sub-task counts as complete when the agent returned a final answer without erroring.
		return orchestrator.SubTaskResult{Ok: true, Summary: res.Final}
	}
}

// handleStopMission cancels an in-flight mission and marks it stopped.
func (s *Server) handleStopMission(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	missionID := chi.URLParam(r, "missionID")
	// Ownership check via load (404 if not this project's).
	if _, _, err := s.loadMission(r.Context(), projectID, missionID); err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Mission not found")
		return
	} else if err != nil {
		s.fail(w, r, err)
		return
	}
	if cancel, ok := s.missionCancels.Load(missionID); ok {
		cancel.(context.CancelFunc)()
	}
	_, _ = s.pool.Exec(r.Context(), `UPDATE agent_missions SET status='stopped', updated_at=NOW() WHERE id=$1 AND status='running'`, missionID)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
