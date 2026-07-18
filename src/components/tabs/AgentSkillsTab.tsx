import React, { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import {
  Sparkles,
  Code2,
  Terminal,
  FileText,
  FolderTree,
  Brain,
  Plus,
  Trash2,
  Pencil,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useSkillsStore, type Skill } from '../../stores/skillsStore';
import { useProjectStore } from '../../stores/projectStore';

// Built-in agent capabilities: the actual tools the coding loop always has (see
// internal/agent). Shown as an honest, read-only reference — they're not user-toggleable, so
// there are no fake switches or usage counters here.
const BUILTIN_CAPABILITIES: { icon: React.ReactNode; name: string; description: string }[] = [
  { icon: <FolderTree size={18} />, name: 'Browse files', description: 'List the project workspace tree.' },
  { icon: <FileText size={18} />, name: 'Read files', description: 'Read any file in the workspace.' },
  { icon: <Code2 size={18} />, name: 'Write files', description: 'Create and overwrite files.' },
  { icon: <Terminal size={18} />, name: 'Run commands', description: 'Execute shell commands in the workspace.' },
  { icon: <Brain size={18} />, name: 'Project memory', description: 'Recall and remember durable context across runs.' },
];

interface DraftSkill {
  name: string;
  description: string;
  instruction: string;
}

const EMPTY_DRAFT: DraftSkill = { name: '', description: '', instruction: '' };

export default function AgentSkillsTab() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { byProject, loading, error, fetchSkills, addSkill, updateSkill, deleteSkill } = useSkillsStore();

  const [isAdding, setIsAdding] = useState(false);
  const [draft, setDraft] = useState<DraftSkill>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftSkill>(EMPTY_DRAFT);

  useEffect(() => {
    if (activeProjectId) void fetchSkills(activeProjectId);
  }, [activeProjectId, fetchSkills]);

  const skills = activeProjectId ? byProject[activeProjectId] || [] : [];

  const handleAdd = async () => {
    if (!activeProjectId || !draft.name.trim() || !draft.instruction.trim()) return;
    setSaving(true);
    try {
      await addSkill(activeProjectId, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        instruction: draft.instruction.trim(),
      });
      setDraft(EMPTY_DRAFT);
      setIsAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: Skill) => {
    setEditingId(s.id);
    setEditDraft({ name: s.name, description: s.description, instruction: s.instruction });
  };

  const saveEdit = async (id: string) => {
    if (!activeProjectId || !editDraft.name.trim() || !editDraft.instruction.trim()) return;
    await updateSkill(activeProjectId, id, {
      name: editDraft.name.trim(),
      description: editDraft.description.trim(),
      instruction: editDraft.instruction.trim(),
    });
    setEditingId(null);
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-secondary text-sm">
        Open a project to manage its agent skills.
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-page overflow-y-auto no-scrollbar">
      {/* HEADER */}
      <div className="h-12 bg-surface flex items-center justify-between px-4 shrink-0 border-b border-default sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-sm font-bold text-primary">Agent Skills</h2>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
        >
          <Plus size={14} />
          Add Skill
        </button>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-8">
        {error && <p className="text-xs text-error">{error}</p>}

        {/* CUSTOM SKILLS — real, persisted, injected into the agent's system prompt */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Custom Skills</h3>
          <p className="text-[11px] text-tertiary mb-4">
            Enabled skills are added to the agent's instructions for this project, so it follows your conventions on every run.
          </p>
          <div className="space-y-3">
            {loading && skills.length === 0 ? (
              <div className="flex items-center gap-2 text-secondary text-sm py-6 justify-center">
                <Loader2 size={16} className="animate-spin" />
                Loading…
              </div>
            ) : (
              skills.map((skill) => (
                <div key={skill.id} className="bg-surface rounded-xl border border-default p-4 group">
                  {editingId === skill.id ? (
                    <div className="space-y-3">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Skill name"
                        className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                      />
                      <input
                        value={editDraft.description}
                        onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description (optional)"
                        className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                      />
                      <textarea
                        value={editDraft.instruction}
                        onChange={(e) => setEditDraft((p) => ({ ...p, instruction: e.target.value }))}
                        placeholder="Instruction added to the agent's system prompt"
                        className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent/50 min-h-[80px] resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 px-3 py-2 rounded-lg border border-default text-primary text-xs font-bold uppercase tracking-wider hover:bg-elevated transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => void saveEdit(skill.id)}
                          className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Zap size={14} className={cn('shrink-0', skill.enabled ? 'text-warning' : 'text-tertiary')} />
                          <h4 className={cn('text-sm font-bold truncate', skill.enabled ? 'text-primary' : 'text-tertiary')}>
                            {skill.name}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch.Root
                            checked={skill.enabled}
                            onCheckedChange={(v) => activeProjectId && void updateSkill(activeProjectId, skill.id, { enabled: v })}
                            className={cn(
                              'w-8 h-4 rounded-full relative transition-colors outline-none cursor-pointer',
                              skill.enabled ? 'bg-accent' : 'bg-elevated',
                            )}
                            title={skill.enabled ? 'Enabled — injected into the agent prompt' : 'Disabled'}
                          >
                            <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                          </Switch.Root>
                          <button
                            onClick={() => startEdit(skill)}
                            className="p-1 text-tertiary hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => activeProjectId && void deleteSkill(activeProjectId, skill.id)}
                            className="p-1 text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {skill.description && <p className="text-xs text-secondary mb-3">{skill.description}</p>}
                      <div className="bg-page rounded-lg p-3 border border-default font-mono text-[11px] text-accent/80 italic break-words">
                        "{skill.instruction}"
                      </div>
                    </>
                  )}
                </div>
              ))
            )}

            {isAdding ? (
              <div className="bg-surface rounded-xl border border-accent/30 p-5 space-y-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-widest">New Skill</h4>
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      setDraft(EMPTY_DRAFT);
                    }}
                    className="text-secondary hover:text-primary"
                  >
                    <Plus size={16} className="rotate-45" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Skill Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Zod Validation"
                      value={draft.name}
                      onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Description</label>
                    <input
                      type="text"
                      placeholder="What does this skill do? (optional)"
                      value={draft.description}
                      onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Instruction (added to the agent prompt)</label>
                    <textarea
                      placeholder="When building forms, always use Zod for validation…"
                      value={draft.instruction}
                      onChange={(e) => setDraft((p) => ({ ...p, instruction: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent/50 min-h-[80px] resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setIsAdding(false);
                      setDraft(EMPTY_DRAFT);
                    }}
                    className="flex-1 px-3 py-2 rounded-lg border border-default text-primary text-xs font-bold uppercase tracking-wider hover:bg-elevated transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAdd()}
                    disabled={saving || !draft.name.trim() || !draft.instruction.trim()}
                    className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Add Skill
                  </button>
                </div>
              </div>
            ) : (
              skills.length === 0 &&
              !loading && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="w-full h-24 rounded-xl border border-dashed border-default hover:border-accent/50 hover:bg-accent/5 transition-all flex flex-col items-center justify-center gap-2 group"
                >
                  <div className="w-8 h-8 rounded-full bg-surface border border-default flex items-center justify-center group-hover:bg-accent group-hover:border-accent-hover transition-colors">
                    <Plus size={16} className="text-secondary group-hover:text-white" />
                  </div>
                  <span className="text-xs font-medium text-secondary group-hover:text-accent">
                    Add your first skill
                  </span>
                </button>
              )
            )}
          </div>
        </section>

        {/* BUILT-IN CAPABILITIES — honest read-only reference (always on, not toggleable) */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-1">Built-in Capabilities</h3>
          <p className="text-[11px] text-tertiary mb-4">
            The coding agent always has these tools in a provisioned workspace. They're built in — not toggleable.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {BUILTIN_CAPABILITIES.map((cap) => (
              <div key={cap.name} className="bg-surface rounded-xl border border-default p-4 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-page border border-default text-accent">{cap.icon}</div>
                <div>
                  <h4 className="text-sm font-bold text-primary mb-0.5">{cap.name}</h4>
                  <p className="text-[11px] text-secondary leading-tight">{cap.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
