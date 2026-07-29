import { useEffect } from 'react';

type KeyCombo = string;

/** True when the event originates from a typing surface (inputs, textareas,
 *  contentEditable, Monaco, xterm) — app shortcuts must not fire mid-typing:
 *  ⌘W/⌘T etc. used to steal keystrokes from the editor and terminal. */
function isTypingTarget(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.('.monaco-editor, .xterm'));
}

export function useKeyboardShortcut(shortcuts: Record<KeyCombo, (e: KeyboardEvent) => void>) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event)) return;
      const isCmd = event.metaKey || event.ctrlKey;
      const isShift = event.shiftKey;
      const key = event.key.toLowerCase();
      
      let combo = '';
      if (isCmd) combo += 'cmd+';
      if (isShift) combo += 'shift+';
      combo += key;

      // Handle specific cases like Cmd+Shift+B vs Cmd+B
      if (shortcuts[combo]) {
        event.preventDefault();
        shortcuts[combo](event);
      } else if (isCmd && !isShift && /^[1-9]$/.test(key)) {
        // Handle Cmd+1 through Cmd+9
        if (shortcuts['cmd+digit']) {
          event.preventDefault();
          shortcuts['cmd+digit'](event);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
