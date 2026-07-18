import React, { useEffect, useState } from 'react';
import {
  Plug,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
} from 'lucide-react';
import {
  apiListMCPServers,
  apiCreateMCPServer,
  apiUpdateMCPServer,
  apiDeleteMCPServer,
  apiTestMCPServer,
  apiModelCatalog,
  type MCPServer,
  type MCPTestResult,
  type ModelCatalog,
} from '../../lib/api';
import { Card } from '../shared/Card';
import { Badge } from '../shared/Badge';
import { Button } from '../shared/Button';
import { IconButton } from '../shared/IconButton';
import { cn } from '../../lib/utils';

const inputCls =
  'w-full rounded-lg border border-default bg-page px-3 py-2 text-xs text-primary placeholder:text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-accent';

function AddServerForm({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [transport, setTransport] = useState('streamable-http');
  const [authHeader, setAuthHeader] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || !url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiCreateMCPServer({ name: name.trim(), url: url.trim(), transport, authHeader: authHeader.trim() || undefined });
      setName('');
      setUrl('');
      setAuthHeader('');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add server');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-2">
      <div className="text-xs font-semibold text-primary">Connect an MCP server</div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Name (e.g. github)" value={name} onChange={(e) => setName(e.target.value)} />
        <select className={inputCls} value={transport} onChange={(e) => setTransport(e.target.value)}>
          <option value="streamable-http">streamable-http</option>
          <option value="sse">sse</option>
        </select>
      </div>
      <input className={inputCls} placeholder="URL (https://…/mcp)" value={url} onChange={(e) => setUrl(e.target.value)} />
      <input
        className={inputCls}
        placeholder="Authorization header (optional, e.g. Bearer …)"
        value={authHeader}
        onChange={(e) => setAuthHeader(e.target.value)}
      />
      {error && (
        <div className="flex items-center gap-1.5 text-[11px] text-error">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void submit()} disabled={!name.trim() || !url.trim() || busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add server
        </Button>
      </div>
    </Card>
  );
}

function ServerRow({ server, onChanged }: { server: MCPServer; onChanged: () => void }) {
  const [test, setTest] = useState<MCPTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      setTest(await apiTestMCPServer(server.id));
    } catch (e) {
      setTest({ ok: false, error: e instanceof Error ? e.message : 'Test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-primary">{server.name}</span>
            <Badge variant={server.enabled ? 'success' : 'muted'}>{server.enabled ? 'enabled' : 'disabled'}</Badge>
            {server.hasAuth && <Badge variant="muted">auth</Badge>}
          </div>
          <div className="truncate font-mono text-[10.5px] text-tertiary">{server.url}</div>
          <div className="text-xs text-tertiary">{server.transport}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => void runTest()} disabled={testing}>
            {testing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Test
          </Button>
          <label className="flex cursor-pointer items-center gap-1 text-xs text-secondary">
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => void apiUpdateMCPServer(server.id, { enabled: e.target.checked }).then(onChanged)}
            />
          </label>
          <IconButton
            size="sm"
            onClick={() => void apiDeleteMCPServer(server.id).then(onChanged)}
            title="Remove"
          >
            <Trash2 size={13} className="text-error" />
          </IconButton>
        </div>
      </div>
      {test && (
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
            test.ok ? 'border-success/20 bg-success/10 text-success' : 'border-error/20 bg-error/10 text-error'
          )}
        >
          {test.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {test.ok ? `Connected — ${test.toolCount ?? test.tools?.length ?? 0} tools` : test.error}
        </div>
      )}
    </Card>
  );
}

function LocalModelsCard() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);

  useEffect(() => {
    void apiModelCatalog('ollama').then(setCatalog).catch(() => setCatalog(null));
  }, []);

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-primary">
        <Cpu size={13} className="text-accent" /> Local models (Ollama)
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="text-xs text-tertiary">Recommended:</span>
        {(catalog?.recommended ?? ['qwen3-coder', 'devstral']).map((m) => (
          <Badge key={m} variant="accent">{m}</Badge>
        ))}
      </div>
      {catalog?.reachable && catalog.items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          <span className="text-xs text-tertiary">Installed:</span>
          {catalog.items.map((m) => (
            <Badge key={m.name} variant="muted">{m.name}</Badge>
          ))}
        </div>
      ) : (
        <div className="text-xs text-tertiary">
          {catalog && !catalog.reachable
            ? 'Ollama not reachable from the server — install a model with `ollama pull qwen3-coder`.'
            : 'No local models detected yet.'}
        </div>
      )}
    </Card>
  );
}

export default function MCPServersTab() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setServers(await apiListMCPServers());
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-default px-4 text-xs font-semibold text-primary">
        <Plug size={13} className="text-accent" />
        MCP Servers
        <span className="font-normal text-tertiary">— give the agent external tools</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-3">
          <AddServerForm onAdded={() => void load()} />
          {loading && servers.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-tertiary">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : servers.length === 0 ? (
            <p className="px-1 text-[11px] text-tertiary">
              No MCP servers yet. Connect one above — its tools become available to the coding agent on
              every run (e.g. a GitHub, filesystem, or search server).
            </p>
          ) : (
            servers.map((s) => <ServerRow key={s.id} server={s} onChanged={() => void load()} />)
          )}
          <LocalModelsCard />
        </div>
      </div>
    </div>
  );
}
