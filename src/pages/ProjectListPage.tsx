import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Star, Folder } from 'lucide-react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { AccountBar } from '../components/shared/AccountBar';
import { EmptyState } from '../components/shared/EmptyState';
import { useProjectStore, type Project } from '../stores/projectStore';
import { cn } from '../lib/utils';

/**
 * Real-lite list pages for the sidebar's Recent / Starred destinations (they used to be
 * "coming soon" dead-ends). Recent = your projects by last activity; Starred = a local
 * pin list toggled right here. Both are honest views over the real project data.
 */
export function ProjectListPage({ mode }: { mode: 'recent' | 'starred' }) {
  const navigate = useNavigate();
  const { projects, fetchProjects, isLoading, starredIds, toggleStar } = useProjectStore();

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const byActivity = [...projects].sort((a, b) => {
    const ta = Date.parse(a.lastModified ?? '') || 0;
    const tb = Date.parse(b.lastModified ?? '') || 0;
    return tb - ta;
  });
  const rows = mode === 'recent' ? byActivity.slice(0, 30) : byActivity.filter((p) => starredIds.includes(p.id));

  const title = mode === 'recent' ? 'Recent' : 'Starred';

  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />
      <main className="flex-1 min-w-0 flex flex-col overflow-y-auto h-screen animate-in fade-in duration-slow">
        <AccountBar title={title} />
        <div className="max-w-3xl w-full mx-auto px-6 py-8">
          {rows.length === 0 && !isLoading ? (
            <div className="pt-16">
              <EmptyState
                icon={mode === 'recent' ? Clock : Star}
                title={mode === 'recent' ? 'Nothing recent yet' : 'No starred projects'}
                description={
                  mode === 'recent'
                    ? 'Projects you work on will show up here, most recent first.'
                    : 'Star a project from the Recent list (or here) to pin it for quick access.'
                }
                actionLabel={mode === 'starred' ? 'Browse recent' : 'Back to Home'}
                onAction={() => navigate(mode === 'starred' ? '/recent' : '/')}
              />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((p: Project) => {
                const starred = starredIds.includes(p.id);
                return (
                  <li key={p.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => navigate(`/project/${p.id}`)}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/project/${p.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-surface border border-default rounded-xl hover:border-accent/30 transition-colors cursor-pointer group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-inset border border-default flex items-center justify-center shrink-0">
                        <Folder size={16} className="text-secondary" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="text-sm font-medium text-primary truncate">{p.name}</div>
                        {p.description && (
                          <div className="text-xs text-secondary truncate">{p.description}</div>
                        )}
                      </div>
                      <span className="text-[11px] text-tertiary shrink-0">{p.lastEdited}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleStar(p.id);
                        }}
                        aria-label={starred ? `Unstar ${p.name}` : `Star ${p.name}`}
                        aria-pressed={starred}
                        className={cn(
                          'p-1.5 rounded-md transition-colors shrink-0',
                          starred
                            ? 'text-warning'
                            : 'text-tertiary opacity-0 group-hover:opacity-100 hover:text-primary'
                        )}
                      >
                        <Star size={15} fill={starred ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
