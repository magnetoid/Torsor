import React, { useState, useMemo, useEffect } from 'react';
import { 
  Rocket, 
  ExternalLink, 
  RotateCcw, 
  XCircle, 
  CheckCircle2, 
  Globe, 
  Plus, 
  Server, 
  Cloud, 
  Github, 
  Terminal, 
  History, 
  ChevronDown, 
  ChevronUp, 
  MoreVertical, 
  ShieldCheck, 
  Cpu, 
  Settings,
  ArrowRight,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDeployStore, DeployTarget, Environment, Deployment } from '../../stores/deployStore';
import * as Progress from '@radix-ui/react-progress';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Collapsible from '@radix-ui/react-collapsible';

const TargetIcon = ({ id, className }: { id: DeployTarget; className?: string }) => {
  const iconSize = 16;
  switch (id) {
    case 'torsor': return <Rocket size={iconSize} className={cn("text-accent", className)} />;
    case 'vercel': return <Globe size={iconSize} className={cn("text-primary", className)} />;
    case 'netlify': return <Cloud size={iconSize} className={cn("text-success", className)} />;
    case 'coolify': return <Server size={iconSize} className={cn("text-accent", className)} />;
    case 'gcp': return <Cloud size={iconSize} className={cn("text-info", className)} />;
    case 'ssh': return <Terminal size={iconSize} className={cn("text-warning", className)} />;
    default: return <Server size={iconSize} className={cn("text-secondary", className)} />;
  }
};

export default function PublishingTab() {
  const { 
    currentDeployment, 
    history, 
    targets, 
    settings, 
    updateSettings, 
    deploy,
    unpublish,
    fetchDeployment,
    isDeploying,
    customDomains,
    addDomain,
    rollback
  } = useDeployStore();

  const [logsOpen, setLogsOpen] = useState(true);
  const [newDomain, setNewDomain] = useState('');

  // Sync the real deployment state for the active project on mount.
  useEffect(() => {
    void fetchDeployment();
  }, [fetchDeployment]);

  const handleDeploy = (target: DeployTarget) => {
    deploy(target);
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDomain) {
      addDomain(newDomain);
      setNewDomain('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      {/* Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface sticky top-0 z-20 shrink-0">
        <div className="flex items-center gap-2">
          <Rocket size={16} className="text-accent" />
          <span className="text-xs font-bold text-primary">Publishing</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="flex bg-page p-0.5 rounded-lg border border-default">
            {(['production', 'staging', 'preview'] as Environment[]).map((env) => (
              <button 
                key={env}
                onClick={() => updateSettings({ environment: env })}
                className={cn(
                  "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  settings.environment === env ? "bg-elevated text-primary" : "text-secondary hover:text-primary"
                )}
              >
                {env}
              </button>
            ))}
          </div>
          
          <button 
            disabled={isDeploying}
            onClick={() => handleDeploy('torsor')}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white text-[11px] font-bold rounded-lg transition-all"
          >
            {isDeploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Deploy to Production
          </button>
        </div>
      </header>

      <div className="p-6 space-y-8 max-w-5xl mx-auto w-full">
        {/* Current Deployment Status */}
        <section>
          <h3 className="text-xs font-bold text-primary uppercase tracking-wider mb-4">Current Deployment</h3>
          {currentDeployment ? (
            <div className={cn(
              "p-6 rounded-2xl border flex flex-col md:flex-row items-center justify-between gap-6 transition-all",
              currentDeployment.status === 'success' ? "bg-success/5 border-success/20" : "bg-accent/5 border-accent/20"
            )}>
              <div className="flex items-center gap-5">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  currentDeployment.status === 'success' ? "bg-success/10 text-success" : "bg-accent/10 text-accent"
                )}>
                  {currentDeployment.status === 'success' ? <CheckCircle2 size={24} /> : <Loader2 size={24} className="animate-spin" />}
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-lg font-bold text-primary">
                      {currentDeployment.status === 'success' ? 'Live on Production' : 'Deploying...'}
                    </h4>
                    <span className="px-1.5 py-0.5 bg-elevated text-[9px] font-bold text-secondary uppercase rounded border border-default">
                      {currentDeployment.target}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-secondary">
                    <a 
                      href={currentDeployment.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent hover:underline"
                    >
                      {currentDeployment.url}
                      <ExternalLink size={12} />
                    </a>
                    <span className="w-1 h-1 rounded-full bg-default" />
                    <span>Deployed {new Date(currentDeployment.deployedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a 
                  href={currentDeployment.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-elevated hover:bg-surface border border-default text-xs font-bold text-primary rounded-xl transition-all flex items-center gap-2"
                >
                  Visit
                </a>
                <button 
                  onClick={() => handleDeploy(currentDeployment.target)}
                  className="px-4 py-2 bg-elevated hover:bg-surface border border-default text-xs font-bold text-primary rounded-xl transition-all flex items-center gap-2"
                >
                  <RotateCcw size={14} />
                  Redeploy
                </button>
                <button 
                  onClick={unpublish}
                  className="px-4 py-2 bg-error/10 hover:bg-error/20 border border-error/20 text-xs font-bold text-error rounded-xl transition-all flex items-center gap-2"
                >
                  <XCircle size={14} />
                  Unpublish
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-default border-dashed rounded-2xl p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-page border border-default flex items-center justify-center mx-auto mb-4">
                <Rocket size={24} className="text-tertiary" />
              </div>
              <h4 className="text-sm font-bold text-primary mb-1">Not published yet</h4>
              <p className="text-xs text-secondary mb-6">Deploy your project to make it live on the web.</p>
              <button 
                onClick={() => handleDeploy('torsor')}
                className="px-6 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-accent/20"
              >
                Publish to Torsor Cloud
              </button>
            </div>
          )}
        </section>

        {/* Deployment Targets */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Deployment Targets</h3>
            <span className="text-[10px] text-secondary font-medium">6 targets available</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {targets.map(target => (
              <div key={target.id} className="bg-surface border border-default rounded-xl p-4 flex flex-col hover:border-subtle transition-all group relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-page border border-default flex items-center justify-center">
                    <TargetIcon id={target.id} />
                  </div>
                  {target.connected ? (
                    <span className="px-2 py-0.5 bg-success/10 text-[9px] font-bold text-success uppercase rounded border border-success/20">
                      Connected
                    </span>
                  ) : (
                    <button className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors">
                      Configure
                    </button>
                  )}
                </div>
                <h4 className="text-xs font-bold text-primary mb-1">{target.name}</h4>
                <p className="text-[10px] text-secondary mb-4 flex-1">{target.description}</p>
                <button 
                  disabled={isDeploying}
                  onClick={() => handleDeploy(target.id)}
                  className="w-full py-2 bg-elevated hover:bg-accent border border-default hover:border-accent-hover text-[11px] font-bold text-primary hover:text-white rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Deploy
                  <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Settings & Domains */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Settings */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Build Settings</h3>
            <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase mb-1.5">Build Command</label>
                <div className="relative">
                  <Terminal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
                  <input 
                    type="text" 
                    value={settings.buildCommand}
                    onChange={(e) => updateSettings({ buildCommand: e.target.value })}
                    className="w-full bg-page border border-default rounded-lg pl-9 pr-4 py-2 text-xs text-primary font-mono focus:border-accent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-secondary uppercase mb-1.5">Output Directory</label>
                <input 
                  type="text" 
                  value={settings.outputDir}
                  onChange={(e) => updateSettings({ outputDir: e.target.value })}
                  className="w-full bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary font-mono focus:border-accent outline-none"
                />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div>
                  <p className="text-xs font-bold text-primary">Node.js Version</p>
                  <p className="text-[10px] text-secondary">Runtime version for build</p>
                </div>
                <select 
                  value={settings.nodeVersion}
                  onChange={(e) => updateSettings({ nodeVersion: e.target.value })}
                  className="bg-page border border-default rounded-lg px-3 py-1.5 text-[11px] text-primary outline-none focus:border-accent"
                >
                  <option value="18.x">18.x (LTS)</option>
                  <option value="20.x">20.x (LTS)</option>
                  <option value="22.x">22.x (Current)</option>
                </select>
              </div>
            </div>
          </section>

          {/* Custom Domains */}
          <section className="space-y-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Custom Domains</h3>
            <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
              <form onSubmit={handleAddDomain} className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="flex-1 bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary focus:border-accent outline-none"
                />
                <button className="px-3 py-2 bg-elevated hover:bg-accent border border-default hover:border-accent-hover rounded-lg text-white transition-all">
                  <Plus size={14} />
                </button>
              </form>

              <div className="space-y-2">
                {customDomains.map((domain, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-page border border-default rounded-lg">
                    <div className="flex items-center gap-3">
                      <Globe size={14} className="text-secondary" />
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-primary">{domain.domain}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[9px] font-bold uppercase tracking-wider",
                            domain.status === 'active' ? "text-success" : "text-warning"
                          )}>
                            {domain.status}
                          </span>
                          {domain.ssl && (
                            <div className="flex items-center gap-1 text-[9px] text-success">
                              <ShieldCheck size={10} />
                              SSL Active
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <button className="p-1.5 text-secondary hover:text-error hover:bg-error/10 rounded-md transition-all">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="p-3 bg-accent/5 border border-accent/10 rounded-lg">
                <div className="flex items-center gap-2 mb-1 text-accent">
                  <AlertCircle size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Setup Instructions</span>
                </div>
                <p className="text-[10px] text-secondary leading-relaxed">
                  Point your domain's A record to <code className="text-accent">76.76.21.21</code> or CNAME to <code className="text-accent">cname.torsor.app</code>.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Deploy Logs */}
        <section>
          <Collapsible.Root open={logsOpen} onOpenChange={setLogsOpen}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Deploy Logs</h3>
              <Collapsible.Trigger asChild>
                <button className="p-1 text-secondary hover:text-primary transition-colors">
                  {logsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </Collapsible.Trigger>
            </div>
            <Collapsible.Content className="animate-in slide-in-from-top-2 duration-200">
              <div className="bg-page border border-default rounded-xl p-4 font-mono text-[11px] leading-relaxed text-secondary max-h-60 overflow-y-auto custom-scrollbar">
                {currentDeployment?.logs.map((log, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-tertiary shrink-0">[{i + 1}]</span>
                    <span className={cn(
                      log.includes('success') || log.includes('successful') ? "text-success" : 
                      log.includes('error') || log.includes('fail') ? "text-error" : "text-secondary"
                    )}>
                      {log}
                    </span>
                  </div>
                ))}
                {isDeploying && (
                  <div className="flex items-center gap-2 mt-2 text-accent">
                    <Loader2 size={12} className="animate-spin" />
                    <span>Processing...</span>
                  </div>
                )}
              </div>
            </Collapsible.Content>
          </Collapsible.Root>
        </section>

        {/* Deploy History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Deploy History</h3>
            <button className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
              <History size={12} />
              View full history
            </button>
          </div>
          <div className="bg-surface border border-default rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-default bg-elevated/50">
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider">Target</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider">Environment</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider">Duration</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map(deploy => (
                  <tr key={deploy.id} className="border-b border-default/50 hover:bg-elevated/30 transition-colors">
                    <td className="px-4 py-3 text-[11px] text-primary font-medium">
                      {new Date(deploy.deployedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TargetIcon id={deploy.target} />
                        <span className="text-[11px] text-secondary capitalize">{deploy.target}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] text-secondary capitalize">{deploy.environment}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                        deploy.status === 'success' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                      )}>
                        {deploy.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[11px] text-secondary">{deploy.duration}</td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => rollback(deploy.id)}
                        className="text-[10px] font-bold text-accent hover:text-accent-hover transition-colors"
                      >
                        Rollback
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
