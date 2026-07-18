import React, { useEffect } from 'react';
import { usePresenceStore } from '../../stores/presenceStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAuthStore } from '../../stores/authStore';
import { useLayoutStore } from '../../stores/layoutStore';

// Live collaborator avatars for the top bar. Connects the presence room for the active
// project and broadcasts which tab this client is viewing. In Focus mode it collapses to a
// single calm presence dot (calm-interface discipline); in IDE mode it shows stacked avatars.
export function PresenceAvatars({ focus }: { focus?: boolean }) {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const peers = usePresenceStore((s) => s.peers);
  const connect = usePresenceStore((s) => s.connect);
  const disconnect = usePresenceStore((s) => s.disconnect);
  const updateLocal = usePresenceStore((s) => s.updateLocal);
  const myUserId = useAuthStore((s) => s.user?.id);

  const activeTabType = useLayoutStore((s) => {
    const t = s.centerTabs.find((tab) => tab.id === s.activeTabId);
    return t?.type;
  });

  useEffect(() => {
    if (activeProjectId) connect(activeProjectId);
    return () => disconnect();
  }, [activeProjectId, connect, disconnect]);

  useEffect(() => {
    if (activeTabType) updateLocal({ activeTab: activeTabType });
  }, [activeTabType, updateLocal]);

  // Unique other collaborators (dedupe by user, exclude self).
  const others = Object.values(peers).filter((p) => p.userId && p.userId !== myUserId);
  const unique = Array.from(new Map(others.map((p) => [p.userId, p])).values());

  if (unique.length === 0) return null;

  if (focus) {
    return (
      <div
        className="flex items-center gap-1 text-xs text-tertiary"
        title={`${unique.length} collaborator${unique.length === 1 ? '' : 's'} online`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        {unique.length}
      </div>
    );
  }

  return (
    <div className="flex items-center -space-x-1.5">
      {unique.slice(0, 4).map((p) => (
        <div
          key={p.userId}
          title={p.username + (p.activeTab ? ` · ${p.activeTab}` : '')}
          className="h-6 w-6 overflow-hidden rounded-full border-2 border-surface bg-accent/20"
        >
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(p.username)}&size=48`}
            alt={p.username}
            className="h-full w-full object-cover"
          />
        </div>
      ))}
      {unique.length > 4 && (
        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-elevated text-[9px] font-bold text-secondary">
          +{unique.length - 4}
        </div>
      )}
    </div>
  );
}
