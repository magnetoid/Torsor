package server

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
)

// Background agent runs turn ai_tasks into a real work queue. A pool of worker goroutines
// claims pending rows (FOR UPDATE SKIP LOCKED, so multiple control-plane instances never
// double-claim), runs the coding-agent loop against the project's workspace, and persists
// every streamed step to ai_tasks.events for replay/reattach. Redis pub/sub is used only as
// a low-latency wake signal (torsor:jobs), a cancel channel (torsor:cancel), and a per-task
// live-tail channel (torsor:task:{id}); the poll fallback means a missed message never
// strands a task.
const (
	jobsChannel      = "torsor:jobs"
	cancelChannel    = "torsor:cancel"
	taskDoneSentinel = "__done__"
	// Background runs get the larger step budget approved plans use — they run unattended.
	backgroundMaxSteps = 24
	backgroundRunTTL   = 15 * time.Minute
)

func taskChannel(id string) string { return "torsor:task:" + id }

// StartAgentWorkers launches the background agent worker pool and its Redis subscribers,
// bound to ctx (cancelled on shutdown). A worker count of 0 disables background processing
// (the synchronous /agent/stream path is unaffected). Non-blocking.
func (s *Server) StartAgentWorkers(ctx context.Context) {
	n := s.cfg.AgentWorkers
	if n <= 0 {
		s.logger.Info("background agent workers disabled (TORSOR_AGENT_WORKERS=0)")
		return
	}

	// running: id -> context.CancelFunc for in-flight runs (for cancellation).
	// cancelled: id -> struct{} marking a user-requested cancel (vs. shutdown).
	var running, cancelled sync.Map

	wake := make(chan struct{}, 1)
	signalWake := func() {
		select {
		case wake <- struct{}{}:
		default:
		}
	}

	// A new-task signal wakes an idle worker immediately; the poll ticker is the fallback.
	s.redis.Subscribe(ctx, jobsChannel, func(string) { signalWake() })

	// A cancel signal (payload = task id) marks the run cancelled and cancels its context.
	s.redis.Subscribe(ctx, cancelChannel, func(payload string) {
		id := strings.TrimSpace(payload)
		if id == "" {
			return
		}
		cancelled.Store(id, struct{}{})
		if v, ok := running.Load(id); ok {
			if cancel, ok := v.(context.CancelFunc); ok {
				cancel()
			}
		}
	})

	for i := 0; i < n; i++ {
		go s.agentWorkerLoop(ctx, wake, &running, &cancelled)
	}
	s.logger.Info("background agent workers started", "workers", n)
}

// agentWorkerLoop drains all claimable tasks, then waits for a wake signal or poll tick.
func (s *Server) agentWorkerLoop(ctx context.Context, wake <-chan struct{}, running, cancelled *sync.Map) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		for s.claimAndRun(ctx, running, cancelled) {
			if ctx.Err() != nil {
				return
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-wake:
		case <-ticker.C:
		}
	}
}

// claimAndRun atomically claims the oldest pending task and runs it. Returns false when no
// task was available (or the claim failed), so the caller stops draining.
func (s *Server) claimAndRun(ctx context.Context, running, cancelled *sync.Map) bool {
	var id, projectID, prompt string
	err := s.pool.QueryRow(ctx, `
		UPDATE ai_tasks SET status = 'processing', updated_at = NOW()
		 WHERE id = (
		   SELECT id FROM ai_tasks
		    WHERE status = 'pending'
		    ORDER BY created_at ASC
		    FOR UPDATE SKIP LOCKED
		    LIMIT 1
		 )
		RETURNING id, project_id, prompt`).Scan(&id, &projectID, &prompt)
	if err == pgx.ErrNoRows {
		return false
	}
	if err != nil {
		if ctx.Err() == nil {
			s.logger.Warn("agent worker: claim failed", "err", err)
		}
		return false
	}
	s.runAgentTask(ctx, running, cancelled, id, projectID, prompt)
	return true
}

// runAgentTask executes one claimed task's agent loop, persisting and publishing each step,
// and marks the row terminal. Ownership is intrinsic: the workspace id is the project id and
// the run is scoped to the project's owner.
func (s *Server) runAgentTask(parent context.Context, running, cancelled *sync.Map, id, projectID, prompt string) {
	var uid string
	if err := s.pool.QueryRow(parent, `SELECT user_id FROM projects WHERE id = $1`, projectID).Scan(&uid); err != nil {
		s.finishTaskRow(id, "failed", "", "project lookup failed: "+err.Error(), 0, "", 0, 0)
		s.publishTaskDone(id)
		return
	}

	provider, providerName, ok := s.pickModelProvider("")
	if !ok {
		s.finishTaskRow(id, "failed", "", "no model provider available", 0, "", 0, 0)
		s.publishTaskDone(id)
		return
	}

	ws, rt, err := s.loadOrCreateWorkspaceCtx(parent, projectID, uid)
	if err != nil {
		s.finishTaskRow(id, "failed", "", err.Error(), 0, "", 0, 0)
		s.publishTaskDone(id)
		return
	}
	apiKey := s.providerAPIKey(parent, uid, providerName)

	taskCtx, cancel := context.WithTimeout(parent, backgroundRunTTL)
	running.Store(id, cancel)
	defer func() {
		running.Delete(id)
		cancel()
	}()

	// Connect the user's enabled MCP servers for this background run, too.
	mcpRouter, toolRouter := s.buildMCPRouter(taskCtx, uid)
	if mcpRouter != nil {
		defer mcpRouter.Close()
	}

	seq := 0
	onEvent := func(e agent.Event) {
		seq++
		e.Seq = seq
		payload, mErr := json.Marshal(e)
		if mErr != nil {
			return
		}
		// Durable append with a fresh context: taskCtx may be cancelling mid-run, but the
		// step still belongs in the persisted transcript. events || [e] concatenates.
		actx, acancel := context.WithTimeout(context.Background(), 5*time.Second)
		if _, aErr := s.pool.Exec(actx,
			`UPDATE ai_tasks SET events = events || $2::jsonb, updated_at = NOW() WHERE id = $1`,
			id, "["+string(payload)+"]"); aErr != nil {
			s.logger.Warn("agent worker: append event failed", "id", id, "err", aErr)
		}
		acancel()
		// Live-tail for any attached SSE reader (best-effort).
		_ = s.redis.Publish(context.Background(), taskChannel(id), string(payload))
	}

	runner := agent.NewRunner(provider, rt, agent.Config{
		WorkspaceID: ws.ProjectID,
		MaxSteps:    backgroundMaxSteps,
		APIKey:      apiKey,
		Tools:       toolRouter,
	})
	result, runErr := runner.Run(taskCtx, prompt, onEvent)
	s.recordUsage(uid, providerName, result.Model, result.TokensIn, result.TokensOut)

	_, userCancelled := cancelled.LoadAndDelete(id)
	switch {
	case parent.Err() != nil && !userCancelled:
		// The control plane is shutting down: requeue so the run resumes after restart.
		s.requeueTask(id)
	case userCancelled:
		s.finishTaskRow(id, "cancelled", "", "cancelled by user", result.Steps, result.Model, result.TokensIn, result.TokensOut)
	case runErr != nil:
		s.finishTaskRow(id, "failed", "", runErr.Error(), result.Steps, result.Model, result.TokensIn, result.TokensOut)
	default:
		s.finishTaskRow(id, "completed", result.Final, "", result.Steps, result.Model, result.TokensIn, result.TokensOut)
	}
	s.publishTaskDone(id)
}

// finishTaskRow marks a task terminal with its accounting. Fresh context because the run's
// context is usually already cancelled once the stream ends.
func (s *Server) finishTaskRow(id, status, result, errMsg string, steps int, model string, tokensIn, tokensOut int32) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var resultArg, errArg any
	if result != "" {
		resultArg = result
	}
	if errMsg != "" {
		errArg = errMsg
	}
	if _, err := s.pool.Exec(ctx,
		`UPDATE ai_tasks
		    SET status = $2, result = $3, error = $4, steps = $5, model = $6,
		        tokens_in = $7, tokens_out = $8, updated_at = NOW()
		  WHERE id = $1`,
		id, status, resultArg, errArg, steps, model, tokensIn, tokensOut); err != nil {
		s.logger.Warn("agent worker: finish task failed", "id", id, "err", err)
	}
}

// requeueTask returns an interrupted run to the pending queue with a clean event log so it
// resumes cleanly after a control-plane restart.
func (s *Server) requeueTask(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := s.pool.Exec(ctx,
		`UPDATE ai_tasks SET status = 'pending', events = '[]'::jsonb, updated_at = NOW() WHERE id = $1`,
		id); err != nil {
		s.logger.Warn("agent worker: requeue failed", "id", id, "err", err)
	}
}

func (s *Server) publishTaskDone(id string) {
	_ = s.redis.Publish(context.Background(), taskChannel(id), taskDoneSentinel)
}
