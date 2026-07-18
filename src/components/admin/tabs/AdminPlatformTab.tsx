import React from 'react';
import { 
  Activity, 
  Cpu, 
  Zap, 
  Database, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  BarChart3,
  Server,
  Layers,
  Terminal
} from 'lucide-react';
import { cn } from '../../../lib/utils';

const MODEL_HEALTH = [
  { name: 'Claude 3.5 Opus', provider: 'Anthropic', latency: '1.2s', errorRate: '0.1%', tokens: '12.4M', status: 'healthy' },
  { name: 'Claude 3.5 Sonnet', provider: 'Anthropic', latency: '0.8s', errorRate: '0.05%', tokens: '45.2M', status: 'healthy' },
  { name: 'GPT-4o', provider: 'OpenAI', latency: '0.9s', errorRate: '0.2%', tokens: '38.1M', status: 'healthy' },
  { name: 'Gemini 1.5 Pro', provider: 'Google', latency: '1.1s', errorRate: '0.4%', tokens: '15.8M', status: 'degraded' },
  { name: 'DeepSeek V3', provider: 'DeepSeek', latency: '0.7s', errorRate: '0.15%', tokens: '22.4M', status: 'healthy' },
];

const SANDBOX_STATS = [
  { label: 'Running', value: 23, color: 'text-success', bg: 'bg-success/10' },
  { label: 'Queued', value: 4, color: 'text-warning', bg: 'bg-warning/10' },
  { label: 'Failed (24h)', value: 0, color: 'text-error', bg: 'bg-error/10' },
  { label: 'Avg Boot Time', value: '1.8s', color: 'text-info', bg: 'bg-info/10' },
];

export function AdminPlatformTab() {
  return (
    <div className="space-y-8">
      {/* Sandbox Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {SANDBOX_STATS.map((stat, i) => (
          <div key={i} className="bg-surface border border-default rounded-xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
                <Server size={20} />
              </div>
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Real-time</div>
            </div>
            <div>
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">{stat.label}</div>
              <div className="text-2xl font-bold text-primary mt-1">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Model Array Health */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="text-accent" size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Model Array Health</h3>
            </div>
            <button className="text-xs font-bold text-accent uppercase tracking-wider hover:underline">Refresh Status</button>
          </div>

          <div className="bg-surface border border-default rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-default bg-elevated/50">
                  <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Model</th>
                  <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Latency</th>
                  <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Error Rate</th>
                  <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Tokens (24h)</th>
                  <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {MODEL_HEALTH.map((model) => (
                  <tr key={model.name} className="group hover:bg-elevated/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-secondary group-hover:text-accent transition-colors">
                          <Layers size={16} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-primary">{model.name}</div>
                          <div className="text-xs text-tertiary">{model.provider}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-secondary font-mono">{model.latency}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-sm font-mono",
                        parseFloat(model.errorRate) > 0.3 ? "text-warning" : "text-success"
                      )}>{model.errorRate}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-secondary font-mono">{model.tokens}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider",
                        model.status === 'healthy' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                      )}>
                        {model.status === 'healthy' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {model.status}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Storage & Queue */}
        <div className="space-y-8">
          {/* Storage Usage */}
          <div className="bg-surface border border-default rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Database className="text-accent" size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Storage Usage</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold text-primary">1.2 TB</div>
                <div className="text-xs text-secondary">of 5 TB allocated</div>
              </div>
              <div className="h-3 w-full bg-elevated rounded-full overflow-hidden">
                <div className="h-full bg-accent w-[24%]" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Project Files</div>
                  <div className="text-sm font-bold text-primary">840 GB</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Snapshots</div>
                  <div className="text-sm font-bold text-primary">360 GB</div>
                </div>
              </div>
            </div>
          </div>

          {/* Background Jobs */}
          <div className="bg-surface border border-default rounded-xl p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Terminal className="text-accent" size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Background Jobs</h3>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Image Processing', status: 'idle', count: 0 },
                { label: 'Token Reset', status: 'running', count: 12 },
                { label: 'Audit Cleanup', status: 'scheduled', count: 1 },
                { label: 'Vercel Sync', status: 'running', count: 3 },
              ].map((job, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      job.status === 'running' ? "bg-success animate-pulse" : 
                      job.status === 'scheduled' ? "bg-info" : "bg-tertiary"
                    )} />
                    <span className="text-sm text-primary font-medium">{job.label}</span>
                  </div>
                  <div className="text-xs text-secondary">{job.count > 0 ? `${job.count} active` : job.status}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Stats */}
      <div className="bg-surface border border-default rounded-xl p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Globe className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Deployment Stats (24h)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Vercel</div>
              <div className="text-sm font-bold text-success">98.2% Success</div>
            </div>
            <div className="flex gap-1 h-8">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className={cn("flex-1 rounded-sm", i === 12 ? "bg-error" : "bg-success")} title={`Hour ${i}: ${i === 12 ? 'Failed' : 'Success'}`} />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Netlify</div>
              <div className="text-sm font-bold text-success">100% Success</div>
            </div>
            <div className="flex gap-1 h-8">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className="flex-1 rounded-sm bg-success" />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Cloud Run</div>
              <div className="text-sm font-bold text-success">95.4% Success</div>
            </div>
            <div className="flex gap-1 h-8">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={i} className={cn("flex-1 rounded-sm", i % 8 === 0 ? "bg-error" : "bg-success")} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
