import React from 'react';
import { MousePointerClick, Loader2, Check, AlertTriangle, MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { VisualSelection, VisualEditStatus } from './useVisualEdit';

/** Docked editor for the selected preview element: text first-class, honest status line.
 *  Non-text elements still offer "Ask agent" with a precise element descriptor. */
export function VisualEditPanel({
  selection,
  status,
  onDraft,
  onApply,
  onAskAgent,
  onDiscard,
}: {
  selection: VisualSelection;
  status: VisualEditStatus;
  onDraft: (text: string) => void;
  onApply: () => void;
  onAskAgent: () => void;
  onDiscard: () => void;
}) {
  const breadcrumb =
    selection.tag + (selection.className ? '.' + selection.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  const dirty = selection.draft !== selection.originalText;
  const locating = status.kind === 'locating';

  const statusLine = (() => {
    switch (status.kind) {
      case 'preview-only':
        return { text: 'Preview only — not saved to source yet', tone: 'text-tertiary' };
      case 'locating':
        return { text: 'Locating this text in your source…', tone: 'text-tertiary' };
      case 'applied':
        return { text: `Applied to ${status.path}`, tone: 'text-success' };
      case 'ambiguous':
        return {
          text: "Couldn't locate this text uniquely — drafted an agent instruction instead",
          tone: 'text-warning',
        };
      case 'save-failed':
        return { text: 'Save failed — try again or ask the agent', tone: 'text-error' };
      default:
        return null;
    }
  })();

  return (
    <div className="shrink-0 border-t border-default bg-surface px-3 py-2 space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <MousePointerClick size={12} className="text-accent shrink-0" />
        <span className="text-[10px] font-mono text-secondary truncate" title={breadcrumb}>
          {breadcrumb}
        </span>
        {statusLine && (
          <span className={cn('ml-auto text-[10px] shrink-0 flex items-center gap-1', statusLine.tone)}>
            {status.kind === 'locating' && <Loader2 size={10} className="animate-spin" />}
            {status.kind === 'applied' && <Check size={10} />}
            {status.kind === 'ambiguous' && <AlertTriangle size={10} />}
            {statusLine.text}
          </span>
        )}
      </div>

      {selection.editable ? (
        <div className="flex items-center gap-2">
          <input
            value={selection.draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && dirty && !locating && onApply()}
            placeholder="Edit the text…"
            className="flex-1 bg-inset border border-default focus:border-accent/50 rounded-lg px-2.5 py-1.5 text-xs text-primary outline-none transition-colors"
          />
          <button
            onClick={onApply}
            disabled={!dirty || locating}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-40 text-white text-[10px] font-bold transition-colors shrink-0"
          >
            Apply to source
          </button>
          <button
            onClick={onAskAgent}
            disabled={!dirty || locating}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-default text-secondary hover:text-primary disabled:opacity-40 text-[10px] font-bold transition-colors shrink-0"
          >
            <MessageSquare size={10} /> Ask agent
          </button>
          <button
            onClick={onDiscard}
            className="px-2.5 py-1.5 rounded-lg text-tertiary hover:text-primary text-[10px] font-bold transition-colors shrink-0"
          >
            Discard
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[10px] text-tertiary">
            This element has nested content — describe the change and the agent will make it.
          </p>
          <button
            onClick={onAskAgent}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[10px] font-bold transition-colors shrink-0"
          >
            <MessageSquare size={10} /> Ask agent about this element
          </button>
          <button
            onClick={onDiscard}
            className="px-2.5 py-1.5 rounded-lg text-tertiary hover:text-primary text-[10px] font-bold transition-colors shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
