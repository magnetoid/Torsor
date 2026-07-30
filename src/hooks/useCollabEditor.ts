import { useEffect, useState } from 'react';
import type * as monacoNS from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import { joinCollab, leaveCollab, fileText, collabColor } from '../lib/collab';
import { useAuthStore } from '../stores/authStore';

export type CollabStatus = 'off' | 'connecting' | 'connected' | 'disconnected';

interface Options {
  projectId: string | null;
  /** Workspace path of the open file — the Y.Text key. */
  filePath: string | null;
  editor: monacoNS.editor.IStandaloneCodeEditor | null;
  /** Server-side content, used only to seed an empty document. */
  initialContent: string;
  enabled: boolean;
}

/**
 * Binds the open Monaco model to the project's shared Yjs document, giving real
 * multi-user editing with remote cursors on top of the co-editing proxy the control
 * plane already exposed. Returns connection status and peer count for the UI.
 *
 * Ordering matters: the binding is created only once the provider has synced, so a
 * fresh client can't seed the document from its own copy and duplicate the content
 * that another peer already has.
 */
export function useCollabEditor({ projectId, filePath, editor, initialContent, enabled }: Options) {
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<CollabStatus>('off');
  const [peers, setPeers] = useState(0);

  useEffect(() => {
    if (!enabled || !projectId || !filePath || !editor) {
      setStatus('off');
      setPeers(0);
      return;
    }
    const model = editor.getModel();
    if (!model) return;

    const { doc, provider } = joinCollab(projectId);
    let binding: MonacoBinding | null = null;
    let disposed = false;

    provider.awareness.setLocalStateField('user', {
      name: user?.name || user?.email || 'Anonymous',
      color: collabColor(user?.id || user?.email || 'anon'),
    });

    const bind = () => {
      if (disposed || binding) return;
      const text = fileText(doc, filePath, initialContent);
      binding = new MonacoBinding(text, model, new Set([editor]), provider.awareness);
    };

    const onStatus = ({ status: s }: { status: string }) => {
      if (disposed) return;
      setStatus(s === 'connected' ? 'connected' : s === 'connecting' ? 'connecting' : 'disconnected');
    };
    const onSync = (isSynced: boolean) => {
      if (isSynced) bind();
    };
    const onAwareness = () => {
      if (!disposed) setPeers(Math.max(0, provider.awareness.getStates().size - 1));
    };

    setStatus(provider.wsconnected ? 'connected' : 'connecting');
    provider.on('status', onStatus);
    provider.on('sync', onSync);
    provider.awareness.on('change', onAwareness);
    if (provider.synced) bind();
    onAwareness();

    return () => {
      disposed = true;
      provider.off('status', onStatus);
      provider.off('sync', onSync);
      provider.awareness.off('change', onAwareness);
      binding?.destroy();
      leaveCollab(projectId);
    };
    // initialContent is intentionally excluded: it seeds an empty doc once, and
    // re-running on every keystroke would tear the binding down mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, projectId, filePath, editor, user?.id, user?.name, user?.email]);

  return { status, peers };
}
