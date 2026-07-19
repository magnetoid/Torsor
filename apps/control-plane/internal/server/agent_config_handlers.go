package server

import (
	"context"
	"net/http"

	"github.com/jackc/pgx/v5"
)

type engineConfig struct {
	Enabled               bool   `json:"enabled"`
	DefaultModel          string `json:"defaultModel"`
	MaxTasks              int    `json:"maxTasks"`
	MaxRetries            int    `json:"maxRetries"`
	MaxConcurrentMissions int    `json:"maxConcurrentMissions"`
}

// loadEngineConfig reads the single-row config; returns safe defaults on any error so the
// engine never wedges on a config read.
func (s *Server) loadEngineConfig(ctx context.Context) engineConfig {
	c := engineConfig{Enabled: true, MaxTasks: 8, MaxRetries: 2, MaxConcurrentMissions: 2}
	_ = s.pool.QueryRow(ctx,
		`SELECT enabled, default_model, max_tasks, max_retries, max_concurrent_missions
		   FROM agent_engine_config WHERE id = TRUE`).
		Scan(&c.Enabled, &c.DefaultModel, &c.MaxTasks, &c.MaxRetries, &c.MaxConcurrentMissions)
	return c
}

func (s *Server) handleGetEngineConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.loadEngineConfig(r.Context()))
}

func (s *Server) handleUpdateEngineConfig(w http.ResponseWriter, r *http.Request) {
	var b engineConfig
	if err := decodeJSON(r, &b); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if b.MaxTasks < 1 {
		b.MaxTasks = 1
	}
	if b.MaxRetries < 0 {
		b.MaxRetries = 0
	}
	if b.MaxConcurrentMissions < 1 {
		b.MaxConcurrentMissions = 1
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE agent_engine_config SET enabled=$1, default_model=$2, max_tasks=$3, max_retries=$4,
		   max_concurrent_missions=$5, updated_at=NOW() WHERE id=TRUE`,
		b.Enabled, b.DefaultModel, b.MaxTasks, b.MaxRetries, b.MaxConcurrentMissions); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, s.loadEngineConfig(r.Context()))
}

func (s *Server) handleAdminListMissions(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT `+missionCols+` FROM agent_missions ORDER BY created_at DESC LIMIT 100`)
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

type agentPrefs struct {
	DefaultAutonomy string `json:"defaultAutonomy"`
	MaxSteps        int    `json:"maxSteps"`
	PreferredModel  string `json:"preferredModel"`
	PlanningEnabled bool   `json:"planningEnabled"`
}

func (s *Server) handleGetAgentPrefs(w http.ResponseWriter, r *http.Request) {
	p := agentPrefs{DefaultAutonomy: "approve_plan", MaxSteps: 12, PlanningEnabled: true}
	err := s.pool.QueryRow(r.Context(),
		`SELECT default_autonomy, max_steps, preferred_model, planning_enabled
		   FROM user_agent_prefs WHERE user_id = $1`, userID(r)).
		Scan(&p.DefaultAutonomy, &p.MaxSteps, &p.PreferredModel, &p.PlanningEnabled)
	if err != nil && err != pgx.ErrNoRows {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) handleUpdateAgentPrefs(w http.ResponseWriter, r *http.Request) {
	var b agentPrefs
	if err := decodeJSON(r, &b); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if b.DefaultAutonomy != "autonomous" {
		b.DefaultAutonomy = "approve_plan" // v1 honors approve_plan only
	}
	if b.MaxSteps < 1 {
		b.MaxSteps = 12
	}
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO user_agent_prefs (user_id, default_autonomy, max_steps, preferred_model, planning_enabled)
		 VALUES ($1,$2,$3,$4,$5)
		 ON CONFLICT (user_id) DO UPDATE SET default_autonomy=EXCLUDED.default_autonomy,
		   max_steps=EXCLUDED.max_steps, preferred_model=EXCLUDED.preferred_model,
		   planning_enabled=EXCLUDED.planning_enabled, updated_at=NOW()`,
		userID(r), b.DefaultAutonomy, b.MaxSteps, b.PreferredModel, b.PlanningEnabled); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}
