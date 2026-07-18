import React, { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { 
  Settings, 
  ShieldCheck, 
  Zap, 
  Key, 
  Globe, 
  AlertTriangle, 
  Save, 
  Plus, 
  Trash2, 
  ChevronDown, 
  Check,
  LayoutGrid,
  Users,
  Database,
  Cpu
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

export function AdminSettingsTab() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [announcement, setAnnouncement] = useState('New feature: Collaborative Canvas is now in beta!');
  const [flags, setFlags] = useState({
    canvas: true,
    deploy: true,
    api_keys: true,
    sso: false,
    ai_reviewer: true,
  });

  const handleSave = () => {
    toast.success('Platform settings updated');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Platform Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Platform Controls</h3>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-error/5 border border-error/10 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className="text-sm font-bold text-primary">Maintenance Mode</div>
                  <div className="text-xs text-secondary mt-0.5">Disables all workspace access.</div>
                </div>
              </div>
              <Switch.Root 
                checked={maintenanceMode} 
                onCheckedChange={setMaintenanceMode}
                className="w-12 h-6 bg-elevated rounded-full relative data-[state=checked]:bg-error transition-colors outline-none cursor-pointer"
              >
                <Switch.Thumb className="block w-4.5 h-4.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-6.5" />
              </Switch.Root>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Global Announcement</label>
              <textarea 
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="Enter announcement text..."
                rows={2}
                className="w-full bg-page border border-default rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
          </div>
        </div>

        <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
          <div className="flex items-center gap-2">
            <Zap className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Feature Flags</h3>
          </div>
          
          <div className="space-y-3">
            {Object.entries(flags).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-elevated/30 border border-default rounded-xl">
                <div className="text-sm font-medium text-primary capitalize">{key.replace('_', ' ')}</div>
                <Switch.Root 
                  checked={value} 
                  onCheckedChange={(v) => setFlags(prev => ({ ...prev, [key]: v }))}
                  className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
                >
                  <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
                </Switch.Root>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plan Limits */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Default Plan Limits</h3>
          </div>
          <button className="text-xs font-bold text-accent hover:text-accent-hover transition-colors uppercase tracking-wider">
            Reset to Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {['Free', 'Pro', 'Team', 'Enterprise'].map((plan) => (
            <div key={plan} className="p-4 bg-elevated/30 border border-default rounded-xl space-y-4">
              <div className="text-sm font-bold text-primary border-b border-default pb-2">{plan}</div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-tertiary uppercase tracking-wider">
                    <LayoutGrid size={10} />
                    Projects
                  </div>
                  <input type="text" defaultValue={plan === 'Free' ? '3' : plan === 'Pro' ? '25' : '∞'} className="w-full bg-page border border-default rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-tertiary uppercase tracking-wider">
                    <Users size={10} />
                    Members
                  </div>
                  <input type="text" defaultValue={plan === 'Free' ? '1' : plan === 'Pro' ? '5' : '∞'} className="w-full bg-page border border-default rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-tertiary uppercase tracking-wider">
                    <Database size={10} />
                    Storage (GB)
                  </div>
                  <input type="text" defaultValue={plan === 'Free' ? '0.1' : plan === 'Pro' ? '5' : '50'} className="w-full bg-page border border-default rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-tertiary uppercase tracking-wider">
                    <Cpu size={10} />
                    Tokens
                  </div>
                  <input type="text" defaultValue={plan === 'Free' ? '50k' : plan === 'Pro' ? '2M' : '10M'} className="w-full bg-page border border-default rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Platform API Keys */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
        <div className="flex items-center gap-2">
          <Key className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Platform API Keys (Master)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { provider: 'Anthropic', key: 'sk-ant-••••••••••••••••' },
            { provider: 'OpenAI', key: 'sk-••••••••••••••••' },
            { provider: 'Google AI', key: '••••••••••••••••' },
            { provider: 'DeepSeek', key: 'ds-••••••••••••••••' },
          ].map((item) => (
            <div key={item.provider} className="p-4 bg-elevated/30 border border-default rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">{item.provider}</label>
                <button className="text-xs font-bold text-accent uppercase tracking-wider hover:underline">Test</button>
              </div>
              <div className="relative">
                <input 
                  type="password" 
                  defaultValue={item.key}
                  className="w-full bg-page border border-default rounded-xl px-4 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary hover:text-primary">Show</button>
              </div>
            </div>
          ))}
        </div>
        <button className="w-full py-4 border-2 border-dashed border-default rounded-xl text-tertiary hover:text-accent hover:border-accent/50 hover:bg-accent/5 transition-all flex items-center justify-center gap-2 font-bold text-sm">
          <Plus size={18} />
          Add New Master Key
        </button>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button 
          onClick={handleSave}
          className="px-8 py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center gap-2"
        >
          <Save size={18} />
          Save Platform Settings
        </button>
      </div>
    </div>
  );
}
