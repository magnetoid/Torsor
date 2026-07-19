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
	ID        string
	Ordinal   int
	Objective string
	done      bool // true when already completed in a prior run (resume)
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
