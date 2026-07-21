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
		Run: func(_ context.Context, s SubTask) SubTaskResult {
			return SubTaskResult{Ok: true, Summary: "did " + s.Objective}
		},
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
