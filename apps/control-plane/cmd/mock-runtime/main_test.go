package main

import (
	"context"
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// Snapshot captures state; edits after it are undone by restore; the snapshot is independent
// of later edits (deep copy), so it can be restored repeatedly.
func TestMockSnapshotRestoreRoundTrip(t *testing.T) {
	r := newRuntime()
	ctx := context.Background()
	if _, err := r.CreateWorkspace(ctx, plugin.WorkspaceSpec{ID: "w1"}); err != nil {
		t.Fatal(err)
	}
	if err := r.WriteFile(ctx, "w1", "a.txt", []byte("v1"), false); err != nil {
		t.Fatal(err)
	}
	snap, err := r.SnapshotWorkspace(ctx, "w1", "before change")
	if err != nil {
		t.Fatal(err)
	}
	if snap.SnapshotID == "" {
		t.Fatal("empty snapshot id")
	}

	// Mutate after the snapshot, then restore — the mutation must be undone.
	if err := r.WriteFile(ctx, "w1", "a.txt", []byte("v2"), false); err != nil {
		t.Fatal(err)
	}
	if _, err := r.RestoreWorkspace(ctx, "w1", snap.SnapshotID); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.ReadFile(ctx, "w1", "a.txt"); string(got) != "v1" {
		t.Errorf("restore: got %q, want v1", got)
	}

	// The snapshot survives a second edit+restore (deep copy, not a moved reference).
	_ = r.WriteFile(ctx, "w1", "a.txt", []byte("v3"), false)
	if _, err := r.RestoreWorkspace(ctx, "w1", snap.SnapshotID); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.ReadFile(ctx, "w1", "a.txt"); string(got) != "v1" {
		t.Errorf("second restore: got %q, want v1", got)
	}
}

// Fork provisions an independent workspace from either the live source or a snapshot.
func TestMockForkFromLiveAndSnapshot(t *testing.T) {
	r := newRuntime()
	ctx := context.Background()
	_, _ = r.CreateWorkspace(ctx, plugin.WorkspaceSpec{ID: "src"})
	_ = r.WriteFile(ctx, "src", "app.js", []byte("hello"), false)

	if _, err := r.ForkWorkspace(ctx, "src", "", "fork1"); err != nil {
		t.Fatal(err)
	}
	if got, err := r.ReadFile(ctx, "fork1", "app.js"); err != nil || string(got) != "hello" {
		t.Fatalf("fork from live: got %q err %v", got, err)
	}

	// The fork is independent: editing the source doesn't change the fork.
	_ = r.WriteFile(ctx, "src", "app.js", []byte("changed"), false)
	if got, _ := r.ReadFile(ctx, "fork1", "app.js"); string(got) != "hello" {
		t.Errorf("fork independence: got %q, want hello", got)
	}

	// Fork from a snapshot captures the state at snapshot time.
	snap, _ := r.SnapshotWorkspace(ctx, "src", "")
	if _, err := r.ForkWorkspace(ctx, "src", snap.SnapshotID, "fork2"); err != nil {
		t.Fatal(err)
	}
	if got, _ := r.ReadFile(ctx, "fork2", "app.js"); string(got) != "changed" {
		t.Errorf("fork from snapshot: got %q, want changed", got)
	}
}
