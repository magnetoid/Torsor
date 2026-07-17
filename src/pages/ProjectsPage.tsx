import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Grid,
  List,
  Plus,
  MoreVertical,
  Globe,
  Smartphone,
  Palette,
  LayoutDashboard,
  Server,
  Gamepad2,
  Sparkles,
  Puzzle,
  ChevronDown,
  Filter,
  Lock,
} from 'lucide-react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { AccountBar } from '../components/shared/AccountBar';
import { useProjectStore } from '../stores/projectStore';
import { cn } from '../lib/utils';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { usePlanGate } from '../hooks/usePlanGate';
import { UpgradeDialog } from '../components/shared/UpgradeDialog';
import { EmptyState } from '../components/shared/EmptyState';
import { ProjectCardSkeleton } from '../components/shared/Skeleton';

const PROJECT_TYPES = [
  { id: 'website', icon: Globe, label: 'Website' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile' },
  { id: 'design', icon: Palette, label: 'Design' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'api', icon: Server, label: 'API' },
  { id: 'game', icon: Gamepad2, label: 'Game' },
  { id: 'ai', icon: Sparkles, label: 'AI App' },
  { id: 'extension', icon: Puzzle, label: 'Extension' },
];

export function ProjectsPage() {
  const navigate = useNavigate();
  const { deleteProject, getProjectsByWorkspace, fetchProjects, createProject, isLoading, error } = useProjectStore();

  const { checkFeature } = usePlanGate();
  const projectGate = checkFeature('create_project');
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeTab, setActiveTab] = useState<'all' | 'my' | 'shared' | 'archived'>('all');

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const workspaceProjects = getProjectsByWorkspace('server-default');

  const filteredProjects = useMemo(() => workspaceProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase()),
  ), [workspaceProjects, searchQuery]);

  const handleNewProject = async () => {
    if (!projectGate.allowed) {
      setUpgradeOpen(true);
      return;
    }

    try {
      setCreating(true);
      const projectId = await createProject({
        name: `New Project ${workspaceProjects.length + 1}`,
        description: 'Created from the projects dashboard.',
        type: 'website',
      }, 'server-default');
      navigate(`/project/${projectId}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />

      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <AccountBar title="Projects" />
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-sm text-secondary mt-1">Backed by the Torsor API on app.torsor.dev-ready config.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-64 bg-surface border border-default rounded-xl pl-9 pr-3 py-1.5 text-sm text-primary outline-none focus:border-accent transition-colors"
                />
              </div>
              <div className="flex items-center bg-surface border border-default rounded-xl p-0.5">
                <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-elevated text-primary shadow-sm' : 'text-secondary hover:text-primary')}><Grid size={16} /></button>
                <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded-lg transition-colors', viewMode === 'list' ? 'bg-elevated text-primary shadow-sm' : 'text-secondary hover:text-primary')}><List size={16} /></button>
              </div>

              <Tooltip.Provider>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={() => void handleNewProject()}
                      disabled={creating}
                      className={cn(
                        'flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-accent/20 relative disabled:opacity-60',
                        !projectGate.allowed && 'opacity-80 grayscale-[0.5]',
                      )}
                    >
                      {!projectGate.allowed && <Lock size={12} className="text-white/70" />}
                      <Plus size={16} />
                      <span>{creating ? 'Creating…' : 'New Project'}</span>
                    </button>
                  </Tooltip.Trigger>
                </Tooltip.Root>
              </Tooltip.Provider>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-default mb-6">
            <div className="flex gap-6">
              {['all', 'my', 'shared', 'archived'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={cn('pb-3 text-sm font-medium capitalize transition-colors relative', activeTab === tab ? 'text-primary' : 'text-secondary hover:text-primary')}>
                  {tab === 'all' ? 'All' : tab === 'my' ? 'My Projects' : tab}
                  {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-2 text-xs text-secondary mb-3 transition-colors">
              <Filter size={14} />
              <span>Sort: Updated</span>
              <ChevronDown size={14} />
            </button>
          </div>

          {error && <div className="mb-4 rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">{error}</div>}

          {viewMode === 'grid' ? (
            <div className="grid grid-cols-3 gap-6">
              {isLoading ? (
                <>
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                </>
              ) : filteredProjects.length > 0 ? (
                filteredProjects.map((project) => (
                  <div key={project.id} className="group bg-surface border border-default rounded-xl overflow-hidden hover:border-accent/30 transition-all flex flex-col">
                    <Link to={`/project/${project.id}`} className="h-[140px] bg-page flex items-center justify-center p-4 relative">
                      <div className="w-14 h-14 rounded-lg bg-elevated flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                        {(() => {
                          const Icon = PROJECT_TYPES.find((t) => t.id === project.type)?.icon || Globe;
                          return <Icon size={28} />;
                        })()}
                      </div>
                    </Link>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/project/${project.id}`} className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-primary truncate group-hover:text-accent transition-colors">{project.name}</h3>
                          <p className="text-xs text-secondary mt-1 line-clamp-2 leading-relaxed">{project.description}</p>
                        </Link>
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="p-1 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-colors"><MoreVertical size={16} /></button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content className="min-w-[160px] bg-elevated border border-default rounded-lg p-1 shadow-xl z-50" sideOffset={5}>
                              <DropdownMenu.Item onClick={() => void useProjectStore.getState().duplicateProject(project.id)} className="flex items-center px-2 py-1.5 text-xs text-primary outline-none hover:bg-surface rounded-md cursor-pointer">Duplicate</DropdownMenu.Item>
                              <DropdownMenu.Item onClick={() => void useProjectStore.getState().archiveProject(project.id)} className="flex items-center px-2 py-1.5 text-xs text-primary outline-none hover:bg-surface rounded-md cursor-pointer">Archive</DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-px bg-default my-1" />
                              <DropdownMenu.Item onClick={() => void deleteProject(project.id)} className="flex items-center px-2 py-1.5 text-xs text-error outline-none hover:bg-error/10 rounded-md cursor-pointer">Delete</DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                      <div className="mt-auto pt-4 flex items-center justify-between">
                        <span className="text-[10px] text-secondary uppercase tracking-wider font-semibold">{project.vibe || project.type}</span>
                        <span className="text-[10px] text-secondary uppercase tracking-wider font-semibold">Updated {project.lastEdited}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-3 py-20">
                  <EmptyState icon={searchQuery ? Search : Grid} title={searchQuery ? 'No projects match your search' : 'No projects yet'} description={searchQuery ? 'Try adjusting your search terms or filters.' : 'Create your first real DB-backed project to start building with Torsor.'} actionLabel={searchQuery ? 'Clear search' : 'Create project'} onAction={searchQuery ? () => setSearchQuery('') : () => void handleNewProject()} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-default rounded-xl overflow-hidden">
              {isLoading ? (
                <div className="divide-y divide-subtle">{[1, 2, 3].map((i) => <div key={i} className="p-4 h-16 animate-pulse bg-page/30" />)}</div>
              ) : filteredProjects.length > 0 ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-default text-[10px] uppercase tracking-wider font-semibold text-secondary">
                      <th className="px-4 py-3">Project Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Last Edited</th><th className="px-4 py-3">Visibility</th><th className="px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default">
                    {filteredProjects.map((project) => (
                      <tr key={project.id} className="group hover:bg-elevated transition-colors">
                        <td className="px-4 py-3"><Link to={`/project/${project.id}`} className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-page flex items-center justify-center text-accent">{(() => { const Icon = PROJECT_TYPES.find((t) => t.id === project.type)?.icon || Globe; return <Icon size={16} />; })()}</div><div className="min-w-0"><div className="text-sm font-medium text-primary truncate group-hover:text-accent transition-colors">{project.name}</div><div className="text-xs text-secondary truncate max-w-[300px]">{project.description}</div></div></Link></td>
                        <td className="px-4 py-3"><span className="text-xs text-secondary capitalize">{project.type}</span></td>
                        <td className="px-4 py-3"><span className="text-xs text-secondary">{project.lastEdited}</span></td>
                        <td className="px-4 py-3"><span className="text-xs text-secondary">{project.isPublished ? 'Public' : 'Private'}</span></td>
                        <td className="px-4 py-3"><button className="p-1 text-secondary hover:text-primary hover:bg-default rounded-md transition-colors"><MoreVertical size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-20"><EmptyState icon={Grid} title="No projects yet" description="Create your first project." actionLabel="Create project" onAction={() => void handleNewProject()} /></div>
              )}
            </div>
          )}
        </div>
      </main>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
