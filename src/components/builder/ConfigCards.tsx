import React, { useState } from 'react';
import { Lock, Package, Settings, X, Plus, Trash2, Eye, EyeOff, Search, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { useConfigStore, Secret, Package as PackageType } from '../../stores/configStore';
import { useAppStore } from '../../useAppStore';
import { cn } from '../../lib/utils';

export function ConfigCards() {
  const activeCard = useAppStore(state => state.activeConfigCard);
  const setActiveCard = useAppStore(state => state.setActiveConfigCard);

  if (!activeCard) return null;

  return (
    <div className="absolute bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
      {activeCard === 'secrets' && <SecretsCard onClose={() => setActiveCard(null)} />}
      {activeCard === 'packages' && <PackagesCard onClose={() => setActiveCard(null)} />}
      {activeCard === 'config' && <ProjectConfigCard onClose={() => setActiveCard(null)} />}
    </div>
  );
}

function SecretsCard({ onClose }: { onClose: () => void }) {
  const { secrets, addSecret, removeSecret } = useConfigStore();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<string[]>([]);

  const toggleReveal = (key: string) => {
    setRevealedKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleAdd = () => {
    if (newKey && newValue) {
      addSecret(newKey, newValue);
      setNewKey('');
      setNewValue('');
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-default shadow-2xl overflow-hidden max-w-md mx-auto">
      <div className="px-4 py-3 border-b border-default flex items-center justify-between bg-elevated">
        <div className="flex items-center gap-2">
          <Lock size={16} className="text-warning" />
          <span className="text-sm font-bold text-primary">Secrets</span>
        </div>
        <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
          <X size={16} />
        </button>
      </div>
      
      <div className="p-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
          {secrets.map(secret => (
            <div key={secret.key} className="flex items-center justify-between bg-inset p-2 rounded border border-subtle">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">{secret.key}</span>
                <span className="text-xs font-mono text-primary">
                  {revealedKeys.includes(secret.key) ? secret.value : '••••••••••••'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => toggleReveal(secret.key)}
                  className="p-1.5 text-secondary hover:text-primary transition-colors"
                >
                  {revealedKeys.includes(secret.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button 
                  onClick={() => removeSecret(secret.key)}
                  className="p-1.5 text-secondary hover:text-error transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input 
            placeholder="Key (e.g. STRIPE_KEY)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
          />
          <input 
            type="password"
            placeholder="Value"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
          />
        </div>
        <button 
          onClick={handleAdd}
          className="w-full py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold uppercase tracking-wider rounded transition-all"
        >
          Add Secret
        </button>
      </div>
      
      <div className="px-4 py-2 bg-inset border-t border-default text-[9px] text-secondary italic text-center">
        Secrets are encrypted and never visible to AI agents
      </div>
    </div>
  );
}

function PackagesCard({ onClose }: { onClose: () => void }) {
  const { packages, addPackage } = useConfigStore();
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const mockSuggestions = [
    { name: 'react', version: '^18.2.0', size: '2.5kb' },
    { name: 'express', version: '^4.18.2', size: '1.8kb' },
    { name: 'prisma', version: '^5.2.0', size: '4.2kb' },
    { name: 'stripe', version: '^13.2.0', size: '3.1kb' },
    { name: 'tailwindcss', version: '^3.3.3', size: '0.5kb' },
    { name: 'zod', version: '^3.22.2', size: '0.9kb' },
  ].filter(p => p.name.includes(search.toLowerCase()) && !packages.find(ep => ep.name === p.name));

  return (
    <div className="bg-surface rounded-xl border border-default shadow-2xl overflow-hidden max-w-md mx-auto">
      <div className="px-4 py-3 border-b border-default flex items-center justify-between bg-elevated">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-info" />
          <span className="text-sm font-bold text-primary">Packages</span>
        </div>
        <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input 
            placeholder="Search npm packages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-inset border border-subtle rounded-md pl-9 pr-3 py-2 text-xs text-primary outline-none focus:border-accent/50"
          />
          
          {search && mockSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-elevated border border-default rounded-md shadow-xl z-10 overflow-hidden">
              {mockSuggestions.map(pkg => (
                <button 
                  key={pkg.name}
                  onClick={() => { addPackage(pkg); setSearch(''); }}
                  className="w-full px-3 py-2 text-left text-xs text-primary hover:bg-accent/10 flex items-center justify-between group"
                >
                  <span>{pkg.name}</span>
                  <span className="text-[10px] text-secondary group-hover:text-accent-hover">Add</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 no-scrollbar">
          {packages.map(pkg => (
            <div key={pkg.name} className="flex items-center justify-between bg-inset p-2 rounded border border-subtle">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-primary">{pkg.name}</span>
                <span className="text-[10px] text-secondary">{pkg.version}</span>
              </div>
              <span className="text-[10px] text-secondary font-mono">{pkg.size}</span>
            </div>
          ))}
        </div>

        <button 
          onClick={() => setShowAll(!showAll)}
          className="flex items-center justify-center gap-1 text-[10px] font-bold text-secondary hover:text-primary uppercase tracking-widest transition-colors"
        >
          {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showAll ? 'Hide dependencies' : 'View all dependencies'}
        </button>

        {showAll && (
          <div className="bg-page p-3 rounded border border-subtle font-mono text-[10px] text-secondary overflow-x-auto">
            <pre>{JSON.stringify({ dependencies: packages.reduce((acc, p) => ({ ...acc, [p.name]: p.version }), {}) }, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectConfigCard({ onClose }: { onClose: () => void }) {
  const { config, updateConfig } = useConfigStore();

  return (
    <div className="bg-surface rounded-xl border border-default shadow-2xl overflow-hidden max-w-md mx-auto">
      <div className="px-4 py-3 border-b border-default flex items-center justify-between bg-elevated">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-success" />
          <span className="text-sm font-bold text-primary">Project Config</span>
        </div>
        <button onClick={onClose} className="text-secondary hover:text-primary transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-secondary">Framework</span>
          <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] font-bold rounded border border-success/20">
            {config.framework}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Node Version</label>
            <select 
              value={config.nodeVersion}
              onChange={e => updateConfig({ nodeVersion: e.target.value as any })}
              className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary outline-none"
            >
              <option value="18">Node 18</option>
              <option value="20">Node 20</option>
              <option value="22">Node 22</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Package Manager</label>
            <select 
              value={config.packageManager}
              onChange={e => updateConfig({ packageManager: e.target.value as any })}
              className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary outline-none"
            >
              <option value="npm">npm</option>
              <option value="pnpm">pnpm</option>
              <option value="yarn">yarn</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Build Command</label>
            <input 
              value={config.buildCommand}
              onChange={e => updateConfig({ buildCommand: e.target.value })}
              className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary font-mono outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Dev Command</label>
            <input 
              value={config.devCommand}
              onChange={e => updateConfig({ devCommand: e.target.value })}
              className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary font-mono outline-none focus:border-accent/50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Output Directory</label>
            <input 
              value={config.outputDir}
              onChange={e => updateConfig({ outputDir: e.target.value })}
              className="bg-inset border border-subtle rounded px-2 py-1.5 text-xs text-primary font-mono outline-none focus:border-accent/50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
