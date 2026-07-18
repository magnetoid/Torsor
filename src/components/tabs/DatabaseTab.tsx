import React, { useState, useEffect } from 'react';
import * as Select from '@radix-ui/react-select';
import {
  Database,
  ChevronDown,
  Play,
  History,
  Code2,
  Loader2,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '../../lib/utils';
import { EmptyState } from '../shared/EmptyState';
import { useDatabaseStore } from '../../stores/databaseStore';
import { useProjectStore } from '../../stores/projectStore';

export default function DatabaseTab() {
  const {
    sqliteAvailable,
    databases,
    activeDb,
    tables,
    activeTable,
    columns,
    rows,
    queryResult,
    queryError,
    queryHistory,
    isLoading,
    detectDatabases,
    selectDatabase,
    selectTable,
    runQuery,
  } = useDatabaseStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  const [viewMode, setViewMode] = useState<'table' | 'sql'>('table');
  const [sqlQuery, setSqlQuery] = useState('SELECT name FROM sqlite_master WHERE type = \'table\';');

  // Detect real SQLite databases in the workspace on mount / project change.
  useEffect(() => {
    void detectDatabases();
  }, [detectDatabases, activeProjectId]);

  if (!activeProjectId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-page text-secondary text-sm">
        Open a project to browse its database.
      </div>
    );
  }

  if (isLoading && databases.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-page text-tertiary gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" /> Inspecting workspace…
      </div>
    );
  }

  if (!sqliteAvailable) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8">
        <EmptyState
          icon={Database}
          title="sqlite3 isn't available in this workspace"
          description="The database explorer runs sqlite3 inside your project's container. Install it (e.g. apk add sqlite / apt-get install sqlite3) to browse SQLite databases here."
        />
      </div>
    );
  }

  if (databases.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8">
        <EmptyState
          icon={Database}
          title="No SQLite database found"
          description="No .db / .sqlite file was found in this workspace. Create one (or ask the agent to add a database), then reopen this tab."
          actionLabel="Rescan"
          onAction={() => void detectDatabases()}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* HEADER */}
      <div className="h-9 bg-surface flex items-center justify-between px-3 shrink-0 border-b border-default">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-tertiary shrink-0">
            <Database size={14} />
            <span className="text-xs font-medium">Database</span>
          </div>

          <div className="w-[1px] h-4 bg-default" />

          {/* Database file selector */}
          <Select.Root value={activeDb ?? undefined} onValueChange={(v) => void selectDatabase(v)}>
            <Select.Trigger aria-label="Select database" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-elevated text-xs text-primary outline-none transition-colors focus-ring max-w-[220px]">
              <Select.Value placeholder="Select database" />
              <Select.Icon><ChevronDown size={12} className="text-tertiary" /></Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50">
                <Select.Viewport>
                  {databases.map((db) => (
                    <Select.Item key={db} value={db} className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent hover:text-white rounded cursor-pointer outline-none">
                      <Select.ItemText>{db}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          {/* Table selector */}
          {tables.length > 0 && (
            <Select.Root value={activeTable ?? undefined} onValueChange={(v) => void selectTable(v)}>
              <Select.Trigger aria-label="Select table" className="flex items-center gap-2 px-2 py-1 rounded hover:bg-elevated text-xs text-primary outline-none transition-colors focus-ring">
                <Select.Value placeholder="Select table" />
                <Select.Icon><ChevronDown size={12} className="text-tertiary" /></Select.Icon>
              </Select.Trigger>
              <Select.Portal>
                <Select.Content className="bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50">
                  <Select.Viewport>
                    {tables.map((t) => (
                      <Select.Item key={t} value={t} className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent hover:text-white rounded cursor-pointer outline-none">
                        <Select.ItemText>{t}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          )}

          <div className="flex items-center gap-1 ml-2">
            <button onClick={() => setViewMode('table')} className={cn('px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors focus-ring', viewMode === 'table' ? 'bg-accent/20 text-accent' : 'text-tertiary hover:text-primary')}>Table</button>
            <button onClick={() => setViewMode('sql')} className={cn('px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors focus-ring', viewMode === 'sql' ? 'bg-accent/20 text-accent' : 'text-tertiary hover:text-primary')}>SQL Editor</button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-bold uppercase tracking-tighter shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-success" />
          Connected
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {viewMode === 'table' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface border-b border-default">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.name} className="p-2 border-r border-default last:border-r-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-primary">{col.name}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-elevated text-tertiary font-mono uppercase tracking-tighter">{col.type}{col.isPK ? ' pk' : ''}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {rows.map((row, idx) => (
                    <tr key={idx} className={cn('hover:bg-elevated transition-colors', idx % 2 === 0 ? 'bg-page' : 'bg-inset/30')}>
                      {columns.map((col) => (
                        <td key={col.name} className="p-2 border-r border-default last:border-r-0 text-xs text-secondary font-mono truncate max-w-[240px]">
                          {row[col.name] === null || row[col.name] === undefined ? <span className="text-tertiary italic">null</span> : String(row[col.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(1, columns.length)} className="p-10 text-center text-tertiary text-xs italic">No rows in this table.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="h-10 bg-surface border-t border-default flex items-center justify-between px-3 shrink-0">
              <span className="text-xs text-tertiary">{rows.length} row{rows.length === 1 ? '' : 's'}{rows.length >= 200 ? ' (first 200)' : ''}</span>
              <button onClick={() => setViewMode('sql')} className="text-xs text-accent hover:text-accent-hover font-bold uppercase tracking-wider focus-ring rounded px-1">
                Query with SQL →
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="h-[40%] border-b border-default flex flex-col bg-page">
              <div className="h-8 flex items-center justify-between px-3 border-b border-default shrink-0">
                <div className="flex items-center gap-2">
                  <Code2 size={12} className="text-tertiary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-tertiary">Query Editor</span>
                </div>
                <div className="flex items-center gap-2">
                  {queryHistory.length > 0 && (
                    <Select.Root value="" onValueChange={(v) => setSqlQuery(v)}>
                      <Select.Trigger aria-label="Query history" className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-elevated text-xs text-tertiary outline-none transition-colors focus-ring">
                        <History size={10} /> History
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50 max-w-[320px]">
                          <Select.Viewport>
                            {queryHistory.map((q, i) => (
                              <Select.Item key={i} value={q} className="flex items-center gap-2 px-2 py-1.5 text-xs text-tertiary hover:bg-accent hover:text-white rounded cursor-pointer outline-none truncate">
                                <Select.ItemText>{q}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  )}
                  <button
                    onClick={() => sqlQuery.trim() && void runQuery(sqlQuery)}
                    disabled={isLoading || !sqlQuery.trim()}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20 focus-ring disabled:opacity-60"
                  >
                    {isLoading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                    Run
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  language="sql"
                  theme="torsor-dark"
                  value={sqlQuery}
                  onChange={(v) => setSqlQuery(v || '')}
                  options={{
                    fontSize: 12,
                    fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    lineNumbers: 'on',
                    padding: { top: 8 },
                  }}
                />
              </div>
            </div>

            {/* RESULTS */}
            <div className="flex-1 flex flex-col min-h-0 bg-inset/30">
              <div className="h-8 flex items-center px-3 border-b border-default shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-tertiary">Results</span>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                {queryError ? (
                  <div className="p-4 text-xs text-error font-mono whitespace-pre-wrap">{queryError}</div>
                ) : queryResult ? (
                  queryResult.columns.length === 0 ? (
                    <div className="p-6 text-center text-tertiary text-xs italic">Statement executed. No rows returned.</div>
                  ) : (
                    <table className="w-full border-collapse text-left">
                      <thead className="sticky top-0 z-10 bg-surface border-b border-default">
                        <tr>
                          {queryResult.columns.map((c) => (
                            <th key={c} className="p-2 border-r border-default last:border-r-0 text-xs font-medium text-tertiary uppercase tracking-wider">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-default">
                        {queryResult.rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-elevated transition-colors">
                            {queryResult.columns.map((c) => (
                              <td key={c} className="p-2 border-r border-default last:border-r-0 text-xs text-secondary font-mono truncate">
                                {row[c] === null || row[c] === undefined ? <span className="text-tertiary italic">null</span> : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                ) : (
                  <div className="p-6 text-center text-tertiary text-xs italic">Run a query to see results.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
