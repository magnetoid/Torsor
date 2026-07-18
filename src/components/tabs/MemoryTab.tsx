import React, { useEffect, useMemo, useState } from 'react';
import { Brain, Plus, Loader2, Trash2, Bot, User as UserIcon, Pencil, Check, X } from 'lucide-react';
import { useMemoryStore, MEMORY_KINDS, type Memory } from '../../stores/memoryStore';
import { useProjectStore } from '../../stores/projectStore';

/**
 * Project memory: durable notes/facts/decisions the coding agent and the user share. The
 * agent writes here via its remember tool and reads via recall; this panel lets the user
 * curate the same store — add, edit, delete, and filter. Agent-written entries carry a bot
 * badge so it's clear where a memory came from.
 */
export default function MemoryTab() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { byProject, loading, error, fetchMemories, addMemory, updateMemory, deleteMemory } = useMemoryStore();

  const [content, setContent] = useState('');
  const [kind, setKind] = useState<string>('note');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    if (activeProjectId) void fetchMemories(activeProjectId);
  }, [activeProjectId, fetchMemories]);

  const memories = activeProjectId ? byProject[activeProjectId] || [] : [];
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return memories;
    return memories.filter((m) => m.content.toLowerCase().includes(q) || m.kind.toLowerCase().includes(q));
  }, [memories, filter]);

  const handleAdd = async () => {
    const text = content.trim();
    if (!text || !activeProjectId) return;
    setSaving(true);
    try {
      await addMemory(activeProjectId, text, kind);
      setContent('');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditContent(m.content);
  };

  const saveEdit = async (m: Memory) => {
    const text = editContent.trim();
    if (!text || !activeProjectId) return;
    await updateMemory(activeProjectId, m.id, { content: text });
    setEditingId(null);
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-secondary text-sm">
        Open a project to manage its memory.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      <div className="h-10 px-4 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <Brain size={14} className="text-accent-hover" />
        <span className="text-xs font-bold text-primary">Memory</span>
        <span className="text-xs text-tertiary ml-auto">Durable context the agent remembers across runs</span>
      </div>

      <div className="px-4 pt-3 shrink-0">
        <input
          type="text"
          placeholder="Filter memories…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-sm text-primary outline-none focus:border-accent/50 placeholder:text-tertiary"
        />
      </div>

      {error && <p className="mx-4 mt-3 text-xs text-error">{error}</p>}

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && memories.length === 0 ? (
          <div className="flex items-center justify-center h-full text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
            <Brain size={32} className="opacity-20" />
            <p className="text-sm">{memories.length === 0 ? 'No memories yet' : 'No matches'}</p>
            <p className="text-xs text-tertiary text-center max-w-xs">
              Save durable facts, decisions, and preferences. The agent reads these at the start of a run and
              adds its own as it works.
            </p>
          </div>
        ) : (
          filtered.map((m) => (
            <div
              key={m.id}
              className="bg-surface border border-default rounded-lg p-3 mb-2 flex items-start gap-3 group hover:border-subtle transition-all"
            >
              <span
                className="shrink-0 mt-0.5 text-tertiary"
                title={m.source === 'agent' ? 'Saved by the agent' : 'Saved by you'}
              >
                {m.source === 'agent' ? <Bot size={14} /> : <UserIcon size={14} />}
              </span>
              <div className="flex-1 min-w-0">
                {editingId === m.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveEdit(m);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="flex-1 bg-page border border-default rounded-md px-2 py-1 text-sm text-primary outline-none focus:border-accent/50"
                    />
                    <button onClick={() => void saveEdit(m)} className="text-success hover:opacity-80" title="Save">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-tertiary hover:text-primary" title="Cancel">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-primary block break-words">{m.content}</span>
                )}
                <span className="text-xs text-tertiary">
                  <span className="uppercase tracking-wider">{m.kind}</span> · {formatDate(m.createdAt)}
                </span>
              </div>
              {editingId !== m.id && (
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => startEdit(m)}
                    className="p-1 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => activeProjectId && void deleteMemory(activeProjectId, m.id)}
                    className="p-1 text-secondary hover:text-error hover:bg-error/10 rounded-md transition-all"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-default bg-surface sticky bottom-0">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="bg-page border border-default rounded-lg px-2 py-2 text-sm text-primary outline-none focus:border-accent/50 shrink-0 capitalize"
          >
            {MEMORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Remember something about this project…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleAdd();
            }}
            className="flex-1 bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 placeholder:text-tertiary"
          />
          <button
            onClick={() => void handleAdd()}
            disabled={saving || !content.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shrink-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
