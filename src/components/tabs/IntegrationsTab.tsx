import React, { useState, useEffect } from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  Github,
  Database,
  CreditCard,
  Cloud,
  Globe,
  Mail,
  MessageSquare,
  Flame,
  Layers,
  Zap,
  Search,
  Check,
  ExternalLink,
  Settings,
  X,
  ShieldCheck,
  Key,
  Loader2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useSecretsStore } from '../../stores/secretsStore';

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  docsUrl: string;
}

const INTEGRATIONS: Integration[] = [
  { id: 'github', name: 'GitHub', description: 'Sync code and manage pull requests.', icon: <Github size={24} />, color: 'text-white', docsUrl: 'https://docs.github.com' },
  { id: 'supabase', name: 'Supabase', description: 'PostgreSQL database and authentication.', icon: <Database size={24} />, color: 'text-success', docsUrl: 'https://supabase.com/docs' },
  { id: 'stripe', name: 'Stripe', description: 'Accept payments and manage subscriptions.', icon: <CreditCard size={24} />, color: 'text-info', docsUrl: 'https://stripe.com/docs' },
  { id: 'vercel', name: 'Vercel', description: 'Deploy and host your web applications.', icon: <Cloud size={24} />, color: 'text-white', docsUrl: 'https://vercel.com/docs' },
  { id: 'netlify', name: 'Netlify', description: 'Automated builds and serverless functions.', icon: <Globe size={24} />, color: 'text-info', docsUrl: 'https://docs.netlify.com' },
  { id: 'sendgrid', name: 'SendGrid', description: 'Email delivery and marketing campaigns.', icon: <Mail size={24} />, color: 'text-info', docsUrl: 'https://docs.sendgrid.com' },
  { id: 'twilio', name: 'Twilio', description: 'SMS, voice, and messaging APIs.', icon: <MessageSquare size={24} />, color: 'text-error', docsUrl: 'https://www.twilio.com/docs' },
  { id: 'firebase', name: 'Firebase', description: 'Google backend-as-a-service platform.', icon: <Flame size={24} />, color: 'text-warning', docsUrl: 'https://firebase.google.com/docs' },
  { id: 'planetscale', name: 'PlanetScale', description: 'Serverless MySQL database platform.', icon: <Layers size={24} />, color: 'text-white', docsUrl: 'https://planetscale.com/docs' },
  { id: 'resend', name: 'Resend', description: 'Modern email API for developers.', icon: <Zap size={24} />, color: 'text-white', docsUrl: 'https://resend.com/docs' },
];

const secretKey = (id: string) => `INTEGRATION_${id.toUpperCase()}`;

export default function IntegrationsTab() {
  const { secrets, enabled, fetchSecrets, createSecret, deleteSecret } = useSecretsStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // A connection is a real, encrypted credential stored in the user's secrets.
  useEffect(() => {
    void fetchSecrets();
  }, [fetchSecrets]);

  const isConnected = (id: string) => secrets.some((s) => s.keyName === secretKey(id));

  const filteredIntegrations = INTEGRATIONS.filter(
    (i) =>
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleSave = async (item: Integration) => {
    const val = (keyInputs[item.id] || '').trim();
    if (!val) {
      toast.error('Enter an API key to connect');
      return;
    }
    setSavingId(item.id);
    const ok = await createSecret(secretKey(item.id), val);
    setSavingId(null);
    if (ok) {
      toast.success(`${item.name} connected`);
      setKeyInputs((p) => ({ ...p, [item.id]: '' }));
      setOpenId(null);
    } else {
      toast.error(`Could not save ${item.name} credential`);
    }
  };

  const handleDisconnect = async (item: Integration) => {
    await deleteSecret(secretKey(item.id));
    toast(`${item.name} disconnected`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* HEADER */}
      <div className="h-12 bg-surface flex items-center justify-between px-4 shrink-0 border-b border-default">
        <div className="flex items-center gap-2">
          <Layers size={18} className="text-accent" />
          <h2 className="text-sm font-bold text-primary">Integrations</h2>
        </div>
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input
            type="text"
            aria-label="Search integrations"
            placeholder="Search integrations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-default rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {!enabled && (
        <div className="px-4 py-2 bg-warning/10 text-warning text-xs border-b border-warning/20">
          Secret storage isn't enabled on the server (TORSOR_SECRET_KEY unset), so credentials can't be saved yet.
        </div>
      )}

      {/* GRID */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {filteredIntegrations.map((item) => {
            const connected = isConnected(item.id);
            const saving = savingId === item.id;

            return (
              <div key={item.id} className="bg-surface rounded-xl border border-default p-4 hover:border-tertiary transition-all group relative overflow-hidden">
                <div className={cn('absolute -top-10 -right-10 w-32 h-32 blur-[60px] opacity-0 group-hover:opacity-20 transition-opacity', item.color.replace('text-', 'bg-'))} />

                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div className={cn('p-2 rounded-lg bg-page border border-default', item.color)}>{item.icon}</div>
                  {connected ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-bold uppercase tracking-tighter">
                        <Check size={10} />
                        Connected
                      </div>
                      <button
                        onClick={() => void handleDisconnect(item)}
                        className="px-2 py-1 rounded-lg text-secondary hover:text-error text-xs font-bold uppercase tracking-wider transition-colors focus-ring"
                      >
                        Disconnect
                      </button>
                    </div>
                  ) : (
                    <Popover.Root open={openId === item.id} onOpenChange={(o) => setOpenId(o ? item.id : null)}>
                      <Popover.Trigger asChild>
                        <button
                          disabled={!enabled}
                          className="px-3 py-1 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 focus-ring disabled:opacity-50"
                        >
                          Connect
                        </button>
                      </Popover.Trigger>
                      <Popover.Portal>
                        <Popover.Content className="w-72 bg-elevated border border-default rounded-xl p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200" sideOffset={8}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <Settings size={14} className="text-accent" />
                              <span className="text-xs font-bold text-primary">Connect {item.name}</span>
                            </div>
                            <Popover.Close className="p-1 text-secondary hover:text-primary rounded transition-colors">
                              <X size={14} />
                            </Popover.Close>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-1.5">
                              <label htmlFor={`key-${item.id}`} className="text-xs font-bold text-secondary uppercase tracking-wider">API Key</label>
                              <div className="relative">
                                <Key size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
                                <input
                                  id={`key-${item.id}`}
                                  type="password"
                                  autoComplete="off"
                                  value={keyInputs[item.id] || ''}
                                  onChange={(e) => setKeyInputs((p) => ({ ...p, [item.id]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(item); }}
                                  placeholder="Paste your API key or token"
                                  className="w-full bg-page border border-default rounded-lg pl-8 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50"
                                />
                              </div>
                              <p className="text-[10px] text-tertiary leading-snug">
                                Stored encrypted in your secrets as <span className="font-mono">{secretKey(item.id)}</span>.
                              </p>
                            </div>
                            <button
                              onClick={() => void handleSave(item)}
                              disabled={saving}
                              className="w-full px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors disabled:opacity-50 flex items-center justify-center gap-2 focus-ring"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save & Connect'}
                            </button>
                          </div>
                          <Popover.Arrow className="fill-default" />
                        </Popover.Content>
                      </Popover.Portal>
                    </Popover.Root>
                  )}
                </div>

                <div className="relative z-10">
                  <h3 className="text-sm font-bold text-primary mb-1">{item.name}</h3>
                  <p className="text-xs text-secondary leading-relaxed mb-4">{item.description}</p>

                  <div className="flex items-center justify-between pt-4 border-t border-default">
                    <div className="flex items-center gap-1 text-xs text-tertiary">
                      <ShieldCheck size={12} />
                      <span>Official</span>
                    </div>
                    <a href={item.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 font-medium focus-ring rounded">
                      Docs
                      <ExternalLink size={10} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
