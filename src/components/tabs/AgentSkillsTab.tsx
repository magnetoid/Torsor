import React, { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { 
  Sparkles, 
  Code2, 
  Terminal, 
  Database, 
  Package, 
  GitBranch, 
  Rocket, 
  ShieldCheck, 
  Image, 
  Globe, 
  Files, 
  Plus, 
  Trash2, 
  Settings, 
  Zap, 
  BarChart3,
  ChevronRight,
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface Skill {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  canDisable: boolean;
  uses: number;
}

const DEFAULT_SKILLS: Skill[] = [
  { id: 'code-gen', name: 'Code generation', description: 'Write and modify code files.', icon: <Code2 size={18} />, enabled: true, canDisable: false, uses: 24 },
  { id: 'terminal', name: 'Terminal access', description: 'Run shell commands.', icon: <Terminal size={18} />, enabled: true, canDisable: true, uses: 12 },
  { id: 'database', name: 'Database management', description: 'Create tables, run migrations, query data.', icon: <Database size={18} />, enabled: true, canDisable: true, uses: 8 },
  { id: 'package', name: 'Package management', description: 'Install and manage npm/pip packages.', icon: <Package size={18} />, enabled: true, canDisable: true, uses: 5 },
  { id: 'git', name: 'Git operations', description: 'Commit, push, branch, merge.', icon: <GitBranch size={18} />, enabled: true, canDisable: true, uses: 15 },
  { id: 'deploy', name: 'Deploy', description: 'Deploy to Vercel, Netlify, or custom servers.', icon: <Rocket size={18} />, enabled: true, canDisable: true, uses: 3 },
  { id: 'security', name: 'Security scanning', description: 'Scan for vulnerabilities and fix them.', icon: <ShieldCheck size={18} />, enabled: true, canDisable: true, uses: 2 },
  { id: 'image', name: 'Image analysis', description: 'Understand screenshots and Figma designs.', icon: <Image size={18} />, enabled: true, canDisable: true, uses: 4 },
  { id: 'web-search', name: 'Web search', description: 'Search the web for documentation and solutions.', icon: <Globe size={18} />, enabled: true, canDisable: true, uses: 18 },
  { id: 'file-mgmt', name: 'File management', description: 'Create, delete, rename, organize files.', icon: <Files size={18} />, enabled: true, canDisable: true, uses: 32 },
];

interface CustomSkill {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export default function AgentSkillsTab() {
  const [skills, setSkills] = useState<Skill[]>(DEFAULT_SKILLS);
  const [customSkills, setCustomSkills] = useState<CustomSkill[]>([]);
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newSkill, setNewSkill] = useState<Omit<CustomSkill, 'id'>>({
    name: '',
    description: '',
    instruction: ''
  });

  const toggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => 
      s.id === id && s.canDisable ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const addCustomSkill = () => {
    if (!newSkill.name || !newSkill.instruction) return;
    setCustomSkills(prev => [...prev, { ...newSkill, id: `custom-${Date.now()}` }]);
    setNewSkill({ name: '', description: '', instruction: '' });
    setIsAddingSkill(false);
  };

  const removeCustomSkill = (id: string) => {
    setCustomSkills(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col bg-page overflow-y-auto no-scrollbar">
      {/* HEADER */}
      <div className="h-12 bg-surface flex items-center justify-between px-4 shrink-0 border-b border-default sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-accent" />
          <h2 className="text-sm font-bold text-primary">Agent Skills</h2>
        </div>
        <button 
          onClick={() => setIsAddingSkill(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
        >
          <Plus size={14} />
          Add Skill
        </button>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-8">
        {/* DEFAULT SKILLS */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4">Core Capabilities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {skills.map((skill) => (
              <div 
                key={skill.id}
                className={cn(
                  "bg-surface rounded-xl border border-default p-4 flex items-center justify-between transition-all",
                  !skill.enabled && "opacity-50 grayscale"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2 rounded-lg bg-page border border-default",
                    skill.enabled ? "text-accent" : "text-tertiary"
                  )}>
                    {skill.icon}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-primary mb-0.5">{skill.name}</h4>
                    <p className="text-[11px] text-secondary leading-tight">{skill.description}</p>
                  </div>
                </div>
                <Switch.Root 
                  checked={skill.enabled}
                  onCheckedChange={() => toggleSkill(skill.id)}
                  disabled={!skill.canDisable}
                  className={cn(
                    "w-8 h-4 rounded-full relative transition-colors outline-none cursor-pointer disabled:cursor-not-allowed",
                    skill.enabled ? "bg-accent" : "bg-elevated"
                  )}
                >
                  <Switch.Thumb className="block w-3 h-3 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-[18px]" />
                </Switch.Root>
              </div>
            ))}
          </div>
        </section>

        {/* CUSTOM SKILLS */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-widest mb-4">Custom Instructions</h3>
          <div className="space-y-3">
            {customSkills.map((skill) => (
              <div 
                key={skill.id}
                className="bg-surface rounded-xl border border-default p-4 group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap size={14} className="text-warning" />
                    <h4 className="text-sm font-bold text-primary">{skill.name}</h4>
                  </div>
                  <button 
                    onClick={() => removeCustomSkill(skill.id)}
                    className="p-1 text-tertiary hover:text-error transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <p className="text-xs text-secondary mb-3">{skill.description}</p>
                <div className="bg-page rounded-lg p-3 border border-default font-mono text-[11px] text-accent/80 italic">
                  "{skill.instruction}"
                </div>
              </div>
            ))}

            {isAddingSkill ? (
              <div className="bg-surface rounded-xl border border-accent/30 p-5 space-y-4 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-accent uppercase tracking-widest">New Custom Skill</h4>
                  <button onClick={() => setIsAddingSkill(false)} className="text-secondary hover:text-primary">
                    <Plus size={16} className="rotate-45" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Skill Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Zod Validation"
                      value={newSkill.name}
                      onChange={(e) => setNewSkill(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Description</label>
                    <input 
                      type="text" 
                      placeholder="What does this skill do?"
                      value={newSkill.description}
                      onChange={(e) => setNewSkill(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-secondary uppercase tracking-wider">Instruction (System Prompt Addition)</label>
                    <textarea 
                      placeholder="When building forms, always use Zod for validation..."
                      value={newSkill.instruction}
                      onChange={(e) => setNewSkill(prev => ({ ...prev, instruction: e.target.value }))}
                      className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary outline-none focus:border-accent/50 min-h-[80px] resize-none"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => setIsAddingSkill(false)}
                    className="flex-1 px-3 py-2 rounded-lg border border-default text-primary text-xs font-bold uppercase tracking-wider hover:bg-elevated transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addCustomSkill}
                    className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20"
                  >
                    Add Skill
                  </button>
                </div>
              </div>
            ) : (
              <button 
                onClick={() => setIsAddingSkill(true)}
                className="w-full h-24 rounded-xl border border-dashed border-default hover:border-accent/50 hover:bg-accent/5 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="w-8 h-8 rounded-full bg-surface border border-default flex items-center justify-center group-hover:bg-accent group-hover:border-accent-hover transition-colors">
                  <Plus size={16} className="text-secondary group-hover:text-white" />
                </div>
                <span className="text-xs font-medium text-secondary group-hover:text-accent">Add custom skill</span>
              </button>
            )}
          </div>
        </section>

        {/* USAGE STATS */}
        <section className="bg-surface rounded-xl border border-default p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-accent" />
              <h3 className="text-xs font-bold text-primary uppercase tracking-widest">Skill Usage (This Session)</h3>
            </div>
            <div className="flex items-center gap-1 text-xs text-secondary">
              <Info size={12} />
              <span>Updated in real-time</span>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {skills.filter(s => s.uses > 10).map(skill => (
              <div key={skill.id} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tighter">
                  <span className="text-secondary">{skill.name}</span>
                  <span className="text-accent">{skill.uses}</span>
                </div>
                <div className="h-1 w-full bg-page rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent" 
                    style={{ width: `${(skill.uses / 40) * 100}%` }} 
                  />
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-tighter">
                <span className="text-secondary">Total Actions</span>
                <span className="text-success">121</span>
              </div>
              <div className="h-1 w-full bg-page rounded-full overflow-hidden">
                <div className="h-full bg-success w-[75%]" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
