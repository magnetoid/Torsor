import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';

interface Cfg { enabled: boolean; defaultModel: string; maxTasks: number; maxRetries: number; maxConcurrentMissions: number; }

export default function AgentEngineTab() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [missions, setMissions] = useState<any[]>([]);
  useEffect(() => {
    void apiRequest<Cfg>('/api/v1/admin/agent/config', { auth: true }).then(setCfg);
    void apiRequest<{ items: any[] }>('/api/v1/admin/agent/missions', { auth: true }).then((r) => setMissions(r.items));
  }, []);
  const save = async () => { if (cfg) setCfg(await apiRequest<Cfg>('/api/v1/admin/agent/config', { method: 'PATCH', auth: true, body: JSON.stringify(cfg) })); };
  if (!cfg) return <div className="p-6 text-secondary text-sm">Loading…</div>;
  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h2 className="text-sm font-bold text-primary">Agent Engine</h2>
      <label className="flex items-center gap-2 text-sm text-primary select-none">
        <input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
          className="h-4 w-4 rounded border border-default bg-page accent-accent" />
        Engine enabled
        <span className="text-xs text-tertiary">({cfg.enabled ? 'accepting new missions' : 'disabled — approvals return 503'})</span>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className="text-xs text-secondary">Max sub-tasks
          <input type="number" value={cfg.maxTasks} onChange={(e) => setCfg({ ...cfg, maxTasks: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Max retries
          <input type="number" value={cfg.maxRetries} onChange={(e) => setCfg({ ...cfg, maxRetries: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Max concurrent missions
          <input type="number" value={cfg.maxConcurrentMissions} onChange={(e) => setCfg({ ...cfg, maxConcurrentMissions: +e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
        <label className="text-xs text-secondary">Default model
          <input value={cfg.defaultModel} onChange={(e) => setCfg({ ...cfg, defaultModel: e.target.value })}
            className="mt-1 w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary" /></label>
      </div>
      <button onClick={() => void save()} className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-bold rounded-lg">Save</button>
      <div>
        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Recent missions (all users)</h3>
        <ul className="space-y-1">
          {missions.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-xs text-secondary">
              <span className="flex-1 truncate">{m.goal}</span>
              <span className="uppercase tracking-wider text-tertiary">{m.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
