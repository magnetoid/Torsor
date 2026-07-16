import React, { useEffect, useState } from 'react';
import { History, Plus, RotateCcw, Loader2, GitCommit } from 'lucide-react';
import { useCheckpointStore } from '../../stores/checkpointStore';
import { useProjectStore } from '../../stores/projectStore';

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
        <span className="text-[10px] text-tertiary ml-auto">Snapshot &amp; restore your workspace</span>
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
                <span className="text-[10px] text-tertiary">
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
        <p className="text-[10px] text-secondary mt-2 ml-1">
          Restore overwrites current files with the snapshot; files added since remain.
        </p>
      </div>
    </div>
  );
}
