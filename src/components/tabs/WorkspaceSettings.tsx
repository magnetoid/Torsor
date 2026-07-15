import React, { useState } from 'react';
import { 
  Layout, 
  Globe, 
  Lock, 
  Trash2, 
  Save, 
  RefreshCw,
  Zap,
  CreditCard,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  ShieldCheck,
  Shield,
  Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import * as Separator from '@radix-ui/react-separator';
import * as Switch from '@radix-ui/react-switch';
import * as Tooltip from '@radix-ui/react-tooltip';

export function WorkspaceSettings() {
  const { workspaces, activeWorkspaceId, updateWorkspace } = useWorkspaceStore();
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  
  const [name, setName] = useState(activeWorkspace?.name || '');
  const [slug, setSlug] = useState(activeWorkspace?.slug || '');
  const [isSaving, setIsSaving] = useState(false);

  if (!activeWorkspace) return null;

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      updateWorkspace(activeWorkspaceId!, { name, slug });
      setIsSaving(false);
    }, 800);
  };

  return (
    <div className="space-y-10">
      {/* General Settings */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Layout size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">General Settings</h3>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Workspace Name</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-inset border border-default rounded-lg px-3 py-2 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-secondary uppercase tracking-wider">Workspace Slug</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-tertiary">torsor.app/</span>
              <input 
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                className="w-full bg-inset border border-default rounded-lg pl-24 pr-3 py-2 text-xs text-primary focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
              <CreditCard size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-primary">Current Plan: {activeWorkspace.plan.toUpperCase()}</p>
              <p className="text-[11px] text-secondary">Your workspace is currently on the {activeWorkspace.plan} plan.</p>
            </div>
          </div>
          <button className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-bold rounded-lg shadow-lg shadow-accent/20 transition-all">
            Upgrade Plan
          </button>
        </div>
      </section>

      <Separator.Root className="h-[1px] bg-default" />

      {/* Security & Access */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Lock size={16} className="text-accent" />
          <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Security & Access</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-primary">Single Sign-On (SSO)</p>
              <p className="text-[11px] text-secondary">Enforce SAML or Google SSO for all members.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-accent/10 text-accent text-[9px] font-bold rounded uppercase tracking-tighter">Enterprise</span>
              <Switch.Root disabled className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-not-allowed opacity-50">
                <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
              </Switch.Root>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-primary">Public Access</p>
              <p className="text-[11px] text-secondary">Allow anyone with a link to view public projects.</p>
            </div>
            <Switch.Root className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer">
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[22px]" />
            </Switch.Root>
          </div>
        </div>
      </section>

      <Separator.Root className="h-[1px] bg-default" />

      {/* Danger Zone */}
      <section className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <ShieldAlert size={16} className="text-error" />
          <h3 className="text-sm font-bold text-error uppercase tracking-wider">Danger Zone</h3>
        </div>

        <div className="bg-error/5 border border-error/20 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-primary">Archive Workspace</p>
              <p className="text-[11px] text-secondary">Make this workspace read-only. You can restore it later.</p>
            </div>
            <button className="px-4 py-2 border border-error/30 text-error hover:bg-error hover:text-white text-xs font-bold rounded-lg transition-all">
              Archive
            </button>
          </div>

          <Separator.Root className="h-[1px] bg-error/10" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-primary">Delete Workspace</p>
              <p className="text-[11px] text-secondary">Permanently delete this workspace and all its data. This cannot be undone.</p>
            </div>
            <button className="px-4 py-2 bg-error hover:bg-error text-white text-xs font-bold rounded-lg transition-all">
              Delete Forever
            </button>
          </div>
        </div>
      </section>

      {/* Save Button (Floating) */}
      <div className="flex justify-end pt-6">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-accent/20 transition-all"
        >
          {isSaving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          Save Workspace Settings
        </button>
      </div>
    </div>
  );
}
