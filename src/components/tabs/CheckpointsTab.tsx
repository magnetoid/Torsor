import React, { useEffect, useState } from 'react';
import { History, Plus, RotateCcw, Loader2, GitCommit, Camera, GitFork } from 'lucide-react';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { useProjectStore } from '../../stores/projectStore';
import {
  ApiError,
  apiListWorkspaceSnapshots,
  apiSnapshotWorkspace,
  apiRestoreWorkspace,
  apiForkWorkspace,
  type WorkspaceSnapshot,
} from '../../lib/api';

export default function CheckpointsTab() {
  const {
    checkpoints,
    loading,
    creating,
    restoringId,
    error,
    fetchCheckpoints,
    createCheckpoint,
    restoreCheckpoint,
  } = useCheckpointStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (activeProjectId) void fetchCheckpoints(activeProjectId);
  }, [activeProjectId, fetchCheckpoints]);

  const handleCreate = async () => {
    if (!activeProjectId) return;
    const ok = await createCheckpoint(activeProjectId, label.trim());
    if (ok) setLabel('');
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString();
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-secondary text-sm">
        Open a project to manage checkpoints.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      <div className="h-10 px-4 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <History size={14} className="text-accent-hover" />
        <span className="text-xs font-bold text-primary">Checkpoints</span>
        <span className="text-xs text-tertiary ml-auto">Snapshot &amp; restore your workspace</span>
      </div>

      {error && <p className="mx-4 mt-3 text-xs text-error">{error}</p>}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && checkpoints.length === 0 ? (
          <div className="flex items-center justify-center h-full text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
            <GitCommit size={32} className="opacity-20" />
            <p className="text-sm">No checkpoints yet</p>
            <p className="text-xs text-tertiary">Create one before a risky change so you can roll back.</p>
          </div>
        ) : (
          checkpoints.map((c) => (
            <div
              key={c.id}
              className="bg-surface border border-default rounded-lg p-3 mb-2 flex items-center gap-3 group hover:border-subtle transition-all"
            >
              <GitCommit size={14} className="text-tertiary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-primary truncate block">{c.label || 'Checkpoint'}</span>
                <span className="text-xs text-tertiary">
                  {c.fileCount} file{c.fileCount === 1 ? '' : 's'} · {formatDate(c.createdAt)}
                </span>
              </div>
              <button
                onClick={() => activeProjectId && void restoreCheckpoint(activeProjectId, c.id)}
                disabled={restoringId === c.id}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title="Restore this checkpoint"
              >
                {restoringId === c.id ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <RotateCcw size={13} />
                )}
                Restore
              </button>
            </div>
          ))
        )}

        <WorkspaceSnapshotsSection projectId={activeProjectId} />
      </div>

      <div className="p-4 border-t border-default bg-surface sticky bottom-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Checkpoint label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            className="flex-1 bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 placeholder:text-tertiary"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shrink-0"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Checkpoint
          </button>
        </div>
        <p className="text-xs text-secondary mt-2 ml-1">
          Restore overwrites current files with the snapshot; files added since remain.
        </p>
      </div>
    </div>
  );
}

// WorkspaceSnapshotsSection surfaces runtime-native snapshots (docker commit / microVM
// snapshot) distinct from the file-tree checkpoints above: snapshot in place, restore, or
// fork a new project from a point in time. Gracefully hidden when the runtime doesn't support
// snapshots (501) or the workspace isn't provisioned yet.
function WorkspaceSnapshotsSection({ projectId }: { projectId: string }) {
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  const load = async () => {
    try {
      setSnapshots(await apiListWorkspaceSnapshots(projectId));
    } catch {
      /* no workspace yet — leave empty */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleSnapshot = async () => {
    setBusy(true);
    setNote(null);
    try {
      await apiSnapshotWorkspace(projectId, '');
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 501) {
        setUnsupported(true);
      } else if (e instanceof ApiError && e.status === 404) {
        setNote('Start the workspace first, then snapshot it.');
      } else {
        setNote(e instanceof Error ? e.message : 'Snapshot failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    setBusy(true);
    setNote(null);
    try {
      await apiRestoreWorkspace(projectId, id);
      setNote('Workspace restored.');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFork = async (id: string) => {
    setBusy(true);
    setNote(null);
    try {
      const { projectId: forked } = await apiForkWorkspace(projectId, { snapshotId: id, name: 'Fork' });
      setNote(`Forked to a new project (${forked.slice(0, 8)}…).`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Fork failed');
    } finally {
      setBusy(false);
    }
  };

  if (unsupported) {
    return (
      <div className="mt-6 border-t border-default pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-tertiary">
          <Camera size={12} /> Workspace snapshots require a snapshot-capable runtime (docker / firecracker).
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-default pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <Camera size={12} className="text-accent" /> Workspace snapshots
        </div>
        <button
          onClick={() => void handleSnapshot()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md bg-elevated px-2 py-1 text-xs font-bold text-secondary transition-colors hover:text-primary disabled:opacity-50"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
          Snapshot now
        </button>
      </div>
      {note && <p className="mb-2 text-xs text-tertiary">{note}</p>}
      {snapshots.length === 0 ? (
        <p className="text-xs text-tertiary">
          Runtime-native snapshots capture the whole workspace so you can restore in place or fork a new
          copy — the microVM branch-your-world primitive.
        </p>
      ) : (
        snapshots.map((s) => (
          <div
            key={s.id}
            className="mb-1.5 flex items-center gap-2 rounded-md border border-default bg-surface px-2.5 py-1.5"
          >
            <Camera size={12} className="shrink-0 text-tertiary" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-[11px] text-primary">{s.label || s.runtime + ' snapshot'}</span>
              <span className="text-[9px] text-tertiary">{new Date(s.createdAt).toLocaleString()}</span>
            </div>
            <button
              onClick={() => void handleRestore(s.id)}
              disabled={busy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-elevated hover:text-primary disabled:opacity-50"
              title="Restore this snapshot in place"
            >
              <RotateCcw size={11} /> Restore
            </button>
            <button
              onClick={() => void handleFork(s.id)}
              disabled={busy}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-secondary hover:bg-elevated hover:text-primary disabled:opacity-50"
              title="Fork a new project from this snapshot"
            >
              <GitFork size={11} /> Fork
            </button>
          </div>
        ))
      )}
    </div>
  );
}
