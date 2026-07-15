import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Globe, 
  Smartphone, 
  Palette, 
  LayoutDashboard, 
  Server, 
  Gamepad2, 
  Sparkles, 
  Puzzle, 
  Plus, 
  ArrowUp, 
  RefreshCw, 
  ChevronDown, 
  ChevronLeft, 
  ChevronRight,
  Lock,
  AlertCircle
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useProjectStore } from '../../stores/projectStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { UpgradeDialog } from '../shared/UpgradeDialog';
import { cn } from '../../lib/utils';

const PROJECT_TYPES = [
  { id: 'website', icon: Globe, label: 'Website', prompt: 'Build a modern landing page for a SaaS startup with a dark theme and glassmorphism effects.' },
  { id: 'mobile', icon: Smartphone, label: 'Mobile', prompt: 'Design a mobile-first fitness tracking app with interactive charts and a clean UI.' },
  { id: 'design', icon: Palette, label: 'Design', prompt: 'Create a design system for a creative agency, including color palettes and typography.' },
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard', prompt: 'Build a real-time sales dashboard with data visualization using Recharts.' },
  { id: 'api', icon: Server, label: 'API', prompt: 'Develop a RESTful API for a task management system with user authentication.' },
  { id: 'game', icon: Gamepad2, label: 'Game', prompt: 'Create a simple 2D platformer game using HTML5 Canvas and React.' },
  { id: 'ai', icon: Sparkles, label: 'AI App', prompt: 'Build an AI-powered content generator using the Gemini API.' },
  { id: 'extension', icon: Puzzle, label: 'Extension', prompt: 'Develop a browser extension that helps users track their productivity.' },
];

const EXAMPLE_PROMPTS = [
  "Startup pitch deck",
  "Mobile app proposal",
  "Retail sales dashboard",
  "Personal portfolio site",
  "E-commerce storefront",
  "Task management app",
  "Weather forecast widget",
  "Social media feed",
  "Recipe generator",
  "Budget tracker",
  "Music player UI",
  "Chat application"
];

export function HomeContent() {
  const navigate = useNavigate();
  const { createProject, fetchProjects, getProjectsByWorkspace } = useProjectStore();
  const { homeSidebarCollapsed } = useLayoutStore();
  const { getActiveWorkspace } = useWorkspaceStore();
  const activeWorkspace = getActiveWorkspace();
  const workspaceProjects = getProjectsByWorkspace(activeWorkspace?.id || '');
  
  const [prompt, setPrompt] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [shuffledPrompts, setShuffledPrompts] = useState<string[]>([]);
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    shufflePrompts();
    void fetchProjects();
  }, [fetchProjects]);

  const shufflePrompts = () => {
    const shuffled = [...EXAMPLE_PROMPTS].sort(() => 0.5 - Math.random()).slice(0, 3);
    setShuffledPrompts(shuffled);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || !activeWorkspace) return;

    const limit = activeWorkspace.plan === 'free' ? 3 : activeWorkspace.plan === 'pro' ? 25 : Infinity;
    if (workspaceProjects.length >= limit) {
      setUpgradeDialogOpen(true);
      return;
    }

    const newId = await createProject({
      name: prompt.slice(0, 32),
      description: prompt,
      type: 'website',
      vibe: isPlanning ? 'planner' : 'builder',
    }, activeWorkspace.id);

    navigate(`/project/${newId}`);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollTo = direction === 'left' ? scrollLeft - clientWidth / 2 : scrollLeft + clientWidth / 2;
      scrollRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' });
    }
  };

  return (
    <Tooltip.Provider delayDuration={200}>
      <main className="flex-1 overflow-y-auto bg-page h-screen">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {/* Workspace Badge */}
          <div className="flex justify-center">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-default rounded-full text-sm text-secondary cursor-pointer hover:border-accent/30 transition-colors">
              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-white text-[10px] font-bold">
                {activeWorkspace?.name.charAt(0)}
              </div>
              <span>{activeWorkspace?.name}</span>
              <ChevronDown size={14} />
            </div>
          </div>

          {/* Greeting */}
          <h1 className="text-3xl font-medium text-primary text-center mt-6">
            Hi Marko, what do you want to make?
          </h1>

          {/* Chat Input */}
          <div className="max-w-2xl mx-auto mt-8">
            <form 
              onSubmit={handleSubmit}
              className="bg-surface border border-default rounded-2xl p-3 focus-within:border-accent/30 transition-all shadow-xl"
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={handleTextareaChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Describe your idea, Agent will bring it to life..."
                className="w-full bg-transparent border-none outline-none text-primary text-base placeholder-tertiary resize-none min-h-[44px] max-h-[120px] py-1"
              />
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-default">
                <button type="button" className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-colors">
                  <Plus size={18} />
                </button>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary">Plan</span>
                    <button 
                      type="button"
                      onClick={() => setIsPlanning(!isPlanning)}
                      className={cn(
                        "w-8 h-4 rounded-full transition-colors relative",
                        isPlanning ? "bg-accent" : "bg-elevated"
                      )}
                    >
                      <div className={cn(
                        "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all",
                        isPlanning ? "left-4.5" : "left-0.5"
                      )} />
                    </button>
                  </div>
                  <button 
                    type="submit"
                    disabled={!prompt.trim()}
                    className="w-8 h-8 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <ArrowUp size={18} />
                  </button>
                </div>
              </div>
            </form>
            
            {activeWorkspace?.plan === 'free' && workspaceProjects.length >= 3 && (
              <div className="mt-3 flex items-center gap-2 justify-center text-xs text-warning">
                <AlertCircle size={14} />
                <span>Free plan limit reached (3/3 projects). <button onClick={() => setUpgradeDialogOpen(true)} className="underline font-bold">Upgrade to create more</button></span>
              </div>
            )}
          </div>

          {/* Project Type Icons */}
          <div className="relative mt-10 group">
            <button 
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 w-8 h-8 bg-surface border border-default rounded-full flex items-center justify-center text-secondary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft size={16} />
            </button>
            <div 
              ref={scrollRef}
              className="flex justify-center gap-6 overflow-x-auto no-scrollbar px-4"
            >
              {PROJECT_TYPES.map((type) => (
                <button 
                  key={type.id}
                  onClick={() => setPrompt(type.prompt)}
                  className="flex flex-col items-center gap-2 shrink-0 group/type"
                >
                  <div className="w-14 h-14 bg-surface border border-default rounded-xl flex items-center justify-center text-secondary group-hover/type:border-accent/50 group-hover/type:text-accent transition-all">
                    <type.icon size={24} />
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-secondary group-hover/type:text-primary">
                    {type.label}
                  </span>
                </button>
              ))}
            </div>
            <button 
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 w-8 h-8 bg-surface border border-default rounded-full flex items-center justify-center text-secondary hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Example Prompts */}
          <div className="text-center mt-10">
            <div className="flex items-center justify-center gap-2 text-xs text-secondary mb-4">
              <span>Try an example prompt</span>
              <button onClick={shufflePrompts} className="hover:text-primary transition-colors">
                <RefreshCw size={12} />
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {shuffledPrompts.map((p) => (
                <button 
                  key={p}
                  onClick={() => setPrompt(p)}
                  className="bg-surface border border-default rounded-lg px-4 py-1.5 text-sm text-secondary hover:text-primary hover:border-accent/30 transition-all"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Recent Projects */}
          <div className="mt-12 border-t border-default pt-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-primary">Your recent Projects</h2>
              <Link to="/projects" className="text-sm text-secondary hover:text-accent transition-colors">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {workspaceProjects.slice(0, 3).map((project) => (
                <Link 
                  key={project.id}
                  to={`/project/${project.id}`}
                  className="group bg-surface border border-default rounded-xl overflow-hidden hover:border-accent/30 transition-all"
                >
                  <div className="h-[120px] bg-page flex items-center justify-center p-4">
                    <div className="w-12 h-12 rounded-lg bg-elevated flex items-center justify-center text-accent group-hover:scale-110 transition-transform">
                      {(() => {
                        const Icon = PROJECT_TYPES.find(t => t.id === project.type)?.icon || Globe;
                        return <Icon size={24} />;
                      })()}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-primary truncate">{project.name}</h3>
                    <p className="text-xs text-secondary mt-1">Edited {project.lastEdited}</p>
                  </div>
                </Link>
              ))}
              {workspaceProjects.length === 0 && (
                <div className="col-span-3 py-12 flex flex-col items-center justify-center text-tertiary border border-dashed border-default rounded-xl">
                  <Plus size={32} className="mb-2 opacity-20" />
                  <p className="text-sm">No projects in this workspace yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <UpgradeDialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen} />
      </main>
    </Tooltip.Provider>
  );
}

