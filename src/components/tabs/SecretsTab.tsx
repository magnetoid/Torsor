import React, { useEffect, useState } from 'react';
import {
  Lock as LockIcon,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { useSecretsStore } from '../../stores/secretsStore';
import { cn } from '../../lib/utils';

export default function SecretsTab() {
  const { secrets, enabled, loading, loaded, error, fetchSecrets, createSecret, deleteSecret } =
    useSecretsStore();
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSecrets();
  }, [fetchSecrets]);

  const handleAddSecret = async () => {
    if (!newKey || !newValue) return;
    // Environment-variable convention: UPPERCASE_WITH_UNDERSCORES.
    const sanitizedKey = newKey.trim().toUpperCase().replace(/\s+/g, '_');
    setSaving(true);
    const ok = await createSecret(sanitizedKey, newValue);
    setSaving(false);
    if (ok) {
      setNewKey('');
      setNewValue('');
    }
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  };

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <LockIcon size={14} className="text-accent-hover" />
          <span className="text-xs font-bold text-primary">Secrets</span>
        </div>
        <span className="text-[10px] text-tertiary">Encrypted at rest · per-user</span>
      </div>

      {/* Not-configured banner */}
      {loaded && !enabled && (
        <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-default bg-elevated px-3 py-2.5">
          <AlertTriangle size={14} className="text-accent-hover mt-0.5 shrink-0" />
          <p className="text-xs text-secondary">
            Encrypted secret storage isn&apos;t configured on this server. Set{' '}
            <span className="font-mono text-primary">TORSOR_SECRET_KEY</span> (any strong
            passphrase) to enable it.
          </p>
        </div>
      )}

      {error && <p className="mx-4 mt-4 text-xs text-error">{error}</p>}

      {/* Secrets List */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {loading && !loaded ? (
          <div className="flex items-center justify-center h-full text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading secrets…</span>
          </div>
        ) : secrets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary gap-2">
            <LockIcon size={32} className="opacity-20" />
            <p className="text-sm">No secrets yet</p>
            <p className="text-xs text-tertiary">
              Add API keys and other secrets your app needs at runtime.
            </p>
          </div>
        ) : (
          secrets.map((secret) => (
            <div
              key={secret.keyName}
              className="bg-surface border border-default rounded-lg p-3 mb-2 flex items-center gap-3 group hover:border-subtle transition-all"
            >
              <KeyRound size={14} className="text-tertiary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono text-primary truncate block">
                  {secret.keyName}
                </span>
                {secret.createdAt && (
                  <span className="text-[10px] text-tertiary">
                    Added {formatDate(secret.createdAt)}
                  </span>
                )}
              </div>
              {/* Values are write-only (encrypted server-side, never returned), so there is
                  nothing to reveal — only replace (re-add) or delete. */}
              <button
                onClick={() => void deleteSecret(secret.keyName)}
                className="p-1.5 text-secondary hover:text-error hover:bg-elevated rounded-md transition-all opacity-0 group-hover:opacity-100"
                title="Delete secret"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Secret Form */}
      <div className="p-4 border-t border-default bg-surface sticky bottom-0">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-page border border-default rounded-lg px-3 py-2 focus-within:border-accent/50 transition-all">
            <input
              type="text"
              placeholder="KEY_NAME"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              disabled={!enabled}
              className="bg-transparent border-none outline-none text-sm font-mono text-primary w-1/3 placeholder:text-tertiary disabled:opacity-50"
            />
            <div className="w-[1px] h-4 bg-default" />
            <input
              type="password"
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              disabled={!enabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddSecret();
              }}
              className="bg-transparent border-none outline-none text-sm font-mono text-primary flex-1 placeholder:text-tertiary disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => void handleAddSecret()}
            disabled={!newKey || !newValue || !enabled || saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent text-white text-sm font-bold rounded-lg transition-all shrink-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add Secret
          </button>
        </div>
        <p className="text-[10px] text-secondary mt-2 ml-1">
          Keys are converted to UPPERCASE_WITH_UNDERSCORES. Values are encrypted and never
          shown again — re-add to replace one.
        </p>
      </div>
    </div>
  );
}
