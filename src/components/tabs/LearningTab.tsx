import React, { useEffect } from 'react';
import { GraduationCap, Brain, Zap, Check, X, Loader2 } from 'lucide-react';
import { useLearningStore } from '../../stores/learningStore';
import { useProjectStore } from '../../stores/projectStore';

/**
 * Learning: durable memories and skills the agent's reflection pass proposed after a
 * substantive run. Nothing here has changed the project yet — the user Approves (which writes
 * the real memory/skill) or Dismisses each. This is the "propose everything" review queue.
 */
export default function LearningTab() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { byProject, loading, error, fetchProposals, accept, dismiss } = useLearningStore();

  useEffect(() => {
    if (activeProjectId) void fetchProposals(activeProjectId);
  }, [activeProjectId, fetchProposals]);

  const proposals = activeProjectId ? byProject[activeProjectId] || [] : [];

  const approveAll = async () => {
    if (!activeProjectId) return;
    for (const p of [...proposals]) await accept(activeProjectId, p.id);
  };
  const dismissAll = async () => {
    if (!activeProjectId) return;
    for (const p of [...proposals]) await dismiss(activeProjectId, p.id);
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-secondary text-sm">
        Open a project to review what the agent has learned.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      <div className="h-10 px-4 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <GraduationCap size={14} className="text-accent-hover" />
        <span className="text-xs font-bold text-primary">Learning</span>
        <span className="text-xs text-tertiary ml-auto">
          {proposals.length > 0
            ? `${proposals.length} proposal${proposals.length === 1 ? '' : 's'} to review`
            : 'What the agent proposes to remember'}
        </span>
      </div>

      {proposals.length > 0 && (
        <div className="px-4 py-2 flex items-center gap-2 border-b border-default shrink-0">
          <button
            onClick={() => void approveAll()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-success hover:bg-success/10 rounded-md transition-all"
          >
            <Check size={13} /> Approve all
          </button>
          <button
            onClick={() => void dismissAll()}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-secondary hover:bg-elevated rounded-md transition-all"
          >
            <X size={13} /> Dismiss all
          </button>
        </div>
      )}

      {error && <p className="mx-4 mt-3 text-xs text-error">{error}</p>}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && proposals.length === 0 ? (
          <div className="flex items-center justify-center h-full text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
            <GraduationCap size={32} className="opacity-20" />
            <p className="text-sm">Nothing to review</p>
            <p className="text-xs text-tertiary text-center max-w-xs">
              After the agent does real work, it proposes durable memories and skills here. Approve the ones
              worth keeping — they feed future runs.
            </p>
          </div>
        ) : (
          proposals.map((p) => {
            const isSkill = p.kind === 'skill';
            const title = isSkill ? p.payload.name || 'Skill' : p.payload.content || '';
            return (
              <div
                key={p.id}
                className="bg-surface border border-default rounded-lg p-3 mb-2 flex items-start gap-3 group hover:border-subtle transition-all"
              >
                <span className="shrink-0 mt-0.5 text-tertiary" title={isSkill ? 'Proposed skill' : 'Proposed memory'}>
                  {isSkill ? <Zap size={14} /> : <Brain size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-primary block break-words">{title}</span>
                  {isSkill && p.payload.instruction && (
                    <span className="text-xs text-secondary block break-words mt-0.5 italic">
                      "{p.payload.instruction}"
                    </span>
                  )}
                  <span className="text-xs text-tertiary uppercase tracking-wider">
                    {isSkill ? 'skill' : p.payload.kind || 'memory'}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => activeProjectId && void accept(activeProjectId, p.id)}
                    className="p-1 text-secondary hover:text-success hover:bg-success/10 rounded-md transition-all"
                    title="Approve — keep this"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => activeProjectId && void dismiss(activeProjectId, p.id)}
                    className="p-1 text-secondary hover:text-error hover:bg-error/10 rounded-md transition-all"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
