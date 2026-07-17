import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '../../useAppStore';
import { useChatStore } from '../../stores/chatStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { isCandidatePath, findMatches, replaceAt } from '../../lib/sourceLocator';

/** Overlay-space rectangle (relative to the iframe's container). */
export interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface VisualSelection {
  tag: string;
  className: string;
  /** Text as it was when selected (the source-location needle). */
  originalText: string;
  /** Live draft (mirrored into the DOM as you type). */
  draft: string;
  /** True when the element is a simple text host we can edit first-class. */
  editable: boolean;
  rect: OverlayRect;
}

export type VisualEditStatus =
  | { kind: 'idle' }
  | { kind: 'preview-only' }
  | { kind: 'locating' }
  | { kind: 'applied'; path: string }
  | { kind: 'ambiguous'; matches: number }
  | { kind: 'save-failed' };

/**
 * Visual Edits v1 — select an element in the same-origin preview iframe, edit its text
 * with instant DOM feedback, then persist for real: a unique exact-text match in the
 * workspace source is spliced + saved via the normal save path; anything ambiguous is
 * drafted as a precise agent instruction instead (never silently dropped, never mocked).
 *
 * A hook (not a store): the selection holds live Element refs — non-serializable and
 * document-scoped, so component-local state is the honest home for it.
 */
export function useVisualEdit(iframeRef: React.RefObject<HTMLIFrameElement | null>, projectId: string | null) {
  const [selectMode, setSelectMode] = useState(false);
  const [available, setAvailable] = useState(true);
  const [hoverRect, setHoverRect] = useState<OverlayRect | null>(null);
  const [selection, setSelection] = useState<VisualSelection | null>(null);
  const [status, setStatus] = useState<VisualEditStatus>({ kind: 'idle' });

  // Live DOM refs (never in React state).
  const selectedElRef = useRef<Element | null>(null);
  const hoverElRef = useRef<Element | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const selectModeRef = useRef(false);
  selectModeRef.current = selectMode;

  const rectFor = useCallback(
    (el: Element): OverlayRect => {
      const r = el.getBoundingClientRect();
      // Iframe-viewport coords are already container-relative (the iframe fills its box).
      return { top: r.top, left: r.left, width: r.width, height: r.height };
    },
    []
  );

  const clearSelection = useCallback(() => {
    selectedElRef.current = null;
    hoverElRef.current = null;
    setSelection(null);
    setHoverRect(null);
    setStatus({ kind: 'idle' });
  }, []);

  /** Attach capture-phase listeners inside the iframe document. Parent-side rendering
   *  only — nothing is injected into the user's app DOM. */
  const arm = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    let doc: Document | null = null;
    try {
      doc = iframeRef.current?.contentDocument ?? null;
    } catch {
      doc = null; // cross-origin preview
    }
    if (!doc) {
      setAvailable(false);
      return;
    }
    setAvailable(true);

    const isOurs = (el: unknown): el is Element =>
      el instanceof (doc!.defaultView?.Element ?? Element) && el !== doc!.documentElement && el !== doc!.body;

    const onMouseOver = (e: MouseEvent) => {
      if (!selectModeRef.current) return;
      const t = e.target;
      if (!isOurs(t)) return;
      hoverElRef.current = t;
      setHoverRect(rectFor(t));
    };
    const onScrollOrResize = () => {
      if (!selectModeRef.current) return;
      if (hoverElRef.current) setHoverRect(rectFor(hoverElRef.current));
      if (selectedElRef.current) {
        setSelection((s) => (s ? { ...s, rect: rectFor(selectedElRef.current!) } : s));
      }
    };
    const swallow = (e: Event) => {
      if (!selectModeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const onClick = (e: MouseEvent) => {
      if (!selectModeRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.target;
      if (!isOurs(t)) return;
      const text = (t.textContent ?? '').trim();
      const editable = t.children.length === 0 && text.length >= 3;
      selectedElRef.current = t;
      setSelection({
        tag: t.tagName.toLowerCase(),
        className: typeof t.className === 'string' ? t.className : '',
        originalText: text,
        draft: text,
        editable,
        rect: rectFor(t),
      });
      setStatus({ kind: 'idle' });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectModeRef.current) setSelectMode(false);
    };

    doc.addEventListener('mouseover', onMouseOver, true);
    doc.addEventListener('mousedown', swallow, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('scroll', onScrollOrResize, true);
    doc.addEventListener('keydown', onKeyDown, true);
    detachRef.current = () => {
      doc!.removeEventListener('mouseover', onMouseOver, true);
      doc!.removeEventListener('mousedown', swallow, true);
      doc!.removeEventListener('click', onClick, true);
      doc!.removeEventListener('scroll', onScrollOrResize, true);
      doc!.removeEventListener('keydown', onKeyDown, true);
    };
  }, [iframeRef, rectFor]);

  useEffect(() => {
    if (selectMode) arm();
    else {
      detachRef.current?.();
      detachRef.current = null;
      clearSelection();
    }
    return () => {
      detachRef.current?.();
      detachRef.current = null;
    };
  }, [selectMode, arm, clearSelection]);

  // Escape in the parent window too.
  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelectMode(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  /** Call from the iframe's onLoad: stale Element refs die with the old document. */
  const onIframeLoad = useCallback(() => {
    if (selection && selection.draft !== selection.originalText) {
      toast('Preview reloaded — unsaved visual edit discarded');
    }
    clearSelection();
    if (selectModeRef.current) arm();
  }, [arm, clearSelection, selection]);

  /** Instant live feedback: write the draft straight into the DOM. */
  const setDraft = useCallback((draft: string) => {
    setSelection((s) => (s ? { ...s, draft } : s));
    const el = selectedElRef.current;
    if (el) el.textContent = draft;
    setStatus({ kind: 'preview-only' });
  }, []);

  const discard = useCallback(() => {
    const el = selectedElRef.current;
    setSelection((s) => {
      if (el && s) el.textContent = s.originalText;
      return null;
    });
    selectedElRef.current = null;
    setStatus({ kind: 'idle' });
  }, []);

  /** Persist for real: unique exact-text match → splice + saveFile; else agent fallback. */
  const applyToSource = useCallback(async () => {
    const sel = selection;
    if (!sel || !projectId || sel.draft === sel.originalText) return;
    setStatus({ kind: 'locating' });

    const app = useAppStore.getState();
    const candidates = app.files.filter((f) => f.type === 'file' && isCandidatePath(f.id)).slice(0, 60);

    // Fetch missing contents through the existing read path (4-way pool; results cache
    // into the tree, which also benefits the editor and search).
    const missing = candidates.filter((f) => f.content === undefined);
    const queue = [...missing];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (;;) {
        const f = queue.shift();
        if (!f) return;
        try {
          await useAppStore.getState().loadFileContent(projectId, f.id);
        } catch {
          /* unreadable file — skip it as a candidate */
        }
      }
    });
    await Promise.all(workers);

    const contents = new Map<string, string>();
    for (const f of useAppStore.getState().files) {
      if (f.type === 'file' && isCandidatePath(f.id) && typeof f.content === 'string') {
        contents.set(f.id, f.content);
      }
    }

    const matches = findMatches(contents, sel.originalText);
    if (matches.length === 1) {
      const m = matches[0];
      const next = replaceAt(contents.get(m.path)!, m.index, m.needle, sel.draft);
      try {
        useAppStore.getState().updateFileContent(m.path, next);
        await useAppStore.getState().saveFile(m.path);
        setStatus({ kind: 'applied', path: m.path });
        toast.success(`Applied to ${m.path}`);
        // The DOM already shows the new text; HMR converges the source. No nonce bump —
        // a reload here would flash and destroy the selection pointlessly.
        setSelection((s) => (s ? { ...s, originalText: s.draft } : s));
      } catch {
        setStatus({ kind: 'save-failed' });
      }
      return;
    }

    // 0 or ≥2 matches: draft a precise agent instruction — never auto-run, never pretend.
    const el = `<${sel.tag}${sel.className ? ` class="${sel.className.slice(0, 120)}"` : ''}>`;
    const where =
      matches.length > 1
        ? `I found ${matches.length} exact matches (${[...new Set(matches.map((m) => m.path))].slice(0, 3).join(', ')}) — locate the right occurrence and update it.`
        : 'I found no exact match in the source (the text may be dynamic or split across elements) — locate where it is produced and update it.';
    useChatStore
      .getState()
      .setComposerDraft(
        `Change the text "${sel.originalText}" to "${sel.draft}". It appears in the element ${el}. ${where}`
      );
    if (!useLayoutStore.getState().leftPanelOpen) useLayoutStore.getState().toggleLeftPanel();
    setStatus({ kind: 'ambiguous', matches: matches.length });
  }, [projectId, selection]);

  /** Explicit "ask the agent" path: pre-fill the composer with a precise instruction
   *  (never auto-run) — for nested elements or when the user prefers the agent. */
  const askAgent = useCallback(() => {
    const sel = selection;
    if (!sel) return;
    const el = `<${sel.tag}${sel.className ? ` class="${sel.className.slice(0, 120)}"` : ''}>`;
    const instruction =
      sel.editable && sel.draft !== sel.originalText
        ? `Change the text "${sel.originalText}" to "${sel.draft}". It appears in the element ${el}.`
        : `In the live preview I selected the element ${el}${sel.originalText ? ` (current text starts: "${sel.originalText.slice(0, 80)}")` : ''}. I want to change it: `;
    useChatStore.getState().setComposerDraft(instruction);
    if (!useLayoutStore.getState().leftPanelOpen) useLayoutStore.getState().toggleLeftPanel();
  }, [selection]);

  const toggleSelectMode = useCallback(() => setSelectMode((v) => !v), []);

  return {
    selectMode,
    toggleSelectMode,
    available,
    hoverRect: selectMode ? hoverRect : null,
    selection,
    setDraft,
    applyToSource,
    askAgent,
    discard,
    status,
    onIframeLoad,
  };
}
