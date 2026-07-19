# Design: Agent Reflection — Auto-Learning (Propose-Everything) v1

**Date:** 2026-07-19
**Status:** Approved (decisions locked in brainstorming) — building
**Topic:** After a substantive agent run, a reflection pass proposes durable memories and
skills; nothing is written until the user approves them in a dedicated **Learning** tab.

## Locked decisions (from brainstorming)
1. **Capability:** auto-learning via reflection (a pillar of the agent engine).
2. **Autonomy:** *propose everything* — reflection writes NOTHING to memories/skills; it stages
   proposals the user approves/dismisses.
3. **Trigger:** *after substantive runs only* — a run that used `write_file` or `run`
   (detected from the streamed tool-call events; read-only/chat runs are skipped).
4. **Surface:** a dedicated **Learning** tab (agent group) listing pending proposals.

## Builds on (already on `main`)
- Memories (`memories` table, `projectMemoryStore`, Memory tab) — Phase B.
- Skills (`skills` table, `loadEnabledSkills`, Agent Skills tab) — Phase C.
- The agent loop (`internal/agent`, `agent.Model` interface) + the SSE stream handler
  (`handleAgentStream`) whose `send` callback already sees every step Event.

## Data model — migration `0018_learning_proposals.sql`
`learning_proposals`: `id, project_id, user_id, kind ('memory'|'skill'),
status ('pending'|'accepted'|'dismissed'), payload jsonb, created_at, updated_at`.
- payload for `memory`: `{content, memKind}`; for `skill`: `{name, description, instruction}`.
- Ownership via the owning project (`ON CONFLICT`/`ON DELETE CASCADE`), denormalized user_id.
- (Filename-keyed migrations coexist with the engine branch's `0017`, either merge order.)

## Backend
- **`internal/agent/reflect.go`** — `Reflect(ctx, model, input) (Proposals, error)`: one model
  call with a reflection system prompt over `{task, final, actionLog}` → strict JSON
  `{memories:[{content,kind}], skills:[{name,description,instruction}]}`, reusing the loop's
  tolerant `extractJSONObject` parser. DB-agnostic; unit-tested with a scripted model.
- **`reflection_handlers.go`** — after `handleAgentStream`'s run completes successfully AND was
  substantive (the handler accumulates a compact action log + a `mutated` flag from the
  Events it streams), a **background, best-effort** goroutine calls `Reflect`, dedups each
  candidate against existing memories/skills and pending proposals (case-insensitive content /
  name match), inserts survivors as `pending`, and fires one `emitNotification`
  ("Learned N things — review"). Reflection failure never affects the run.
- **`learning_handlers.go`** — ownership-scoped:
  `GET /projects/{id}/learning/proposals?status=pending`,
  `POST .../{pid}/accept` (creates the real memory or skill via the existing insert paths,
  marks `accepted`), `POST .../{pid}/dismiss` (marks `dismissed`).

## Frontend
- **`learningStore.ts`** — fetch pending, accept, dismiss (keyed by project).
- **`LearningTab.tsx`** — dedicated tab in the **agent** group: pending proposals grouped
  memory vs. skill, each with Approve/Dismiss (+ approve-all/dismiss-all), count badge, empty
  state. All design tokens.
- Registered in `kernel/builtins.tsx` + `layoutStore` `TabType`.

## Testing & gates
Go: `agent.Reflect` unit tests (scripted model: valid proposals parsed; empty/garbage → empty).
`go build/vet/test`, linux/amd64 cross-compile. Frontend: `tsc`, `vitest`, `vite build`,
`torsor guard`.

## Out of scope (v1)
Auto-apply (all proposals require approval), cross-project learning, reflection on read-only
runs, on-demand "reflect on this run" button, embeddings/semantic dedup (substring match only).
