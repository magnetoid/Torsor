# Design: Torsor Coding Agent Engine — Autonomy & Orchestration (v1)

**Date:** 2026-07-19
**Status:** Approved (design) — pending spec review
**Topic:** Upgrade the single-pass ReAct loop into a mission engine that decomposes a goal into
ordered sub-tasks, executes them autonomously in the background with per-task verify/retry,
and is governed from the Super Admin page and per-user Settings.

---

## 1. Motivation

Today Torsor's coding agent (`internal/agent`) is a **single-pass ReAct loop**: one model, one
linear sequence of tool calls (`list_files`/`read_file`/`write_file`/`run`/`check_app`/
`recall`/`remember` + MCP tools), capped by a step budget, with an optional **plan mode**
(propose a plan, pause for approval) and **background-run** persistence (SSE-reattachable,
resumable). It has no notion of a larger goal broken into verified sub-tasks.

This spec turns that loop into a **Coding Agent Engine**: a goal becomes a **Mission** —
`plan → approve → sequential sub-tasks (each self-verifying, with retry) → merge → report` —
that runs to completion in the background and is resumable across restarts.

Self-learning (reflection/auto-learning) was designed separately and is an explicit
**follow-on pillar**, out of scope here (see §10).

## 2. Decisions (locked with the user)

1. **Core axis:** Autonomy & orchestration (not codebase-indexing or reflection-first).
2. **Autonomy gate:** *Approve plan, then autonomous.* The engine proposes a sub-task plan and
   pauses for the user to approve/edit; once approved it runs all sub-tasks to completion in
   the background. A stop control is always live.
3. **Execution model:** *Sequential (v1).* Sub-tasks run one at a time in the project's single
   shared workspace filesystem; each verifies before the next starts. Parallel-with-isolation
   (git worktrees) is a deferred phase; the sub-task interface must not preclude it.
4. **Governance:** Add agent controls to the **Super Admin page** (global, under
   `src/components/admin/**` per ADR 0012) and to **Settings** (per-user prefs; wire the
   currently-mock `AgentSettingsTab` to real persisted values).

## 3. What we build on (verified in-repo)

- `internal/agent`: `Runner` (ReAct loop), `Config{ Mode: "direct"|"plan", Plan []string, ... }`,
  `RunResult`. Plan mode already emits a proposed plan and pauses.
- `agent_handlers.go`: `ApprovedPlan []string` request field already executes a previously
  proposed plan; `finishAgentTask(taskID, status, final, err)`; background task execution with
  a `taskID`; task-event persistence with a monotonic `Seq` for SSE reattach.
- `runsStore.ts` + `AgentRunsTab.tsx`: **real** background-run surface (task_events) — the
  mission progress view plugs in here.
- `AgentSettingsTab.tsx`: **mock** (local `useState`: economyMode, planningEnabled, autoDeploy,
  consensusThreshold, contextMode; nothing persisted) — wiring it to real prefs also removes a
  mock/deceptive surface (project honesty principle).
- `src/components/admin/` (`AdminLayout.tsx` + `tabs/`): where super-admin agent controls live.
- Ownership: every project route scopes by `user_id` and 404s on miss; sessions validated.
  Migrations are control-plane-only (0011+), idempotent, monotonic; auto-applied via
  `//go:embed *.sql`.

## 4. Architecture & data flow

```
POST /agent/missions {goal}
  └─ plan phase: Runner(Mode="plan") → proposed sub-tasks
     └─ persist agent_missions(status=awaiting_approval) + agent_mission_tasks(pending)

POST /agent/missions/{id}/approve {plan?}   (user reviewed/edited)
  └─ status=running; background orchestrator starts
     └─ for each task in order (respecting cancel + caps):
          task.status=running
          RunSubTask(objective)  = a Runner(Mode="direct") in the shared workspace,
                                    self-verifies via tests/check_app
          success → task.status=done, persist result
          failure → retry up to maxRetries; exhausted → task.status=failed, mission=failed (stop)
          persist after each task  → resumable from last done
     └─ all done → mission.status=completed, summary=merge(results), emit notification

GET /agent/missions, GET /agent/missions/{id}   → structured status (poll / resume UI)
POST /agent/missions/{id}/stop                  → cooperative cancel
Live progress also emitted to the existing task-event stream (SSE reattach).
```

## 5. Data model (migration `0017_agent_missions.sql`)

```sql
CREATE TABLE IF NOT EXISTS agent_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'planning',
    -- planning | awaiting_approval | running | completed | failed | stopped
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,   -- proposed/approved ordered objectives
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
  status VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending | running | done | failed | skipped
  attempts INT NOT NULL DEFAULT 0,
  result TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_mission_tasks_mission
  ON agent_mission_tasks(mission_id, ordinal);
```

The same migration `0017` also creates the governance tables referenced in §6.3–§6.4:

```sql
-- Global engine config: enforced single row (id = TRUE).
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

-- Per-user agent preferences (one row per user).
CREATE TABLE IF NOT EXISTS user_agent_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  default_autonomy VARCHAR(16) NOT NULL DEFAULT 'approve_plan', -- approve_plan | autonomous (v1 honors approve_plan only)
  max_steps INT NOT NULL DEFAULT 12,
  preferred_model TEXT NOT NULL DEFAULT '',
  planning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 6. Backend components

### 6.1 `internal/orchestrator` (new package, DB/model-agnostic)
Mirrors the agent loop's narrow-interface design so it is unit-testable with fakes:

```go
type SubTask struct { Ordinal int; Objective string }
type SubTaskResult struct { Ok bool; Summary string }

// RunSubTask executes one sub-task to completion (a sub-agent run). Injected by the server;
// fakes drive tests. Returns Ok=false when the sub-agent could not complete/verify the task.
type RunSubTask func(ctx context.Context, t SubTask) (SubTaskResult, error)

// MissionStore persists progress so a mission resumes across restarts.
type MissionStore interface {
    SetTaskStatus(ctx, taskID, status string, attempts int, result string) error
    SetMissionStatus(ctx, missionID, status, summary string) error
}

type Config struct { MaxRetries int; MaxTasks int }  // caps from admin config

// Run executes tasks in order from the first non-done task (resume), honoring ctx cancel.
func (o *Orchestrator) Run(ctx, mission Mission, tasks []SubTask) (Summary, error)
```

**Unit tests (fakes, no DB/model):** happy path (all pass), verify/retry (fail→retry→pass),
exhausted retries → mission failed & stops, **resume** from a partially-done mission, and
**stop** (ctx cancel mid-mission leaves clean state).

### 6.2 `mission_handlers.go`
- `POST /projects/{projectID}/agent/missions` — body `{goal}`. Runs the planner (Runner in
  plan mode over the goal), persists mission + tasks (`awaiting_approval`), returns them.
- `POST /projects/{projectID}/agent/missions/{missionID}/approve` — body `{plan?}` (edited
  objectives). Sets `running`, launches the orchestrator in the background (same background
  pattern as agent runs). `RunSubTask` builds a `Runner{Mode:"direct"}` bound to the project
  workspace (reusing the existing workspace/model resolution + memory/skills wiring).
- `GET /projects/{projectID}/agent/missions` and `GET …/{missionID}` — mission + tasks.
- `POST …/{missionID}/stop` — sets a cancel signal the orchestrator polls; marks `stopped`.
- All ownership-scoped (`requireOwnedProject`); parameterized SQL.

### 6.3 Admin config & observability
- Global engine config lives in the single-row `agent_engine_config` table (§5): `enabled`,
  `default_model`, `max_tasks`, `max_retries`, `max_concurrent_missions`.
- `GET/PATCH /admin/agent/config` and `GET /admin/agent/missions` (all users) —
  `requireRole(super_admin)`. Caps are read by the mission handlers/orchestrator to bound work.

### 6.4 Per-user prefs
- The `user_agent_prefs` table (§5): `default_autonomy`, `max_steps`, `preferred_model`,
  `planning_enabled`. **v1 honors only `approve_plan`**; the `autonomous` value is stored for
  forward-compatibility but the mission flow always uses the approval gate until the
  fully-autonomous mode ships (§10).
- `GET/PATCH /me/agent-prefs` (auth). Defaults are applied when a mission is created.

> Concurrency note: `max_concurrent_missions` is enforced with a small in-process counter in
> the control-plane (single backend instance today); a DB-backed claim (à la the worker's
> `FOR UPDATE SKIP LOCKED`) is the multi-instance upgrade path, out of scope for v1.

## 7. Frontend

- `missionStore.ts` — `createMission(goal)`, `approveMission(id, plan)`, `fetchMission(id)`,
  `stopMission(id)`, keyed by project.
- **Mission progress** in `AgentRunsTab`: sub-task checklist with live status (pending/running/
  done/failed), goal header, stop button, final summary. Plan-approval reuses the existing chat
  plan-approval affordance.
- **Settings**: rewrite `AgentSettingsTab` to load/save real `user_agent_prefs` (drops the mock
  local state).
- **Super Admin**: `src/components/admin/tabs/AgentEngineTab.tsx` — global caps/defaults form +
  all-missions observability table. Registered in the admin tab registry; `AdminRoute` +
  `requireRole(super_admin)` gated. No super-admin controls leak outside the admin module.
- All UI on CSS-variable design tokens (no raw hex); passes `torsor guard`.

## 8. Testing & gates

- Go: `internal/orchestrator` unit tests (fakes); `go build ./...`, `go vet ./...`,
  `go test ./...`, linux/amd64 cross-compile.
- Frontend: `tsc --noEmit`, `vitest run`, `vite build`, `torsor guard`.
- Manual smoke (post-deploy): create a mission with a 2–3 step goal on a templated project →
  approve → watch sub-tasks run and verify → confirm summary + resume after a forced restart.

## 9. Build order (vertical slices behind the gates)

1. Migration 0017 + mission/task store + read handlers.
2. `internal/orchestrator` + unit tests.
3. Plan + approve + background execution handlers wired to a real sub-agent Runner.
4. Admin config + per-user prefs (backend) → wire mission caps/defaults.
5. Frontend: missionStore + AgentRunsTab progress + real AgentSettingsTab + admin AgentEngine tab.

Each slice ships independently (backend degrades gracefully; UI reads real endpoints only).

## 10. Explicitly out of scope (v1 / YAGNI)

- Reflection / auto-learning (separately designed follow-on pillar).
- Parallel sub-task execution / git-worktree isolation (deferred; interface leaves room).
- Fully-autonomous (no-approval) missions and per-sub-task approval gates (config default is
  `approve_plan`; other modes are later).
- Cross-project missions; multi-instance mission scheduling (DB claim); codebase indexing/RAG.

## 11. Risks & mitigations

- **Runaway work / cost** → admin caps (`max_tasks`, `max_retries`, `max_concurrent_missions`)
  + step budget per sub-agent + always-live stop.
- **Partial failure leaves a broken workspace** → per-task persistence + resume; a failed task
  stops the mission (no blind continuation); Checkpoints (existing) recommended before big runs.
- **Sub-agent verification gaps** → reuse the existing `check_app`/tests self-verify; a task is
  `done` only when its sub-agent returns a verified final.
- **Honesty** → the mission UI shows real task states from the DB; no simulated progress.
