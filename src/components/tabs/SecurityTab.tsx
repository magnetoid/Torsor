import React, { useState } from 'react';
import { SectionPreviewNotice } from '../shared/PreviewBanner';
import * as Switch from '@radix-ui/react-switch';
import * as Select from '@radix-ui/react-select';
import { 
  ShieldCheck, 
  Lock, 
  ChevronDown, 
  Check, 
  Clock, 
  Globe, 
  UserCheck, 
  FileCode, 
  Network,
  ShieldAlert,
  Save,
  Key
} from 'lucide-react';
import { usePlanGate } from '../../hooks/usePlanGate';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export function SecurityTab() {
  const { checkFeature } = usePlanGate();

  const [twoFA, setTwoFA] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState('4h');
  const [ipAllowlist, setIpAllowlist] = useState('');
  const [adminApproval, setAdminApproval] = useState(true);
  const [disablePublic, setDisablePublic] = useState(false);
  const [disableExport, setDisableExport] = useState(false);

  const teamGate = checkFeature('audit_logs'); // Using audit_logs as proxy for Team plan
  const enterpriseGate = checkFeature('sso'); // Using sso as proxy for Enterprise plan

  const handleSave = () => {
    toast.success('Security settings updated');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <SectionPreviewNotice>Security settings aren&apos;t enforced by a backend yet — this is a preview.</SectionPreviewNotice>
      {/* Basic Security */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Workspace Security</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                <ShieldAlert size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-primary">Require 2FA</div>
                <div className="text-xs text-secondary mt-0.5">Force all members to enable 2FA.</div>
              </div>
            </div>
            <Switch.Root 
              checked={twoFA} 
              onCheckedChange={setTwoFA}
              className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
            >
              <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
            </Switch.Root>
          </div>

          <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
                <Clock size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-primary">Session Timeout</div>
                <div className="text-xs text-secondary mt-0.5">Auto-logout after inactivity.</div>
              </div>
            </div>
            <Select.Root value={sessionTimeout} onValueChange={setSessionTimeout}>
              <Select.Trigger className="w-24 flex items-center justify-between bg-page border border-default rounded-xl px-3 py-1.5 text-xs text-primary outline-none focus:border-accent transition-colors">
                <Select.Value />
                <Select.Icon>
                  <ChevronDown size={14} className="text-tertiary" />
                </Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
                  <Select.Viewport>
                    {[
                      { id: '30m', label: '30 min' },
                      { id: '1h', label: '1 hr' },
                      { id: '4h', label: '4 hrs' },
                      { id: '24h', label: '24 hrs' },
                      { id: 'never', label: 'Never' },
                    ].map((item) => (
                      <Select.Item 
                        key={item.id} 
                        value={item.id}
                        className="flex items-center justify-between px-3 py-1.5 text-xs text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer"
                      >
                        <Select.ItemText>{item.label}</Select.ItemText>
                        <Select.ItemIndicator>
                          <Check size={12} className="text-accent" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        </div>
      </div>

      {/* IP Allowlist */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="text-accent" size={18} />
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">IP Allowlist</h3>
        </div>
        <p className="text-xs text-secondary leading-relaxed">
          Restrict workspace access to specific IP addresses or ranges. Enter one per line.
        </p>
        <div className="space-y-4">
          <textarea 
            value={ipAllowlist}
            onChange={(e) => setIpAllowlist(e.target.value)}
            placeholder="192.168.1.1&#10;10.0.0.0/24"
            rows={3}
            className="w-full bg-page border border-default rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-accent transition-colors font-mono resize-none"
          />
          <button 
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-elevated border border-default rounded-xl text-xs font-bold text-primary hover:bg-surface transition-all"
          >
            <Save size={14} />
            Save Allowlist
          </button>
        </div>
      </div>

      {/* Advanced Controls (Gated) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Network className="text-accent" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Advanced Controls</h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 bg-surface border border-default rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center text-info">
                <UserCheck size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-primary">Admin Approval</div>
                <div className="text-xs text-secondary mt-0.5">Require approval for new members.</div>
              </div>
            </div>
            <Switch.Root 
              checked={adminApproval} 
              onCheckedChange={setAdminApproval}
              className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
            >
              <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
            </Switch.Root>
          </div>

          <div className={cn(
            "flex items-center justify-between p-4 bg-surface border border-default rounded-xl relative",
            !teamGate.allowed && "opacity-60"
          )}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning">
                <Globe size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-primary">Disable Public Projects</div>
                  {!teamGate.allowed && <Lock size={12} className="text-tertiary" />}
                </div>
                <div className="text-xs text-secondary mt-0.5">Prevent members from creating public projects.</div>
              </div>
            </div>
            <Switch.Root 
              checked={disablePublic} 
              onCheckedChange={setDisablePublic}
              disabled={!teamGate.allowed}
              className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
            </Switch.Root>
          </div>

          <div className={cn(
            "flex items-center justify-between p-4 bg-surface border border-default rounded-xl relative",
            !enterpriseGate.allowed && "opacity-60"
          )}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                <FileCode size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium text-primary">Disable Code Export</div>
                  {!enterpriseGate.allowed && <Lock size={12} className="text-tertiary" />}
                </div>
                <div className="text-xs text-secondary mt-0.5">Prevent members from exporting code.</div>
              </div>
            </div>
            <Switch.Root 
              checked={disableExport} 
              onCheckedChange={setDisableExport}
              disabled={!enterpriseGate.allowed}
              className="w-10 h-5 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer disabled:cursor-not-allowed"
            >
              <Switch.Thumb className="block w-3.5 h-3.5 bg-white rounded-full transition-transform duration-100 translate-x-1 data-[state=checked]:translate-x-5.5" />
            </Switch.Root>
          </div>
        </div>
      </div>

      {/* SSO Section — not yet available. SSO requires connecting an external identity
          provider, so these fields are an honest preview of the setup, not a working form.
          (No fake "Enable/Test" success, and no "upgrade to unlock" upsell — upgrading a plan
          would not enable it.) */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-6 opacity-60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="text-accent" size={18} />
            <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">SSO / SAML</h3>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-elevated text-tertiary text-xs font-bold uppercase tracking-wider border border-default">
            <Lock size={10} />
            Coming soon
          </div>
        </div>

        <p className="text-xs text-secondary">
          Single sign-on requires connecting an external identity provider (Okta, Microsoft Entra,
          Auth0, …). It isn't available yet — the fields below preview the setup.
        </p>

        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Identity Provider URL</label>
            <input
              type="text"
              placeholder="https://sso.company.com/saml2"
              disabled
              className="w-full bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Entity ID</label>
            <input
              type="text"
              placeholder="torsor-app-saml"
              disabled
              className="w-full bg-page border border-default rounded-xl px-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors disabled:cursor-not-allowed"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider ml-1">Certificate</label>
            <textarea
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              disabled
              rows={4}
              className="w-full bg-page border border-default rounded-xl px-4 py-3 text-sm text-primary outline-none focus:border-accent transition-colors font-mono resize-none disabled:cursor-not-allowed"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            disabled
            title="SSO isn't available yet — it needs an external identity provider"
            className="flex-1 py-2.5 bg-elevated border border-default rounded-xl text-sm font-bold text-primary transition-all disabled:cursor-not-allowed"
          >
            Test SSO
          </button>
          <button
            disabled
            title="SSO isn't available yet — it needs an external identity provider"
            className="flex-1 py-2.5 bg-accent text-white rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enable SSO
          </button>
        </div>
      </div>
    </div>
  );
}
