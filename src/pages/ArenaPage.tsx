import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { 
  LayoutGrid, 
  Layers, 
  Users, 
  CreditCard, 
  Settings, 
  LogOut, 
  ChevronDown,
  Sparkles,
  Flag,
  Clock,
  Hash,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Plus,
  X,
  Crown,
  Trophy,
  BarChart3,
  ArrowUpRight,
  ChevronRight,
  Search,
  Filter,
  Calendar
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import * as Tabs from '@radix-ui/react-tabs';
import * as Switch from '@radix-ui/react-switch';
import * as Progress from '@radix-ui/react-progress';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import ReactMarkdown from 'react-markdown';
import { useAuthStore } from '../stores/authStore';
import { usageMock } from '../lib/mockData';
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

const ModelSelector = ({ value, onValueChange, onRemove, canRemove }: { value: string, onValueChange: (val: string) => void, onRemove: () => void, canRemove: boolean }) => (
  <div className="flex-1 flex items-center gap-2">
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger className="flex-1 flex items-center justify-between px-3 py-2 bg-page border border-default rounded-md text-xs font-medium outline-none hover:border-accent/50 transition-colors">
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={14} className="text-secondary" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50 overflow-hidden">
          <Select.Viewport className="p-1">
            {[
              { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', color: 'bg-accent' },
              { id: 'gpt-4o', name: 'GPT-4o', color: 'bg-info' },
              { id: 'deepseek-v3', name: 'DeepSeek V3', color: 'bg-warning' },
              { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', color: 'bg-success' },
            ].map(model => (
              <Select.Item key={model.id} value={model.id} className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                <div className={cn("w-2 h-2 rounded-full", model.color)} />
                <Select.ItemText>{model.name}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
    {canRemove && (
      <button onClick={onRemove} className="p-2 text-secondary hover:text-error transition-colors">
        <X size={16} />
      </button>
    )}
  </div>
);

const ModelColumn = ({ 
  modelId, 
  isRacing, 
  isConsensus, 
  isWinner, 
  isLoser,
  onVote 
}: { 
  modelId: string, 
  isRacing: boolean, 
  isConsensus?: boolean, 
  isWinner?: boolean,
  isLoser?: boolean,
  onVote: (vote: 'up' | 'down') => void 
}) => {
  const [displayText, setDisplayText] = useState('');
  const [vote, setVote] = useState<'up' | 'down' | null>(null);
  const fullText = (usageMock.arenaResponses as any)[modelId] || '';
  
  const modelInfo = {
    'claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', color: 'bg-accent', time: '2.3s', tokens: '1,240', cost: '$0.003', speed: 15 },
    'gpt-4o': { name: 'GPT-4o', color: 'bg-info', time: '1.8s', tokens: '980', cost: '$0.002', speed: 10 },
    'deepseek-v3': { name: 'DeepSeek V3', color: 'bg-warning', time: '1.2s', tokens: '1,120', cost: '$0.0005', speed: 8 },
    'gemini-1.5-pro': { name: 'Gemini 1.5 Pro', color: 'bg-success', time: '1.0s', tokens: '850', cost: '$0.001', speed: 5 },
  }[modelId] || { name: 'Unknown', color: 'bg-zinc-500', time: '0s', tokens: '0', cost: '$0', speed: 10 };

  useEffect(() => {
    if (isRacing) {
      setDisplayText('');
      let i = 0;
      const interval = setInterval(() => {
        setDisplayText(fullText.slice(0, i));
        i++;
        if (i > fullText.length) clearInterval(interval);
      }, modelInfo.speed);
      return () => clearInterval(interval);
    }
  }, [isRacing, fullText, modelInfo.speed]);

  return (
    <div className={cn(
      "flex-1 flex flex-col bg-page rounded-xl border transition-all duration-500 overflow-hidden",
      isWinner ? "border-accent shadow-[0_0_20px_rgba(124,111,247,0.2)] scale-[1.02] z-10" : "border-default",
      isLoser ? "opacity-40 grayscale" : "opacity-100"
    )}>
      <div className="h-10 border-b border-default px-3 flex items-center justify-between bg-surface/50">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", modelInfo.color)} />
          <span className="text-xs font-bold">{modelInfo.name}</span>
        </div>
        {isWinner && <Crown size={16} className="text-warning animate-bounce" />}
      </div>
      
      <div className="px-3 py-2 flex gap-4 border-b border-default/50 bg-inset/30">
        <div className="flex items-center gap-1 text-[10px] text-secondary">
          <Clock size={12} /> {modelInfo.time}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-secondary">
          <Hash size={12} /> {modelInfo.tokens}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-secondary">
          <DollarSign size={12} /> {modelInfo.cost}
        </div>
      </div>

      <ScrollArea.Root className="flex-1 w-full h-full overflow-hidden">
        <ScrollArea.Viewport className="w-full h-full p-4">
          <div className="prose prose-invert prose-xs max-w-none">
            <ReactMarkdown>{displayText}</ReactMarkdown>
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[160ms] ease-out hover:bg-white/5 data-[orientation=vertical]:w-1.5" orientation="vertical">
          <ScrollArea.Thumb className="flex-1 bg-elevated rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      <div className="border-t border-default px-3 py-2 flex items-center justify-between bg-inset/30">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => { setVote('up'); onVote('up'); }}
            className={cn("p-1.5 rounded transition-colors", vote === 'up' ? "text-success bg-success/10" : "text-secondary hover:text-success")}
          >
            <ThumbsUp size={14} />
          </button>
          <button 
            onClick={() => { setVote('down'); onVote('down'); }}
            className={cn("p-1.5 rounded transition-colors", vote === 'down' ? "text-error bg-error/10" : "text-secondary hover:text-error")}
          >
            <ThumbsDown size={14} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors">Use This</button>
          <button className="p-1.5 text-secondary hover:text-primary transition-colors">
            <Copy size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const ArenaPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [prompt, setPrompt] = useState('');
  const [selectedModels, setSelectedModels] = useState(['claude-3.5-sonnet', 'gpt-4o', 'deepseek-v3']);
  const [isRacing, setIsRacing] = useState(false);
  const [isConsensusMode, setIsConsensusMode] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [votes, setVotes] = useState<Record<number, 'up' | 'down'>>({});
  const [activeTab, setActiveTab] = useState('arena');

  const handleRace = () => {
    if (!prompt.trim()) return;
    setIsRacing(true);
    setShowWinner(false);
    setVotes({});
    
    if (isConsensusMode) {
      setIsEvaluating(true);
      setTimeout(() => {
        setIsEvaluating(false);
        setShowWinner(true);
      }, 4000);
    }
  };

  const handleNewRace = () => {
    setIsRacing(false);
    setShowWinner(false);
    setPrompt('');
    setVotes({});
  };

  const addModel = () => {
    if (selectedModels.length < 4) {
      setSelectedModels([...selectedModels, 'gemini-1.5-pro']);
    }
  };

  const removeModel = (index: number) => {
    if (selectedModels.length > 2) {
      setSelectedModels(selectedModels.filter((_, i) => i !== index));
    }
  };

  const updateModel = (index: number, val: string) => {
    const newModels = [...selectedModels];
    newModels[index] = val;
    setSelectedModels(newModels);
  };

  const handleVote = (index: number, vote: 'up' | 'down') => {
    setVotes(prev => ({ ...prev, [index]: vote }));
  };

  const allVoted = Object.keys(votes).length === (isConsensusMode ? 2 : selectedModels.length);

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
          <NavItem icon={LayoutGrid} label="Projects" onClick={() => navigate('/dashboard')} />
          <NavItem icon={Sparkles} label="Model Arena" active />
          <NavItem icon={Users} label="Team" onClick={() => navigate('/team')} />
          <NavItem icon={CreditCard} label="Billing" onClick={() => navigate('/billing')} />
          <NavItem icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
        </nav>

        <div className="p-4 border-t border-default">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden">
              <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-secondary truncate">Pro Plan</p>
            </div>
          </div>
          <button 
            onClick={() => { logout(); navigate('/login'); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-error hover:bg-error/5 rounded transition-all"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-default bg-inset flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-8">
            <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
              <Tabs.List className="flex gap-6">
                <Tabs.Trigger value="arena" className="py-4 text-sm font-medium text-secondary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent outline-none transition-all">Arena</Tabs.Trigger>
                <Tabs.Trigger value="leaderboard" className="py-4 text-sm font-medium text-secondary data-[state=active]:text-accent data-[state=active]:border-b-2 data-[state=active]:border-accent outline-none transition-all">Leaderboard</Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-secondary">Consensus Mode</span>
              <Switch.Root 
                checked={isConsensusMode} 
                onCheckedChange={(val) => {
                  setIsConsensusMode(val);
                  if (val) setSelectedModels(selectedModels.slice(0, 2));
                }}
                className="w-8 h-4 bg-elevated rounded-full relative data-[state=checked]:bg-accent outline-none transition-colors"
              >
                <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
              </Switch.Root>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            
            {activeTab === 'arena' ? (
              <div className="flex-1 flex flex-col gap-8">
                {/* Top Section */}
                {!isRacing ? (
                  <section className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full text-accent text-xs font-bold">
                        <Sparkles size={14} /> Model Arena
                      </div>
                      <h1 className="text-3xl font-bold tracking-tight">Race models head-to-head</h1>
                      <p className="text-secondary text-sm">Compare performance, quality, and cost across the world's best AI models.</p>
                    </div>

                    <div className="bg-page border border-default rounded-xl p-6 space-y-6 shadow-xl">
                      <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter a coding task to compare models... (e.g. 'Build a JWT auth middleware for Express')"
                        className="w-full bg-inset border border-default rounded-lg p-4 text-sm outline-none focus:border-accent transition-colors resize-none h-32"
                      />
                      
                      <div className="flex items-center gap-4">
                        <div className="flex-1 flex gap-4">
                          {selectedModels.map((model, i) => (
                            <ModelSelector 
                              key={i} 
                              value={model} 
                              onValueChange={(val) => updateModel(i, val)}
                              onRemove={() => removeModel(i)}
                              canRemove={selectedModels.length > 2 && !isConsensusMode}
                            />
                          ))}
                          {selectedModels.length < 4 && !isConsensusMode && (
                            <button 
                              onClick={addModel}
                              className="px-4 py-2 border border-dashed border-default rounded-md text-secondary hover:text-primary hover:border-default transition-all flex items-center gap-2 text-xs font-medium"
                            >
                              <Plus size={14} /> Add Model
                            </button>
                          )}
                        </div>
                      </div>

                      <button 
                        onClick={handleRace}
                        disabled={!prompt.trim()}
                        className="w-full h-12 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-accent/20"
                      >
                        <Flag size={20} />
                        Race Models
                      </button>
                    </div>
                  </section>
                ) : (
                  <div className="flex-1 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button onClick={handleNewRace} className="text-xs font-bold text-secondary hover:text-primary transition-colors flex items-center gap-2">
                          <Plus size={14} /> New Race
                        </button>
                        <div className="h-4 w-[1px] bg-elevated" />
                        <p className="text-xs text-secondary truncate max-w-md italic">"{prompt}"</p>
                      </div>
                      {allVoted && !isConsensusMode && (
                        <div className="flex items-center gap-2 text-warning animate-in fade-in slide-in-from-right-4">
                          <Trophy size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Winner Declared</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 flex gap-4 min-h-0">
                      {selectedModels.map((modelId, i) => (
                        <ModelColumn 
                          key={i} 
                          modelId={modelId} 
                          isRacing={isRacing} 
                          isConsensus={isConsensusMode}
                          isWinner={showWinner && i === 0}
                          isLoser={showWinner && i === 1}
                          onVote={(v) => handleVote(i, v)}
                        />
                      ))}
                    </div>

                    {isConsensusMode && (
                      <div className="animate-in slide-in-from-bottom-4 duration-700">
                        <div className={cn(
                          "bg-accent/5 border rounded-xl p-6 transition-all duration-500",
                          showWinner ? "border-accent/40" : "border-accent/10"
                        )}>
                          {isEvaluating ? (
                            <div className="flex flex-col items-center justify-center py-4 space-y-4">
                              <div className="flex gap-1">
                                <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-2 h-2 bg-accent rounded-full animate-bounce" />
                              </div>
                              <p className="text-sm font-medium text-accent">Evaluating responses...</p>
                            </div>
                          ) : showWinner && (
                            <div className="space-y-4 animate-in fade-in duration-500">
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <h4 className="text-lg font-bold flex items-center gap-2">
                                    Winner: Claude 3.5 Sonnet
                                    <Crown size={20} className="text-warning" />
                                  </h4>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs text-accent font-bold">87% confidence</span>
                                    <div className="w-32 h-1.5 bg-inset rounded-full overflow-hidden">
                                      <Progress.Root className="h-full w-full bg-transparent">
                                        <Progress.Indicator className="h-full bg-accent transition-transform duration-1000" style={{ transform: 'translateX(-13%)' }} />
                                      </Progress.Root>
                                    </div>
                                  </div>
                                </div>
                                <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-md text-sm font-bold transition-all">
                                  Apply Consensus
                                </button>
                              </div>
                              <p className="text-sm text-secondary leading-relaxed">
                                Claude's implementation was selected for its superior documentation, strict adherence to TypeScript best practices, and more robust error handling patterns compared to the alternative. It correctly handles edge cases like malformed headers and provides clearer feedback for security audits.
                              </p>
                              <Collapsible.Root>
                                <Collapsible.Trigger className="flex items-center gap-2 text-xs font-bold text-secondary hover:text-primary transition-colors">
                                  <ChevronRight size={14} className="group-data-[state=open]:rotate-90 transition-transform" />
                                  Show rejected response
                                </Collapsible.Trigger>
                                <Collapsible.Content className="mt-4 p-4 bg-inset rounded-lg border border-default opacity-50">
                                  <p className="text-xs font-mono">Rejected: GPT-4o (Concise but lacks robust error typing)</p>
                                </Collapsible.Content>
                              </Collapsible.Root>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Arena Leaderboard</h1>
                    <p className="text-sm text-secondary">Global performance rankings based on user votes and consensus wins.</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ToggleGroup.Root type="single" defaultValue="30d" className="flex bg-page border border-default rounded-md p-1">
                      <ToggleGroup.Item value="7d" className="px-3 py-1 text-[10px] font-bold rounded data-[state=on]:bg-accent data-[state=on]:text-white text-secondary transition-all">7D</ToggleGroup.Item>
                      <ToggleGroup.Item value="30d" className="px-3 py-1 text-[10px] font-bold rounded data-[state=on]:bg-accent data-[state=on]:text-white text-secondary transition-all">30D</ToggleGroup.Item>
                      <ToggleGroup.Item value="all" className="px-3 py-1 text-[10px] font-bold rounded data-[state=on]:bg-accent data-[state=on]:text-white text-secondary transition-all">ALL</ToggleGroup.Item>
                    </ToggleGroup.Root>
                    <button className="p-2 bg-page border border-default rounded-md text-secondary hover:text-primary transition-colors">
                      <Filter size={18} />
                    </button>
                  </div>
                </div>

                <div className="bg-page border border-default rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-default bg-surface/50">
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Rank</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Model</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Wins</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Win Rate</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Avg Time</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider">Avg Tokens</th>
                        <th className="px-6 py-4 font-medium text-secondary text-xs uppercase tracking-wider text-right">Cost/1k</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default">
                      {usageMock.arenaLeaderboard.map((model) => (
                        <tr key={model.rank} className="hover:bg-surface transition-colors group">
                          <td className="px-6 py-4">
                            <div className={cn(
                              "w-6 h-6 rounded flex items-center justify-center text-xs font-bold",
                              model.rank === 1 ? "bg-warning/20 text-warning" : 
                              model.rank === 2 ? "bg-zinc-400/20 text-zinc-400" :
                              model.rank === 3 ? "bg-warning/20 text-warning" : "text-secondary"
                            )}>
                              #{model.rank}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded bg-surface flex items-center justify-center border border-default",
                                model.model.includes('Claude') ? "text-accent" :
                                model.model.includes('GPT') ? "text-info" :
                                model.model.includes('DeepSeek') ? "text-warning" : "text-success"
                              )}>
                                <Box size={16} />
                              </div>
                              <div>
                                <p className="font-medium">{model.model}</p>
                                <p className="text-[10px] text-secondary">{model.provider}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 font-mono text-xs">{model.wins.toLocaleString()}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-16 h-1.5 bg-inset rounded-full overflow-hidden">
                                <div className="h-full bg-accent" style={{ width: `${model.winRate}%` }} />
                              </div>
                              <span className="text-xs font-bold">{model.winRate}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-secondary text-xs">{model.avgTime}</td>
                          <td className="px-6 py-4 text-secondary text-xs">{model.avgTokens}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs text-success">{model.totalCost}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </main>
    </div>
  );
};

const Box = ({ size, className }: { size: number, className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);
