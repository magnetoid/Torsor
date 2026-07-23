import React, { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Github, Save, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Super-admin config for the instance-wide GitHub App (increment 1: login).
 * Secrets are write-only — the API returns only *Set flags, never the values, so blank
 * secret fields leave the stored value untouched on save.
 */
export function AdminGitHubTab() {
  const { githubSettings, fetchGitHubSettings, saveGitHubSettings } = useAdminStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [appId, setAppId] = useState('');
  const [appSlug, setAppSlug] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  useEffect(() => {
    void fetchGitHubSettings().finally(() => setLoading(false));
  }, [fetchGitHubSettings]);
  useEffect(() => {
    if (githubSettings) {
      setAppId(githubSettings.appId);
      setAppSlug(githubSettings.appSlug);
      setClientId(githubSettings.clientId);
    }
  }, [githubSettings]);

  const save = async () => {
    setSaving(true);
    try {
      await saveGitHubSettings({
        appId,
        appSlug,
        clientId,
        ...(clientSecret ? { clientSecret } : {}),
        ...(privateKey ? { privateKey } : {}),
        ...(webhookSecret ? { webhookSecret } : {}),
      });
      setClientSecret('');
      setPrivateKey('');
      setWebhookSecret('');
      toast.success('GitHub settings saved');
    } catch {
      toast.error('Could not save GitHub settings');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (field: 'enabled' | 'allowSignup', value: boolean) => {
    try {
      await saveGitHubSettings({ [field]: value });
      toast.success('Updated');
    } catch {
      toast.error('Could not update');
    }
  };

  if (loading || !githubSettings) {
    return (
      <div className="flex items-center justify-center h-full text-secondary gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  const secretPlaceholder = (isSet: boolean) => (isSet ? '•••• set — leave blank to keep' : 'Not set');

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <Github size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">GitHub App</h2>
      </header>

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Enable toggles */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-primary">Sign in with GitHub</h3>
              <p className="text-xs text-secondary mt-0.5">Show the GitHub button on the login page.</p>
            </div>
            <Switch.Root
              checked={githubSettings.enabled}
              onCheckedChange={(v) => void toggle('enabled', v)}
              className={cn('w-9 h-5 rounded-full relative transition-colors outline-none cursor-pointer shrink-0', githubSettings.enabled ? 'bg-accent' : 'bg-elevated')}
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-primary">Allow new sign-ups</h3>
              <p className="text-xs text-secondary mt-0.5">Create an account when a GitHub user has no match. Off = link existing only.</p>
            </div>
            <Switch.Root
              checked={githubSettings.allowSignup}
              onCheckedChange={(v) => void toggle('allowSignup', v)}
              className={cn('w-9 h-5 rounded-full relative transition-colors outline-none cursor-pointer shrink-0', githubSettings.allowSignup ? 'bg-accent' : 'bg-elevated')}
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
            </Switch.Root>
          </div>
        </div>

        {/* Callback URL (read-only) */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-bold text-primary">Callback URL</h3>
          <p className="text-xs text-secondary">Set this as the GitHub App's "User authorization callback URL", and grant the App's <span className="font-mono">Account · Email addresses (read-only)</span> permission.</p>
          <code className="block bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary break-all">{githubSettings.callbackUrl}</code>
        </div>

        {/* Credentials */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-primary">Credentials</h3>
          {[
            { label: 'App ID', value: appId, set: setAppId, placeholder: '123456' },
            { label: 'App slug', value: appSlug, set: setAppSlug, placeholder: 'my-torsor-app' },
            { label: 'Client ID', value: clientId, set: setClientId, placeholder: 'Iv1.abc123' },
          ].map((f) => (
            <div key={f.label} className="space-y-1.5">
              <label className="text-xs font-bold text-tertiary uppercase tracking-wider">{f.label}</label>
              <input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.placeholder}
                className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Client secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={secretPlaceholder(githubSettings.clientSecretSet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Private key (PEM)</label>
            <textarea
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              rows={3}
              placeholder={secretPlaceholder(githubSettings.privateKeySet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 resize-none font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider">Webhook secret</label>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={secretPlaceholder(githubSettings.webhookSecretSet)}
              className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50"
            />
          </div>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save credentials
          </button>
        </div>
      </div>
    </div>
  );
}
