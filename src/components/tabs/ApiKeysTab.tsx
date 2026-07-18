import React, { useEffect, useMemo, useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Cpu,
  Loader2,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useSecretsStore } from '../../stores/secretsStore';
import { useChatStore } from '../../stores/chatStore';
import { apiTestModelProvider } from '../../lib/api';

/**
 * BYO model keys — real, end-to-end:
 *  - Keys save to the control-plane's encrypted secrets (AES-GCM at rest, write-only:
 *    values are never returned, so this UI only ever knows *whether* a key exists).
 *  - The secret name convention ({PROVIDER}_API_KEY) is what the backend looks up per
 *    request and hands to the provider plugin (CompleteRequest.APIKey).
 *  - "Test" runs a tiny real completion through the provider with your key.
 * Local-first stays the default: Ollama needs no key; hosted providers are opt-in.
 */

interface HostedProvider {
  id: string; // must match the plugin's Info().Name — the key lookup derives from it
  name: string;
  desc: string;
  secret: string; // `${ID.toUpperCase()}_API_KEY`
  docs: string;
}

const HOSTED_PROVIDERS: HostedProvider[] = [
  { id: 'anthropic', name: 'Anthropic', desc: 'Claude models', secret: 'ANTHROPIC_API_KEY', docs: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT models', secret: 'OPENAI_API_KEY', docs: 'https://platform.openai.com/api-keys' },
  { id: 'google', name: 'Google Gemini', desc: 'Gemini models', secret: 'GOOGLE_API_KEY', docs: 'https://aistudio.google.com/apikey' },
  { id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek chat / coder', secret: 'DEEPSEEK_API_KEY', docs: 'https://platform.deepseek.com/api_keys' },
  { id: 'openrouter', name: 'OpenRouter', desc: '100+ models via one key', secret: 'OPENROUTER_API_KEY', docs: 'https://openrouter.ai/keys' },
];

export function ApiKeysTab() {
  const { secrets, enabled, loaded, fetchSecrets, createSecret, deleteSecret } = useSecretsStore();
  const { providers, loadProviders } = useChatStore();

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, 'saving' | 'testing' | null>>({});

  useEffect(() => {
    void fetchSecrets();
    loadProviders().catch(() => {
      /* backend without providers — rows show "not loaded" */
    });
  }, [fetchSecrets, loadProviders]);

  const loadedProviders = useMemo(() => new Set(providers.map((p) => p.name)), [providers]);
  const savedSecrets = useMemo(() => new Set(secrets.map((s) => s.keyName)), [secrets]);

  const setBusyFor = (id: string, state: 'saving' | 'testing' | null) =>
    setBusy((b) => ({ ...b, [id]: state }));

  const handleSave = async (p: HostedProvider) => {
    const value = (drafts[p.id] ?? '').trim();
    if (!value) return;
    setBusyFor(p.id, 'saving');
    const ok = await createSecret(p.secret, value);
    setBusyFor(p.id, null);
    if (ok) {
      setDrafts((d) => ({ ...d, [p.id]: '' }));
      toast.success(`${p.name} key saved (encrypted)`);
    } else {
      toast.error(`Could not save the ${p.name} key`);
    }
  };

  const handleRemove = async (p: HostedProvider) => {
    await deleteSecret(p.secret);
    toast.success(`${p.name} key removed`);
  };

  const handleTest = async (id: string, label: string) => {
    setBusyFor(id, 'testing');
    try {
      const res = await apiTestModelProvider(id);
      toast.success(`${label} works — responded via ${res.model}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${label} test failed`);
    } finally {
      setBusyFor(id, null);
    }
  };

  const ollamaLoaded = loadedProviders.has('ollama');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Local-first note */}
      <div className="p-5 bg-surface border border-default rounded-xl flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
          <Cpu size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-primary">Local-first, keys optional</div>
          <p className="text-xs text-secondary mt-1 leading-relaxed">
            Torsor runs free with local models via Ollama — no key required. Hosted providers are
            opt-in: add your own key and it is encrypted at rest, never shown again, and used only
            for your requests.
          </p>
        </div>
      </div>

      {/* Secrets disabled on this server */}
      {loaded && !enabled && (
        <div className="p-4 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-secondary leading-relaxed">
            <span className="font-bold text-primary">Secrets are disabled on this server.</span>{' '}
            The operator must set <code className="font-mono">TORSOR_SECRET_KEY</code> on the
            control plane before BYO keys can be stored.
          </p>
        </div>
      )}

      {/* Local provider */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold text-tertiary uppercase tracking-wider">Local</h3>
        <div className="p-4 bg-surface border border-default rounded-xl flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-elevated flex items-center justify-center text-secondary shrink-0">
            <Cpu size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary">Ollama</span>
              <StatusChip state={ollamaLoaded ? 'ready' : 'unavailable'} readyLabel="Loaded" />
            </div>
            <p className="text-xs text-secondary mt-0.5">Local models (qwen3-coder, devstral, …) — no key needed.</p>
          </div>
          <button
            onClick={() => handleTest('ollama', 'Ollama')}
            disabled={!ollamaLoaded || busy['ollama'] === 'testing'}
            className="px-3 py-1.5 text-xs font-bold text-secondary hover:text-primary border border-default rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
          >
            {busy['ollama'] === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            Test
          </button>
        </div>
      </section>

      {/* Hosted providers */}
      <section className="space-y-3">
        <h3 className="text-xs font-bold text-tertiary uppercase tracking-wider">Hosted (bring your own key)</h3>
        <div className="space-y-3">
          {HOSTED_PROVIDERS.map((p) => {
            const isLoaded = loadedProviders.has(p.id);
            const hasKey = savedSecrets.has(p.secret);
            const state = busy[p.id];
            return (
              <div key={p.id} className="p-4 bg-surface border border-default rounded-xl space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-elevated flex items-center justify-center text-secondary shrink-0">
                    <Key size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-primary">{p.name}</span>
                      {!isLoaded ? (
                        <StatusChip state="unavailable" />
                      ) : hasKey ? (
                        <StatusChip state="ready" readyLabel="Key saved" />
                      ) : (
                        <StatusChip state="needs-key" />
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-0.5">{p.desc}</p>
                  </div>
                  <a
                    href={p.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-secondary hover:text-primary flex items-center gap-1 shrink-0"
                  >
                    Get a key <ExternalLink size={11} />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={show[p.id] ? 'text' : 'password'}
                      value={drafts[p.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      placeholder={hasKey ? 'Key saved — paste a new value to replace it' : `Paste your ${p.name} API key…`}
                      disabled={!enabled}
                      className="w-full bg-inset border border-default rounded-lg px-3 py-2 pr-9 text-xs font-mono text-primary placeholder-tertiary outline-none focus:border-accent/50 disabled:opacity-50"
                    />
                    <button
                      onClick={() => setShow((s) => ({ ...s, [p.id]: !s[p.id] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-tertiary hover:text-primary transition-colors"
                      aria-label={show[p.id] ? 'Hide key' : 'Show key'}
                    >
                      {show[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={() => handleSave(p)}
                    disabled={!enabled || !(drafts[p.id] ?? '').trim() || state === 'saving'}
                    className={cn(
                      'px-3 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5',
                      (drafts[p.id] ?? '').trim()
                        ? 'bg-accent text-white hover:bg-accent-hover'
                        : 'bg-elevated text-tertiary',
                      'disabled:opacity-50'
                    )}
                  >
                    {state === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                    Save
                  </button>
                  <button
                    onClick={() => handleTest(p.id, p.name)}
                    disabled={!isLoaded || state === 'testing'}
                    title={!isLoaded ? 'This provider plugin is not loaded on the server' : `Run a tiny real completion via ${p.name}`}
                    className="px-3 py-2 text-xs font-bold text-secondary hover:text-primary border border-default rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {state === 'testing' ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                    Test
                  </button>
                  {hasKey && (
                    <button
                      onClick={() => handleRemove(p)}
                      title="Remove the saved key"
                      className="p-2 text-tertiary hover:text-error border border-default hover:border-error/40 rounded-lg transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-tertiary leading-relaxed">
          Keys are stored encrypted (AES-256-GCM) on your Torsor server and are write-only — they
          can be replaced or removed, never read back. Providers marked “Not loaded” aren’t enabled
          in this server’s <code className="font-mono">TORSOR_MODEL_PLUGINS</code>.
        </p>
      </section>
    </div>
  );
}

function StatusChip({
  state,
  readyLabel = 'Ready',
}: {
  state: 'ready' | 'needs-key' | 'unavailable';
  readyLabel?: string;
}) {
  if (state === 'ready') {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider text-success bg-success/10 border border-success/20 rounded px-1.5 py-0.5">
        {readyLabel}
      </span>
    );
  }
  if (state === 'needs-key') {
    return (
      <span className="text-[9px] font-bold uppercase tracking-wider text-warning bg-warning/10 border border-warning/20 rounded px-1.5 py-0.5">
        Add key
      </span>
    );
  }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider text-tertiary bg-elevated border border-default rounded px-1.5 py-0.5">
      Not loaded
    </span>
  );
}
