import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { 
  Plus, 
  Search, 
  LayoutGrid, 
  Clock, 
  Users, 
  Archive, 
  Settings, 
  CreditCard, 
  Layers, 
  MoreVertical, 
  Code2, 
  ExternalLink, 
  Copy, 
  Edit2, 
  Trash2,
  LogOut,
  ChevronDown,
  Box,
  Sparkles,
  Star
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { EmptyState } from '../components/shared/EmptyState';
import { ProjectCardSkeleton } from '../components/shared/Skeleton';
import { Button } from '../components/shared/Button';
import { useAuthStore } from '../stores/authStore';
import { useActiveWorkspace } from '../stores/workspaceStore';
import { ActivityFeed } from '../components/home/ActivityFeed';
import { useAppStore } from '../useAppStore';
import { useProjectStore, Project } from '../stores/projectStore';
import { useSocialStore, Template } from '../stores/socialStore';
import { BillingModal } from '../components/billing/BillingModal';
import { cn } from '../lib/utils';

const NavItem = ({ icon: Icon, label, active, onClick }: { icon: React.ElementType, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-accent/10 text-accent border-l-2 border-accent" 
        : "text-secondary hover:text-primary hover:bg-surface"
    )}
  >
    <Icon size={18} />
    {label}
  </button>
);

const TechIcon: React.FC<{ type: string }> = ({ type }) => {
  const colors: Record<string, string> = {
    react: "bg-info/20 text-info",
    typescript: "bg-info/20 text-info",
    tailwind: "bg-info/20 text-info",
    nodejs: "bg-success/20 text-success",
    express: "bg-zinc-500/20 text-zinc-400",
    postgresql: "bg-indigo-500/20 text-indigo-400",
    nextjs: "bg-white/10 text-white",
    mdx: "bg-warning/20 text-warning",
    'react-native': "bg-purple-500/20 text-purple-400",
    web3: "bg-warning/20 text-warning",
  };

  return (
    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold uppercase", colors[type] || "bg-zinc-500/20 text-zinc-400")}>
      {type[0]}
    </div>
  );
};

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const activeWorkspace = useActiveWorkspace();
  const { isBillingModalOpen, setBillingModalOpen } = useAppStore();
  const { projects, deleteProject, duplicateProject, archiveProject } = useProjectStore();
  const [isLoading, setIsLoading] = useState(true);

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);
  const { templates } = useSocialStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'archived') return p.isArchived && matchesSearch;
    if (activeTab === 'all') return !p.isArchived && matchesSearch;
    // Mocking other tabs for now
    return !p.isArchived && matchesSearch;
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-inset text-primary font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-page border-r border-default flex flex-col shrink-0">
        <div className="p-4">
          <Select.Root defaultValue="personal">
            <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-surface border border-default rounded-md text-sm font-medium outline-none hover:border-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-accent rounded flex items-center justify-center text-[10px] text-white">T</div>
                <Select.Value />
              </div>
              <Select.Icon>
                <ChevronDown size={14} className="text-secondary" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50 overflow-hidden">
                <Select.Viewport className="p-1">
                  <Select.Item value="personal" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                    <Select.ItemText>Personal Workspace</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="team" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                    <Select.ItemText>Acme Team</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <nav className="flex-1 mt-4">
          <NavItem icon={LayoutGrid} label="Projects" active />
          <NavItem icon={Sparkles} label="Model Arena" onClick={() => navigate('/arena')} />
          <NavItem icon={Users} label="Team" onClick={() => navigate('/team')} />
          <NavItem icon={CreditCard} label="Billing" onClick={() => setBillingModalOpen(true)} />
          <NavItem icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
        </nav>

        <div className="p-4 border-t border-default">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden">
              <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-secondary truncate capitalize">{activeWorkspace?.plan} Plan</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-error hover:bg-error/5 rounded transition-all"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 border-b border-default bg-inset flex items-center justify-between px-8 shrink-0">
          <h2 className="text-xl font-bold tracking-tight">Projects</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input 
                type="text" 
                placeholder="Search projects..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-72 bg-page border border-default rounded-md pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <Button 
              onClick={() => {
                if (activeWorkspace?.plan === 'free' && projects.length >= 3) {
                  alert('Upgrade to Pro for unlimited projects');
                  return;
                }
                navigate('/onboarding');
              }}
              variant="primary"
              size="md"
              className="flex items-center gap-2"
            >
              <Plus size={18} />
              New Project
            </Button>
          </div>
        </header>

        {/* Filters & Grid */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <Tabs.Root defaultValue="all" onValueChange={setActiveTab}>
            <Tabs.List className="flex gap-6 border-b border-default mb-8">
              {['All', 'Recent', 'Templates', 'Shared with me', 'Archived'].map(tab => (
                <Tabs.Trigger 
                  key={tab} 
                  value={tab.toLowerCase().replace(/\s+/g, '-')}
                  className="pb-3 text-sm font-medium text-secondary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent transition-all outline-none"
                >
                  {tab}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="templates" className="outline-none">
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Sparkles size={20} className="text-accent" />
                    Community Templates
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {templates.map(template => (
                      <div key={template.id} className="bg-page border border-default rounded-xl p-5 hover:border-accent/40 transition-all flex flex-col gap-4">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col">
                            <h4 className="font-bold text-primary">{template.name}</h4>
                            <span className="text-[10px] text-secondary">by {template.author}</span>
                          </div>
                          <div className="flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-bold rounded-full border border-accent/20">
                            <Star size={10} fill="currentColor" />
                            {template.stars}
                          </div>
                        </div>
                        <p className="text-xs text-secondary line-clamp-2">{template.description}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {template.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-surface text-secondary text-[9px] font-bold rounded uppercase tracking-wider">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <div className="mt-auto pt-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-primary">
                            {template.price === 0 ? 'Free' : `${template.price} Credits`}
                          </span>
                          <button className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-md transition-all">
                            Use Template
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Tabs.Content>

            <Tabs.Content value={activeTab} className="outline-none">
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                  <ProjectCardSkeleton />
                </div>
              ) : filteredProjects.length === 0 && activeTab !== 'all' ? (
                <div className="py-20">
                  <EmptyState 
                    icon={Search}
                    title="No projects found"
                    description="Try adjusting your search or filters to find what you're looking for."
                    actionLabel="Clear search"
                    onAction={() => setSearchQuery('')}
                  />
                </div>
              ) : filteredProjects.length === 0 && activeTab === 'all' ? (
                <div className="py-20">
                  <EmptyState 
                    icon={LayoutGrid}
                    title="No projects yet"
                    description="Create your first project to start building with Torsor."
                    actionLabel="Create project"
                    onAction={() => navigate('/onboarding')}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* New Project Card */}
                  <div 
                    onClick={() => {
                      if (activeWorkspace?.plan === 'free' && projects.length >= 3) {
                        setBillingModalOpen(true);
                        return;
                      }
                      navigate('/onboarding');
                    }}
                    className="group h-[280px] border-2 border-dashed border-default rounded-xl flex flex-col items-center justify-center gap-4 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-page border border-default rounded-full flex items-center justify-center group-hover:bg-accent-hover group-hover:text-white transition-all">
                      <Plus size={24} />
                    </div>
                    <span className="text-sm font-bold text-secondary group-hover:text-primary">
                      {activeWorkspace?.plan === 'free' && projects.length >= 3 ? 'Upgrade to Pro for unlimited projects' : 'Create new project'}
                    </span>
                  </div>

                  {/* Project Cards */}
                  {filteredProjects.map(project => (
                    <div 
                      key={project.id}
                      className="group bg-page border border-default rounded-xl overflow-hidden hover:border-accent/40 transition-all flex flex-col h-[280px]"
                    >
                      {/* Thumbnail */}
                      <div 
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="h-32 bg-inset flex items-center justify-center cursor-pointer group-hover:bg-surface transition-colors"
                      >
                        <Code2 size={40} className="text-elevated group-hover:text-accent/20 transition-colors" />
                      </div>

                      {/* Body */}
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex items-start justify-between mb-1">
                          <h4 
                            onClick={() => navigate(`/project/${project.id}`)}
                            className="font-bold text-primary hover:text-accent cursor-pointer transition-colors truncate"
                          >
                            {project.name}
                          </h4>
                        </div>
                        {(project as any).forkedFrom && (
                          <div className="text-[10px] text-secondary mb-1 italic">
                            Forked from {(project as any).forkedFrom}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-[10px] text-secondary mb-4">
                          <Clock size={12} />
                          Last edited {project.lastModified}
                        </div>

                        <div className="mt-auto flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            {project.techStack.map(tech => (
                              <TechIcon key={tech} type={tech} />
                            ))}
                          </div>
                          <div className="flex -space-x-2">
                            {project.teamMembers.slice(0, 3).map((member, i) => (
                              <div key={i} className="w-6 h-6 rounded-full border-2 border-page overflow-hidden bg-surface">
                                <img src={member.avatar} alt={member.name} className="w-full h-full object-cover" />
                              </div>
                            ))}
                            {project.teamMembers.length > 3 && (
                              <div className="w-6 h-6 rounded-full border-2 border-page bg-surface flex items-center justify-center text-[8px] font-bold text-secondary">
                                +{project.teamMembers.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div className="border-t border-default px-4 py-2 flex items-center justify-between bg-inset/50">
                        <div className={cn(
                          "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                          project.mode === 'ide' ? "bg-accent/10 text-accent border border-accent/20" : "bg-success/10 text-success border border-success/20"
                        )}>
                          {project.mode}
                        </div>
                        
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger asChild>
                            <button className="p-1 text-secondary hover:text-primary transition-colors outline-none">
                              <MoreVertical size={16} />
                            </button>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.Content className="min-w-[160px] bg-surface border border-default rounded-md p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                              <DropdownMenu.Item 
                                onClick={() => navigate(`/project/${project.id}`)}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none"
                              >
                                <ExternalLink size={14} /> Open
                              </DropdownMenu.Item>
                              <DropdownMenu.Item 
                                onClick={() => duplicateProject(project.id)}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none"
                              >
                                <Copy size={14} /> Duplicate
                              </DropdownMenu.Item>
                              <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                                <Edit2 size={14} /> Rename
                              </DropdownMenu.Item>
                              <DropdownMenu.Separator className="h-[1px] bg-elevated my-1" />
                              <DropdownMenu.Item 
                                onClick={() => archiveProject(project.id)}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none"
                              >
                                <Archive size={14} /> {project.isArchived ? 'Unarchive' : 'Archive'}
                              </DropdownMenu.Item>
                              <DropdownMenu.Item 
                                onClick={() => deleteProject(project.id)}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error hover:text-white rounded cursor-pointer outline-none"
                              >
                                <Trash2 size={14} /> Delete
                              </DropdownMenu.Item>
                            </DropdownMenu.Content>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Tabs.Content>
          </Tabs.Root>

          {/* Activity Feed */}
          <div className="mt-12 max-w-5xl mx-auto">
            <ActivityFeed />
          </div>
        </div>
        <BillingModal 
          open={isBillingModalOpen} 
          onOpenChange={setBillingModalOpen} 
        />
      </main>
    </div>
  );
};
