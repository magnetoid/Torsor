import React, { useEffect } from 'react';
import { Rocket, Loader2 } from 'lucide-react';
import { HomeLayout } from '../components/shell/HomeLayout';
import { usePlatformStore } from '../stores/platformStore';

/** What's New — the platform changelog published by admins (/api/v1/updates). */
export function UpdatesPage() {
  const { updates, loading, fetchUpdates } = usePlatformStore();

  useEffect(() => {
    void fetchUpdates();
  }, [fetchUpdates]);

  return (
    <HomeLayout title="What's New" mainClassName="flex-1 min-w-0 flex flex-col overflow-y-auto animate-in fade-in duration-slow">
      <div className="max-w-2xl w-full mx-auto px-6 py-8">
        {loading && updates.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : updates.length === 0 ? (
          <div className="text-center py-16 space-y-2">
            <Rocket size={28} className="mx-auto text-tertiary" />
            <p className="text-sm text-secondary">No release notes published yet.</p>
            <p className="text-xs text-tertiary">Updates appear here when the team publishes them.</p>
          </div>
        ) : (
          <ol className="relative border-l border-default ml-3 space-y-8">
            {updates.map((u) => (
              <li key={u.id} className="ml-6">
                <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-accent border-4 border-page" aria-hidden />
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm font-mono font-bold text-accent">{u.version}</span>
                  <h2 className="text-base font-semibold text-primary">{u.title}</h2>
                  <span className="text-xs text-tertiary">
                    {new Date(u.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {u.body && (
                  <div className="mt-2 text-sm text-secondary whitespace-pre-wrap break-words bg-surface border border-default rounded-xl p-4">
                    {u.body}
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </HomeLayout>
  );
}
