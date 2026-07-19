# Coding Agent Engine (Autonomy & Orchestration) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Torsor's single-pass ReAct agent into a mission engine that decomposes a goal into ordered sub-tasks, runs them autonomously in the background (each self-verifying, with retry), is resumable, and is governed from the Super Admin page and per-user Settings.

**Architecture:** A new DB-agnostic `internal/orchestrator` package sequences sub-tasks over narrow interfaces (a `RunSubTask` func + a `MissionStore` + ctx cancel), mirroring the existing `internal/agent` design so it is unit-testable with fakes. HTTP handlers plan a mission (existing plan mode), persist it, and — on approval — run the orchestrator in the background (existing background-run pattern), building one real sub-agent `Runner` per sub-task. Governance tables bound the work and expose observability.

**Tech Stack:** Go 1.26 (control plane, chi router, pgx), React 19 + Zustand + Tailwind 4 (frontend), Postgres (idempotent `//go:embed` migrations).

## Global Constraints

- Migrations are **control-plane-only** (apps/api frozen at 0010), idempotent, monotonic; live in `apps/control-plane/internal/migrations/`, auto-applied via `//go:embed *.sql`. Next number is `0017`.
- Every project route enforces per-user ownership via `s.requireOwnedProject(w, r)` (404 on miss); all SQL parameterized.
- Super-admin capabilities live under `src/components/admin/**` and backend `requireRole(auth.RoleSuperAdmin)` (ADR 0012); never gate non-admin UI on the role.
- Frontend uses CSS-variable design tokens (`bg-page`, `text-secondary`, `border-default`, `bg-accent`, …) — **no raw hex** in `src/components/**/*.tsx` (`torsor guard` enforces).
- The orchestrator package must not import the DB or a model — only narrow interfaces (like `internal/agent`).
- Gates before every commit that touches Go: `go build ./...`, `go vet ./...`, `go test ./...`. Frontend: `npm run lint:frontend` (tsc), `npm test`, `npm run build`.
- Response JSON uses camelCase keys (see existing handlers). Helpers available in `internal/server`: `writeJSON`, `writeError`, `decodeJSON`, `s.fail(w,r,err)`, `userID(r)`, `s.pool`, `s.logger`, `s.requireOwnedProject`.

---

## File Structure

**Backend (`apps/control-plane/`):**
- Create `internal/migrations/0017_agent_missions.sql` — the 4 tables.
- Create `internal/orchestrator/orchestrator.go` — sequencing engine (no DB/model).
- Create `internal/orchestrator/orchestrator_test.go` — fakes + unit tests.
- Create `internal/server/mission_handlers.go` — mission types, store methods, plan/approve/list/get/stop handlers, sub-agent factory.
- Create `internal/server/agent_config_handlers.go` — admin engine config + per-user prefs handlers.
- Modify `internal/server/server.go` — register routes.
- Modify `internal/agent/agent.go` — add `RunResult.Mutations` (count of workspace-mutating tool calls) so callers can tell if a run was substantive (reused later; harmless now).

**Frontend (`src/`):**
- Create `src/stores/missionStore.ts` — create/approve/poll/stop, keyed by project.
- Create `src/stores/agentPrefsStore.ts` — load/save per-user agent prefs.
- Create `src/components/admin/tabs/AgentEngineTab.tsx` — global config + all-missions table.
- Modify `src/components/tabs/AgentRunsTab.tsx` — mission progress panel.
- Modify `src/components/tabs/AgentSettingsTab.tsx` — replace mock local state with real prefs.
- Modify the admin tab registry (discover exact file in Task 8) to register AgentEngineTab.

---

## Task 1: Migration 0017 (missions, tasks, engine config, user prefs)

**Files:**
- Create: `apps/control-plane/internal/migrations/0017_agent_missions.sql`

**Interfaces:**
- Produces: tables `agent_missions`, `agent_mission_tasks`, `agent_engine_config` (single row), `user_agent_prefs`.

- [ ] **Step 1: Write the migration**

```sql
-- 0017: coding agent engine — missions decompose a goal into ordered sub-tasks the engine
-- runs autonomously (plan → approve → sequential execution with verify/retry → report).
-- Plus governance: a single-row engine config (admin caps) and per-user agent prefs.
-- Ownership flows through the owning project. Control-plane-only (apps/api frozen at 0010).
CREATE TABLE IF NOT EXISTS agent_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'planning',
    -- planning | awaiting_approval | running | completed | failed | stopped
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_missions_project_created
  ON agent_missions(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_mission_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES agent_missions(id) ON DELETE CASCADE,
  ordinal INT NOT NULL,
  objective TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending | running | done | failed | skipped
  attempts INT NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_mission_tasks_mission
  ON agent_mission_tasks(mission_id, ordinal);

CREATE TABLE IF NOT EXISTS agent_engine_config (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_model TEXT NOT NULL DEFAULT '',
  max_tasks INT NOT NULL DEFAULT 8,
  max_retries INT NOT NULL DEFAULT 2,
  max_concurrent_missions INT NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO agent_engine_config (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_agent_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_autonomy VARCHAR(16) NOT NULL DEFAULT 'approve_plan', -- approve_plan | autonomous
  max_steps INT NOT NULL DEFAULT 12,
  preferred_model TEXT NOT NULL DEFAULT '',
  planning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Verify it compiles/embeds and applies idempotently**

Run: `cd apps/control-plane && go build ./... && go test ./internal/migrations/ 2>&1 | tail -3`
Expected: build succeeds (migrations embed via `//go:embed *.sql`; no test files is fine — `?   ... [no test files]`).

- [ ] **Step 3: Commit**

```bash
git add apps/control-plane/internal/migrations/0017_agent_missions.sql
git commit -m "feat(engine): migration 0017 — agent missions, tasks, engine config, user prefs"
```

---

## Task 2: `RunResult.Mutations` in the agent loop

**Files:**
- Modify: `apps/control-plane/internal/agent/agent.go`
- Test: `apps/control-plane/internal/agent/agent_test.go`

**Interfaces:**
- Produces: `RunResult.Mutations int` — number of `write_file`/`run` tool calls in a run (lets a caller tell a substantive run from read-only). Used by the sub-agent factory's success signal in Task 6.

- [ ] **Step 1: Write the failing test** (append to `agent_test.go`)

```go
func TestRunResultCountsMutations(t *testing.T) {
	model := &scriptedModel{responses: []string{
		`{"thought":"look","action":{"tool":"list_files","args":{"path":""}}}`,
		`{"thought":"write","action":{"tool":"write_file","args":{"path":"a.txt","content":"hi"}}}`,
		`{"thought":"run","action":{"tool":"run","args":{"command":"echo hi"}}}`,
		`{"thought":"done","final":"done"}`,
	}}
	res, err := NewRunner(model, newMemWorkspace(), Config{WorkspaceID: "p1"}).Run(context.Background(), "t", nil)
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if res.Mutations != 2 {
		t.Errorf("Mutations = %d, want 2 (write_file + run)", res.Mutations)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/control-plane && go test ./internal/agent/ -run TestRunResultCountsMutations -v`
Expected: FAIL (`res.Mutations` undefined → compile error).

- [ ] **Step 3: Add the field and increment it**

In `agent.go`, add to the `RunResult` struct (next to `Steps`):

```go
	Mutations int      // count of workspace-mutating tool calls (write_file / run) this run
```

In `Run`, immediately after the existing `obs := r.runTool(ctx, *st.Action)` line, add:

```go
		if st.Action.Tool == "write_file" || st.Action.Tool == "run" {
			result.Mutations++
		}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/control-plane && go test ./internal/agent/ -v 2>&1 | tail -5`
Expected: PASS (all agent tests).

- [ ] **Step 5: Commit**

```bash
git add apps/control-plane/internal/agent/agent.go apps/control-plane/internal/agent/agent_test.go
git commit -m "feat(agent): RunResult.Mutations counts workspace-mutating tool calls"
```

---

## Task 3: `internal/orchestrator` core + unit tests (TDD)

**Files:**
- Create: `apps/control-plane/internal/orchestrator/orchestrator.go`
- Test: `apps/control-plane/internal/orchestrator/orchestrator_test.go`

**Interfaces:**
- Produces:
  - `type SubTask struct { ID string; Ordinal int; Objective string }`
  - `type SubTaskResult struct { Ok bool; Summary string }`
  - `type RunSubTask func(ctx context.Context, t SubTask) SubTaskResult` — runs one sub-task to a verified end; `Ok=false` means it could not complete/verify.
  - `type Store interface { SetTaskStatus(ctx context.Context, taskID, status string, attempts int, result string) error; SetMissionStatus(ctx context.Context, status, summary string) error }`
  - `type Config struct { MaxRetries int }`
  - `type Orchestrator struct { Run RunSubTask; Store Store; Cfg Config }`
  - `func (o *Orchestrator) Execute(ctx context.Context, tasks []SubTask) (status string, summary string)` — returns final mission status (`completed`/`failed`/`stopped`) and a merged summary. Skips tasks already `done` (resume). Consumes `SubTask` list (pre-persisted `pending`/`done`).

- [ ] **Step 1: Write the failing tests**

```go
package orchestrator

import (
	"context"
	"errors"
	"testing"
)

// fakeStore records status transitions.
type fakeStore struct {
	taskCalls    []string // "taskID:status:attempts"
	missionFinal string
}

func (f *fakeStore) SetTaskStatus(_ context.Context, id, status string, attempts int, _ string) error {
	f.taskCalls = append(f.taskCalls, id+":"+status)
	return nil
}
func (f *fakeStore) SetMissionStatus(_ context.Context, status, _ string) error {
	f.missionFinal = status
	return nil
}

func tasks(objs ...string) []SubTask {
	out := make([]SubTask, len(objs))
	for i, o := range objs {
		out[i] = SubTask{ID: "t" + string(rune('1'+i)), Ordinal: i, Objective: o}
	}
	return out
}

func TestExecuteAllPass(t *testing.T) {
	store := &fakeStore{}
	o := &Orchestrator{
		Store: store,
		Cfg:   Config{MaxRetries: 2},
		Run:   func(_ context.Context, s SubTask) SubTaskResult { return SubTaskResult{Ok: true, Summary: "did " + s.Objective} },
	}
	status, summary := o.Execute(context.Background(), tasks("a", "b"))
	if status != "completed" {
		t.Errorf("status = %q, want completed", status)
	}
	if store.missionFinal != "completed" {
		t.Errorf("mission final = %q, want completed", store.missionFinal)
	}
	if summary == "" {
		t.Error("expected a non-empty merged summary")
	}
}

func TestExecuteRetriesThenPasses(t *testing.T) {
	store := &fakeStore{}
	calls := 0
	o := &Orchestrator{
		Store: store,
		Cfg:   Config{MaxRetries: 2},
		Run: func(_ context.Context, _ SubTask) SubTaskResult {
			calls++
			return SubTaskResult{Ok: calls >= 2} // fail once, then pass
		},
	}
	status, _ := o.Execute(context.Background(), tasks("a"))
	if status != "completed" {
		t.Errorf("status = %q, want completed", status)
	}
	if calls != 2 {
		t.Errorf("Run called %d times, want 2 (1 retry)", calls)
	}
}

func TestExecuteFailsAfterExhaustingRetries(t *testing.T) {
	store := &fakeStore{}
	o := &Orchestrator{
		Store: store,
		Cfg:   Config{MaxRetries: 1},
		Run:   func(_ context.Context, _ SubTask) SubTaskResult { return SubTaskResult{Ok: false} },
	}
	status, _ := o.Execute(context.Background(), tasks("a", "b"))
	if status != "failed" {
		t.Errorf("status = %q, want failed", status)
	}
	// Second task must NOT run after the first fails.
	for _, c := range store.taskCalls {
		if c == "t2:running" {
			t.Error("t2 ran after t1 failed; should stop")
		}
	}
}

func TestExecuteResumesSkippingDone(t *testing.T) {
	store := &fakeStore{}
	ran := []string{}
	o := &Orchestrator{
		Store: store,
		Cfg:   Config{MaxRetries: 1},
		Run: func(_ context.Context, s SubTask) SubTaskResult {
			ran = append(ran, s.ID)
			return SubTaskResult{Ok: true}
		},
	}
	ts := tasks("a", "b", "c")
	ts[0].done = true // pre-done (resume)
	o.Execute(context.Background(), ts)
	if len(ran) != 2 || ran[0] != "t2" {
		t.Errorf("ran = %v, want [t2 t3] (t1 skipped)", ran)
	}
}

func TestExecuteStopsOnCancel(t *testing.T) {
	store := &fakeStore{}
	ctx, cancel := context.WithCancel(context.Background())
	o := &Orchestrator{
		Store: store,
		Cfg:   Config{MaxRetries: 1},
		Run: func(_ context.Context, _ SubTask) SubTaskResult {
			cancel() // cancel mid-mission
			return SubTaskResult{Ok: true}
		},
	}
	status, _ := o.Execute(ctx, tasks("a", "b"))
	if status != "stopped" {
		t.Errorf("status = %q, want stopped", status)
	}
	_ = errors.New // keep import tidy if unused elsewhere
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/control-plane && go test ./internal/orchestrator/ -v`
Expected: FAIL to compile (package/types not defined; `SubTask.done` field referenced).

- [ ] **Step 3: Write the implementation**

```go
// Package orchestrator sequences a mission's sub-tasks. It is deliberately DB- and
// model-agnostic (like internal/agent): it depends only on a RunSubTask func, a Store, and
// ctx cancellation, so it is unit-tested with fakes. Sub-tasks run one at a time in the
// project's shared workspace; each is retried up to MaxRetries; a task that never succeeds
// fails the mission (no blind continuation). Already-done tasks are skipped (resume).
package orchestrator

import (
	"context"
	"fmt"
	"strings"
)

type SubTask struct {
	ID       string
	Ordinal  int
	Objective string
	done     bool // true when already completed in a prior run (resume)
}

// Done marks a sub-task as already completed (used when resuming a mission).
func (t *SubTask) Done() { t.done = true }

type SubTaskResult struct {
	Ok      bool
	Summary string
}

// RunSubTask executes one sub-task to a verified end. Ok=false means it could not complete.
type RunSubTask func(ctx context.Context, t SubTask) SubTaskResult

// Store persists progress so a mission is resumable and observable.
type Store interface {
	SetTaskStatus(ctx context.Context, taskID, status string, attempts int, result string) error
	SetMissionStatus(ctx context.Context, status, summary string) error
}

type Config struct {
	MaxRetries int // additional attempts after the first (0 = one attempt)
}

type Orchestrator struct {
	Run   RunSubTask
	Store Store
	Cfg   Config
}

// Execute runs tasks in order, skipping ones already done. Returns the final mission status
// ("completed" | "failed" | "stopped") and a merged summary. Persists each transition.
func (o *Orchestrator) Execute(ctx context.Context, ts []SubTask) (string, string) {
	var summary strings.Builder
	for i := range ts {
		t := ts[i]
		if t.done {
			continue
		}
		if err := ctx.Err(); err != nil {
			return o.finish(ctx, "stopped", summary.String())
		}
		_ = o.Store.SetTaskStatus(ctx, t.ID, "running", t.attemptsSoFar(), "")

		ok, attempts, result := o.runWithRetry(ctx, t)
		if err := ctx.Err(); err != nil {
			_ = o.Store.SetTaskStatus(ctx, t.ID, "pending", attempts, "")
			return o.finish(ctx, "stopped", summary.String())
		}
		if !ok {
			_ = o.Store.SetTaskStatus(ctx, t.ID, "failed", attempts, result)
			return o.finish(ctx, "failed", summary.String())
		}
		_ = o.Store.SetTaskStatus(ctx, t.ID, "done", attempts, result)
		fmt.Fprintf(&summary, "%d. %s — %s\n", t.Ordinal+1, t.Objective, result)
	}
	return o.finish(ctx, "completed", summary.String())
}

// runWithRetry attempts a task up to 1+MaxRetries times, stopping early on cancel.
func (o *Orchestrator) runWithRetry(ctx context.Context, t SubTask) (bool, int, string) {
	attempts := 0
	for attempt := 0; attempt <= o.Cfg.MaxRetries; attempt++ {
		if ctx.Err() != nil {
			return false, attempts, ""
		}
		attempts++
		res := o.Run(ctx, t)
		if res.Ok {
			return true, attempts, res.Summary
		}
	}
	return false, attempts, "sub-task did not complete after retries"
}

func (o *Orchestrator) finish(ctx context.Context, status, summary string) (string, string) {
	_ = o.Store.SetMissionStatus(ctx, status, summary)
	return status, summary
}

// attemptsSoFar is 0 for a fresh task (kept as a hook for future per-task attempt carry-over).
func (t SubTask) attemptsSoFar() int { return 0 }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/control-plane && go test ./internal/orchestrator/ -v`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Vet + commit**

```bash
cd apps/control-plane && go vet ./internal/orchestrator/
git add apps/control-plane/internal/orchestrator/
git commit -m "feat(engine): orchestrator core — sequential sub-tasks with verify/retry, resume, stop"
```

---

## Task 4: Mission store + types + read handlers

**Files:**
- Create: `apps/control-plane/internal/server/mission_handlers.go` (types, scan, store methods, list/get handlers only in this task)
- Modify: `apps/control-plane/internal/server/server.go` (register the two GET routes)

**Interfaces:**
- Consumes: `s.requireOwnedProject`, `userID(r)`, `s.pool`, `writeJSON`, `s.fail`, `chi.URLParam`.
- Produces:
  - `type mission struct { ID, ProjectID, Goal, Status, Summary string; Plan []string; CreatedAt, UpdatedAt time.Time }`
  - `type missionTask struct { ID string; Ordinal int; Objective, Status string; Attempts int; Result string; UpdatedAt time.Time }`
  - `func (s *Server) loadMission(ctx, projectID, missionID) (mission, []missionTask, error)` — used by Task 5/6.
  - Handlers `handleListMissions`, `handleGetMission`.

- [ ] **Step 1: Write the types, scan, and read handlers**

```go
package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

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
```

- [ ] **Step 2: Register the read routes** in `server.go` (inside the authenticated group, near the project subroutes, e.g. after the memories/skills routes):

```go
			// Coding agent engine — missions
			r.Get("/projects/{projectID}/agent/missions", s.handleListMissions)
			r.Get("/projects/{projectID}/agent/missions/{missionID}", s.handleGetMission)
```

- [ ] **Step 3: Build & vet**

Run: `cd apps/control-plane && go build ./... && go vet ./...`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add apps/control-plane/internal/server/mission_handlers.go apps/control-plane/internal/server/server.go
git commit -m "feat(engine): mission types, store, and read handlers (list/get)"
```

---

## Task 5: Plan a mission (POST /agent/missions)

**Files:**
- Modify: `apps/control-plane/internal/server/mission_handlers.go`
- Modify: `apps/control-plane/internal/server/server.go`

**Interfaces:**
- Consumes: the existing planner — a `Runner` in plan mode. Look at `agent_handlers.go` for how a `Runner` is built (workspace/model resolution, `agent.Config{Mode:"plan"}`, `runner.Run`). Reuse that resolution. `RunResult.Plan []string` carries the proposed steps.
- Produces: `handleCreateMission` — inserts an `agent_missions` row (`awaiting_approval`) + one `agent_mission_tasks` row per proposed step, returns `{mission, tasks}`.

- [ ] **Step 1: Implement the planning handler** (append to `mission_handlers.go`)

```go
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
```

- [ ] **Step 2: Implement `planMissionGoal`** (append to `mission_handlers.go`). Open `internal/server/agent_handlers.go` and copy the exact workspace+provider resolution used before `agent.NewRunner(...)` (functions like `s.loadWorkspace`/`s.pickRuntime`, provider selection, `s.providerAPIKey`). Reproduce it here with `Mode:"plan"`:

```go
// planMissionGoal runs the agent in plan mode over the goal and returns the proposed ordered
// objectives. Mirrors the Runner construction in handleAgentStream (agent_handlers.go).
func (s *Server) planMissionGoal(ctx context.Context, r *http.Request, projectID, goal string) ([]string, error) {
	// NOTE FOR IMPLEMENTER: replicate the workspace + model-provider resolution from
	// handleAgentStream in agent_handlers.go (loadWorkspace/pickRuntime + provider + apiKey).
	// Then build a plan-mode runner:
	provider, rt, ws, apiKey, providerName, err := s.resolveAgentRun(ctx, r, projectID) // extract this helper from agent_handlers.go in Step 3
	if err != nil {
		return nil, err
	}
	_ = providerName
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
```

- [ ] **Step 3: Extract `resolveAgentRun` from `agent_handlers.go`** so both the stream handler and the planner share one code path (DRY). In `agent_handlers.go`, pull the existing resolution block (workspace load, runtime pick, provider selection, api key) into:

```go
// resolveAgentRun resolves everything a Runner needs for an owned project: the model provider,
// the workspace runtime, the workspace row, the per-user API key, and the provider name.
// Extracted so handleAgentStream and mission planning share one path.
func (s *Server) resolveAgentRun(ctx context.Context, r *http.Request, projectID string) (agent.Model, plugin.WorkspaceRuntime, workspace, string, string, error) {
	// ... move the existing resolution logic here, returning the tuple ...
}
```

Then update `handleAgentStream` to call `resolveAgentRun` instead of its inline block. Keep behavior identical (run `go test ./internal/server/` after).

- [ ] **Step 4: Register the route** in `server.go`:

```go
			r.Post("/projects/{projectID}/agent/missions", s.handleCreateMission)
```

- [ ] **Step 5: Build, vet, test**

Run: `cd apps/control-plane && go build ./... && go vet ./... && go test ./internal/server/ 2>&1 | tail -3`
Expected: builds clean; existing server tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/control-plane/internal/server/
git commit -m "feat(engine): plan a mission via agent plan mode (POST /agent/missions)"
```

---

## Task 6: Approve + background execution + stop

**Files:**
- Modify: `apps/control-plane/internal/server/mission_handlers.go`
- Modify: `apps/control-plane/internal/server/server.go`

**Interfaces:**
- Consumes: `orchestrator.Orchestrator/SubTask/Store/Config`, `resolveAgentRun` (Task 5), `agent.NewRunner`, `RunResult.Mutations` (Task 2), `emitNotification` (existing).
- Produces: `handleApproveMission`, `handleStopMission`, a `dbMissionStore` implementing `orchestrator.Store`, an in-memory cancel registry `s.missionCancels`.

- [ ] **Step 1: Add a cancel registry to the Server** — in the file where `Server` is defined (`server.go` struct), add a field and init it in the constructor:

```go
	missionCancels sync.Map // missionID -> context.CancelFunc (in-process; single backend today)
```

(Import `sync` where the struct lives if not already.)

- [ ] **Step 2: Implement the DB store adapter** (append to `mission_handlers.go`)

```go
// dbMissionStore adapts the missions tables to orchestrator.Store for one mission.
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
```

- [ ] **Step 3: Implement approve (kicks off background execution)** (append to `mission_handlers.go`)

```go
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

	// Load engine caps.
	cfg := s.loadEngineConfig(r.Context()) // Task 7
	if !cfg.Enabled {
		writeError(w, http.StatusServiceUnavailable, "The agent engine is disabled")
		return
	}

	// Move to running and launch the orchestrator in the background.
	_, _ = s.pool.Exec(r.Context(), `UPDATE agent_missions SET status='running', updated_at=NOW() WHERE id=$1`, m.ID)

	uid := userID(r)
	go s.runMission(projectID, m.ID, uid, cfg)

	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "status": "running"})
}

// runMission executes a mission to completion in the background. Detached context so it
// survives the request; cancelable via the mission cancel registry (stop).
func (s *Server) runMission(projectID, missionID, uid string, cfg engineConfig) {
	ctx, cancel := context.WithCancel(context.Background())
	s.missionCancels.Store(missionID, cancel)
	defer s.missionCancels.Delete(missionID)

	// Reload tasks; build orchestrator SubTasks, marking done ones for resume.
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
		Cfg:   orchestrator.Config{MaxRetries: cfg.MaxRetries},
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
// project workspace and reports Ok when the run finished and did real work (or produced a final).
func (s *Server) subAgentRunner(projectID, uid string) orchestrator.RunSubTask {
	return func(ctx context.Context, t orchestrator.SubTask) orchestrator.SubTaskResult {
		provider, rt, ws, apiKey, _, err := s.resolveAgentRunCtx(ctx, projectID, uid) // ctx variant of resolveAgentRun
		if err != nil {
			return orchestrator.SubTaskResult{Ok: false, Summary: err.Error()}
		}
		runner := agent.NewRunner(provider, rt, agent.Config{
			WorkspaceID: ws.ProjectID,
			Mode:        "direct",
			APIKey:      apiKey,
			CheckApp:    checkAppProbe(rt, ws.ProjectID),
			PreviewPort: previewPort(),
			Memory:      &projectMemoryStore{s: s, projectID: ws.ProjectID, userID: uid},
			Skills:      s.loadEnabledSkills(ctx, ws.ProjectID),
		})
		res, err := runner.Run(ctx, t.Objective, nil)
		if err != nil {
			return orchestrator.SubTaskResult{Ok: false, Summary: err.Error()}
		}
		// A sub-task counts as complete when the agent returned a final answer without erroring.
		return orchestrator.SubTaskResult{Ok: true, Summary: res.Final}
	}
}

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
```

- [ ] **Step 4: Add `resolveAgentRunCtx`** — a context-only variant of `resolveAgentRun` (Task 5) that takes `(ctx, projectID, uid)` instead of `*http.Request`, since the background runner has no request. Factor the shared body so both call it. (The request variant reads `userID(r)`; the ctx variant takes `uid` directly.)

- [ ] **Step 5: Register routes** in `server.go`:

```go
			r.Post("/projects/{projectID}/agent/missions/{missionID}/approve", s.handleApproveMission)
			r.Post("/projects/{projectID}/agent/missions/{missionID}/stop", s.handleStopMission)
```

- [ ] **Step 6: Build, vet, test**

Run: `cd apps/control-plane && go build ./... && go vet ./... && go test ./... 2>&1 | tail -6`
Expected: builds clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/control-plane/internal/server/
git commit -m "feat(engine): approve → background orchestrated execution + stop"
```

---

## Task 7: Engine config (admin) + per-user prefs

**Files:**
- Create: `apps/control-plane/internal/server/agent_config_handlers.go`
- Modify: `apps/control-plane/internal/server/server.go`

**Interfaces:**
- Consumes: `requireRole(auth.RoleSuperAdmin)` middleware (see how admin routes are grouped in `server.go`), `s.pool`, `userID(r)`.
- Produces:
  - `type engineConfig struct { Enabled bool; DefaultModel string; MaxTasks, MaxRetries, MaxConcurrentMissions int }`
  - `func (s *Server) loadEngineConfig(ctx) engineConfig` (used by Task 6).
  - Handlers: `handleGetEngineConfig`, `handleUpdateEngineConfig`, `handleAdminListMissions`, `handleGetAgentPrefs`, `handleUpdateAgentPrefs`.

- [ ] **Step 1: Implement config + prefs handlers**

```go
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
```

- [ ] **Step 2: Register routes** in `server.go` — admin ones inside the existing `requireRole(super_admin)` group (find it near `/admin/stats`), prefs inside the authenticated group:

```go
			// inside the super-admin group:
			r.Get("/admin/agent/config", s.handleGetEngineConfig)
			r.Patch("/admin/agent/config", s.handleUpdateEngineConfig)
			r.Get("/admin/agent/missions", s.handleAdminListMissions)
			// inside the authenticated group:
			r.Get("/me/agent-prefs", s.handleGetAgentPrefs)
			r.Patch("/me/agent-prefs", s.handleUpdateAgentPrefs)
```

- [ ] **Step 3: Build, vet, test**

Run: `cd apps/control-plane && go build ./... && go vet ./... && go test ./... 2>&1 | tail -4`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/control-plane/internal/server/
git commit -m "feat(engine): admin engine config + observability + per-user agent prefs"
```

---

## Task 8: Frontend — mission store + progress + settings + admin

**Files:**
- Create: `src/stores/missionStore.ts`, `src/stores/agentPrefsStore.ts`
- Create: `src/components/admin/tabs/AgentEngineTab.tsx`
- Modify: `src/components/tabs/AgentRunsTab.tsx`, `src/components/tabs/AgentSettingsTab.tsx`
- Modify: admin tab registry (find via `grep -rn "AdminRevenueTab\|registerAdminTab\|adminTabs" src/components/admin`)

**Interfaces:**
- Consumes: `apiRequest` from `../lib/api` (pattern: see `memoryStore.ts`), `useProjectStore().activeProjectId`.
- Produces: `useMissionStore` (`createMission`, `approveMission`, `fetchMission`, `stopMission`, `byProject`), `useAgentPrefsStore` (`fetch`, `save`).

- [ ] **Step 1: Write `missionStore.ts`**

```ts
import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export interface MissionTask {
  id: string; ordinal: number; objective: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  attempts: number; result: string;
}
export interface Mission {
  id: string; projectId: string; goal: string;
  status: 'planning' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'stopped';
  plan: string[]; summary: string;
}

interface MissionState {
  current: { mission: Mission; tasks: MissionTask[] } | null;
  loading: boolean;
  error: string | null;
  createMission: (projectId: string, goal: string) => Promise<void>;
  approveMission: (projectId: string, missionId: string, plan?: string[]) => Promise<void>;
  fetchMission: (projectId: string, missionId: string) => Promise<void>;
  stopMission: (projectId: string, missionId: string) => Promise<void>;
}

export const useMissionStore = create<MissionState>()((set, get) => ({
  current: null,
  loading: false,
  error: null,
  createMission: async (projectId, goal) => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ mission: Mission; tasks: MissionTask[] }>(
        `/api/v1/projects/${projectId}/agent/missions`,
        { method: 'POST', auth: true, body: JSON.stringify({ goal }) });
      set({ current: res, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to plan mission' });
    }
  },
  approveMission: async (projectId, missionId, plan) => {
    await apiRequest(`/api/v1/projects/${projectId}/agent/missions/${missionId}/approve`,
      { method: 'POST', auth: true, body: JSON.stringify(plan ? { plan } : {}) });
    await get().fetchMission(projectId, missionId);
  },
  fetchMission: async (projectId, missionId) => {
    const res = await apiRequest<{ mission: Mission; tasks: MissionTask[] }>(
      `/api/v1/projects/${projectId}/agent/missions/${missionId}`, { auth: true });
    set({ current: res });
  },
  stopMission: async (projectId, missionId) => {
    await apiRequest(`/api/v1/projects/${projectId}/agent/missions/${missionId}/stop`,
      { method: 'POST', auth: true });
    await get().fetchMission(projectId, missionId);
  },
}));
```

- [ ] **Step 2: Write `agentPrefsStore.ts`**

```ts
import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export interface AgentPrefs {
  defaultAutonomy: 'approve_plan' | 'autonomous';
  maxSteps: number;
  preferredModel: string;
  planningEnabled: boolean;
}
const DEFAULTS: AgentPrefs = { defaultAutonomy: 'approve_plan', maxSteps: 12, preferredModel: '', planningEnabled: true };

interface PrefsState {
  prefs: AgentPrefs;
  loading: boolean;
  fetch: () => Promise<void>;
  save: (updates: Partial<AgentPrefs>) => Promise<void>;
}

export const useAgentPrefsStore = create<PrefsState>()((set, get) => ({
  prefs: DEFAULTS,
  loading: false,
  fetch: async () => {
    set({ loading: true });
    try {
      const p = await apiRequest<AgentPrefs>('/api/v1/me/agent-prefs', { auth: true });
      set({ prefs: { ...DEFAULTS, ...p }, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  save: async (updates) => {
    const next = { ...get().prefs, ...updates };
    set({ prefs: next });
    await apiRequest('/api/v1/me/agent-prefs', { method: 'PATCH', auth: true, body: JSON.stringify(next) });
  },
}));
```

- [ ] **Step 3: Mission progress panel in `AgentRunsTab.tsx`** — add a "Missions" section: a goal input that calls `createMission`, an approval step (shows proposed `tasks`, Approve button → `approveMission`), and a live checklist that polls `fetchMission` every 3s while `status==='running'`. Use existing tokens and the tab's existing layout. Minimal addition (do not rewrite the runs list). Example block to insert near the top of the returned JSX:

```tsx
// inside AgentRunsTab component body:
const activeProjectId = useProjectStore((s) => s.activeProjectId);
const { current, createMission, approveMission, fetchMission, stopMission } = useMissionStore();
const [goal, setGoal] = useState('');
useEffect(() => {
  if (current?.mission.status === 'running' && activeProjectId) {
    const t = setInterval(() => void fetchMission(activeProjectId, current.mission.id), 3000);
    return () => clearInterval(t);
  }
}, [current?.mission.status, current?.mission.id, activeProjectId, fetchMission]);
```

```tsx
{/* Mission engine block */}
<div className="border border-default rounded-xl bg-surface p-4 mb-4">
  <div className="flex items-center gap-2 mb-3">
    <Sparkles size={14} className="text-accent" />
    <span className="text-xs font-bold text-primary">Agent Mission</span>
  </div>
  {!current && (
    <div className="flex gap-2">
      <input value={goal} onChange={(e) => setGoal(e.target.value)}
        placeholder="Describe a multi-step goal…"
        className="flex-1 bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50" />
      <button onClick={() => activeProjectId && goal.trim() && void createMission(activeProjectId, goal.trim())}
        className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg">Plan</button>
    </div>
  )}
  {current && (
    <div className="space-y-2">
      <p className="text-sm text-primary font-medium">{current.mission.goal}</p>
      <ul className="space-y-1">
        {current.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-xs text-secondary">
            <span className={
              t.status === 'done' ? 'text-success' :
              t.status === 'failed' ? 'text-error' :
              t.status === 'running' ? 'text-accent' : 'text-tertiary'
            }>●</span>
            <span className="flex-1">{t.ordinal + 1}. {t.objective}</span>
            <span className="uppercase tracking-wider text-tertiary">{t.status}</span>
          </li>
        ))}
      </ul>
      {current.mission.status === 'awaiting_approval' && (
        <button onClick={() => activeProjectId && void approveMission(activeProjectId, current.mission.id)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg">Approve & run</button>
      )}
      {current.mission.status === 'running' && (
        <button onClick={() => activeProjectId && void stopMission(activeProjectId, current.mission.id)}
          className="px-4 py-2 border border-default text-primary text-sm font-bold rounded-lg hover:bg-elevated">Stop</button>
      )}
      {current.mission.summary && <p className="text-xs text-secondary whitespace-pre-wrap">{current.mission.summary}</p>}
    </div>
  )}
</div>
```

Add imports at the top of the file: `import { useMissionStore } from '../../stores/missionStore';`, `import { useProjectStore } from '../../stores/projectStore';`, and ensure `Sparkles` is imported from `lucide-react` and `useState, useEffect` from React.

- [ ] **Step 4: De-mock `AgentSettingsTab.tsx`** — replace the local `useState` defaults with `useAgentPrefsStore`. On mount `void fetch()`; bind the "Planning enabled" toggle and a "Max steps" number input and an autonomy select (`approve_plan`/`autonomous`) to `prefs`, calling `save({...})` on change. Keep the existing visual structure/tokens; remove state that no longer maps to a real pref (or leave purely-visual controls clearly non-persisted). Minimal wiring:

```tsx
const { prefs, fetch, save } = useAgentPrefsStore();
useEffect(() => { void fetch(); }, [fetch]);
// e.g. planning toggle:
<Switch.Root checked={prefs.planningEnabled} onCheckedChange={(v) => void save({ planningEnabled: v })} .../>
```

- [ ] **Step 5: Admin `AgentEngineTab.tsx`** — a form bound to `/api/v1/admin/agent/config` (GET on mount, PATCH on save) with number inputs for `maxTasks`, `maxRetries`, `maxConcurrentMissions`, an `enabled` toggle, `defaultModel` text; plus a read-only table from `/api/v1/admin/agent/missions` (goal, status, updatedAt). Follow an existing admin tab (`src/components/admin/tabs/*`) for layout/tokens. Register it in the admin tab registry discovered via grep in the Files block.

```tsx
import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';

interface Cfg { enabled: boolean; defaultModel: string; maxTasks: number; maxRetries: number; maxConcurrentMissions: number; }

export default function AgentEngineTab() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [missions, setMissions] = useState<any[]>([]);
  useEffect(() => {
    void apiRequest<Cfg>('/api/v1/admin/agent/config', { auth: true }).then(setCfg);
    void apiRequest<{ items: any[] }>('/api/v1/admin/agent/missions', { auth: true }).then((r) => setMissions(r.items));
  }, []);
  const save = async () => { if (cfg) setCfg(await apiRequest<Cfg>('/api/v1/admin/agent/config', { method: 'PATCH', auth: true, body: JSON.stringify(cfg) })); };
  if (!cfg) return <div className="p-6 text-secondary text-sm">Loading…</div>;
  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h2 className="text-sm font-bold text-primary">Agent Engine</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs text-secondary">Max sub-tasks
          <input type="number" value={cfg.maxTasks} onChange={(e) => setCfg({ ...cfg, maxTasks: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Max retries
          <input type="number" value={cfg.maxRetries} onChange={(e) => setCfg({ ...cfg, maxRetries: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Max concurrent missions
          <input type="number" value={cfg.maxConcurrentMissions} onChange={(e) => setCfg({ ...cfg, maxConcurrentMissions: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Default model
          <input value={cfg.defaultModel} onChange={(e) => setCfg({ ...cfg, defaultModel: e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
      </div>
      <button onClick={() => void save()} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg">Save</button>
      <div>
        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Recent missions (all users)</h3>
        <ul className="space-y-1">
          {missions.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-xs text-secondary">
              <span className="flex-1 truncate">{m.goal}</span>
              <span className="uppercase tracking-wider text-tertiary">{m.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Gates**

Run: `npm run lint:frontend && npm test && npm run build && torsor guard`
Expected: tsc clean, vitest passes, build succeeds, guard reports no drift.

- [ ] **Step 7: Commit**

```bash
git add src/stores/missionStore.ts src/stores/agentPrefsStore.ts src/components/admin/tabs/AgentEngineTab.tsx src/components/tabs/AgentRunsTab.tsx src/components/tabs/AgentSettingsTab.tsx
git commit -m "feat(engine): frontend — mission progress, real agent settings, admin engine tab"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §4 flow → Tasks 5/6; §5 tables → Task 1; §6.1 orchestrator → Task 3; §6.2 handlers → Tasks 4–6; §6.3 admin → Task 7 + Task 8 Step 5; §6.4 prefs → Task 7 + Task 8 Step 4; §7 frontend → Task 8; §8 gates → each task's build/test steps + Task 8 Step 6. `RunResult.Mutations` (§6.1 substantive signal) → Task 2.
- **Known implementer judgement calls (explicit, not placeholders):** Tasks 5–6 require extracting `resolveAgentRun`/`resolveAgentRunCtx` from `agent_handlers.go`; the exact resolution lines live there and must be moved verbatim (the plan names the tuple they must return). This is a real refactor, not a TBD.
- **Type consistency:** `orchestrator.SubTask{ID,Ordinal,Objective,done}`, `SubTaskResult{Ok,Summary}`, `Store.SetTaskStatus/SetMissionStatus`, `engineConfig`, `agentPrefs`, `Mission`/`MissionTask` match across tasks.
- **Scope:** sequential-only; no reflection; autonomy fixed to approve_plan (autonomous stored, not acted on) — consistent with spec §10.
