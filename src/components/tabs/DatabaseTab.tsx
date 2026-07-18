import React, { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { 
  Database, 
  ChevronDown, 
  Search, 
  Plus, 
  Trash2, 
  Play, 
  History, 
  Code2, 
  Table as TableIcon,
  Check,
  MoreVertical,
  ArrowRight
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { cn } from '../../lib/utils';
import { EmptyState } from '../shared/EmptyState';

interface TableData {
  id: string;
  name: string;
  columns: { name: string; type: string }[];
  rows: any[];
}

const MOCK_TABLES: TableData[] = [
  {
    id: 'users',
    name: 'users',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'text' },
      { name: 'full_name', type: 'text' },
      { name: 'age', type: 'int4' },
      { name: 'is_active', type: 'bool' },
      { name: 'created_at', type: 'timestamp' },
    ],
    rows: [
      { id: 'u1', email: 'marko.tiosavljevic@gmail.com', full_name: 'Marko Tiosavljevic', age: 28, is_active: true, created_at: '2026-03-17 10:00:00' },
      { id: 'u2', email: 'jane.doe@example.com', full_name: 'Jane Doe', age: 32, is_active: true, created_at: '2026-03-16 14:30:00' },
      { id: 'u3', email: 'bob.smith@test.com', full_name: 'Bob Smith', age: 45, is_active: false, created_at: '2026-03-15 09:15:00' },
    ]
  },
  {
    id: 'posts',
    name: 'posts',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'title', type: 'text' },
      { name: 'content', type: 'text' },
      { name: 'author_id', type: 'uuid' },
      { name: 'published', type: 'bool' },
    ],
    rows: [
      { id: 'p1', title: 'Hello Torsor', content: 'This is my first post on Torsor IDE!', author_id: 'u1', published: true },
      { id: 'p2', title: 'Building with AI', content: 'AI-first coding is the future of software development.', author_id: 'u1', published: true },
    ]
  },
  {
    id: 'sessions',
    name: 'sessions',
    columns: [
      { name: 'id', type: 'uuid' },
      { name: 'user_id', type: 'uuid' },
      { name: 'token', type: 'text' },
      { name: 'expires_at', type: 'timestamp' },
    ],
    rows: []
  }
];

export default function DatabaseTab() {
  // ALL hooks must run before any early return — a useState after the `if (!isConnected)`
  // return changed the hook count between renders (React "rendered more hooks" crash that
  // the workspace ErrorBoundary then swallowed). Keep every hook at the top.
  const [isConnected, setIsConnected] = useState(false);
  const [activeTableId, setActiveTableId] = useState('users');
  const [viewMode, setViewMode] = useState<'table' | 'sql'>('table');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [sqlQuery, setSqlQuery] = useState('SELECT * FROM users LIMIT 10;');
  const [queryHistory] = useState([
    'SELECT * FROM users WHERE age > 30;',
    'UPDATE posts SET published = true WHERE author_id = \'u1\';',
    'DELETE FROM sessions WHERE expires_at < NOW();',
    'SELECT email, full_name FROM users ORDER BY created_at DESC;',
    'INSERT INTO posts (title, content) VALUES (\'New Post\', \'Content here\');'
  ]);

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8 animate-in fade-in duration-500">
        <EmptyState
          icon={Database}
          title="No database connected"
          description="Connect a database to view tables, run SQL queries, and manage your project's data."
          actionLabel="Connect Database"
          onAction={() => setIsConnected(true)}
        />
        <p className="mt-6 text-xs text-tertiary uppercase tracking-widest font-bold">
          Ask the agent to add a database to your project
        </p>
      </div>
    );
  }

  const activeTable = MOCK_TABLES.find(t => t.id === activeTableId) || MOCK_TABLES[0];

  const toggleRow = (id: string) => {
    setSelectedRows(prev => 
      prev.includes(id) ? prev.filter(rid => rid !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedRows.length === activeTable.rows.length) {
      setSelectedRows([]);
    } else {
      setSelectedRows(activeTable.rows.map(r => r.id));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-page overflow-hidden">
      {/* HEADER */}
      <div className="h-9 bg-surface flex items-center justify-between px-3 shrink-0 border-b border-default">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-tertiary">
            <Database size={14} />
            <span className="text-xs font-medium">Database</span>
          </div>
          
          <div className="w-[1px] h-4 bg-default" />

          <Select.Root value={activeTableId} onValueChange={setActiveTableId}>
            <Select.Trigger className="flex items-center gap-2 px-2 py-1 rounded hover:bg-elevated text-xs text-primary outline-none transition-colors">
              <Select.Value />
              <Select.Icon>
                <ChevronDown size={12} className="text-tertiary" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50">
                <Select.Viewport>
                  {MOCK_TABLES.map(table => (
                    <Select.Item 
                      key={table.id} 
                      value={table.id}
                      className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-primary hover:bg-accent rounded cursor-pointer outline-none"
                    >
                      <Select.ItemText>{table.name}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          <div className="flex items-center gap-1 ml-2">
            <button 
              onClick={() => setViewMode('table')}
              className={cn(
                "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors",
                viewMode === 'table' ? "bg-accent/20 text-accent" : "text-tertiary hover:text-primary"
              )}
            >
              Table
            </button>
            <button 
              onClick={() => setViewMode('sql')}
              className={cn(
                "px-2 py-1 rounded text-xs font-bold uppercase tracking-wider transition-colors",
                viewMode === 'sql' ? "bg-accent/20 text-accent" : "text-tertiary hover:text-primary"
              )}
            >
              SQL Editor
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-bold uppercase tracking-tighter">
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
            Connected
          </div>
          <button className="p-1.5 text-tertiary hover:text-primary hover:bg-elevated rounded transition-colors">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {viewMode === 'table' ? (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* TABLE GRID */}
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface border-b border-default">
                  <tr>
                    <th className="w-10 p-2 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedRows.length === activeTable.rows.length && activeTable.rows.length > 0}
                        onChange={toggleAll}
                        className="w-3.5 h-3.5 rounded border-default bg-page text-accent focus:ring-accent/20"
                      />
                    </th>
                    {activeTable.columns.map(col => (
                      <th key={col.name} className="p-2 border-r border-default last:border-r-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-primary">{col.name}</span>
                          <span className="text-[9px] px-1 py-0.5 rounded bg-elevated text-tertiary font-mono uppercase tracking-tighter">
                            {col.type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {activeTable.rows.map((row, idx) => (
                    <tr 
                      key={row.id} 
                      className={cn(
                        "hover:bg-elevated transition-colors group",
                        idx % 2 === 0 ? "bg-page" : "bg-inset/30"
                      )}
                    >
                      <td className="p-2 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedRows.includes(row.id)}
                          onChange={() => toggleRow(row.id)}
                          className="w-3.5 h-3.5 rounded border-default bg-page text-accent focus:ring-accent/20"
                        />
                      </td>
                      {activeTable.columns.map(col => (
                        <td key={col.name} className="p-2 border-r border-default last:border-r-0 text-xs text-secondary font-mono truncate max-w-[200px] cursor-text hover:text-primary">
                          {String(row[col.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {activeTable.rows.length === 0 && (
                    <tr>
                      <td colSpan={activeTable.columns.length + 1} className="p-10 text-center text-tertiary text-xs italic">
                        No rows found in this table.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* FOOTER */}
            <div className="h-10 bg-surface border-t border-default flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs text-tertiary">{activeTable.rows.length} rows</span>
                {selectedRows.length > 0 && (
                  <button className="flex items-center gap-1.5 px-2 py-1 rounded bg-error/10 text-error text-xs font-bold uppercase tracking-wider hover:bg-error/20 transition-colors">
                    <Trash2 size={12} />
                    Delete {selectedRows.length} selected
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/10 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/20 transition-colors">
                  <Plus size={12} />
                  Add Row
                </button>
                <div className="w-[1px] h-4 bg-default mx-1" />
                <div className="flex items-center gap-1">
                  <button className="px-2 py-1 text-xs text-tertiary hover:text-primary disabled:opacity-30" disabled>Previous</button>
                  <button className="px-2 py-1 text-xs text-tertiary hover:text-primary disabled:opacity-30" disabled>Next</button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* SQL EDITOR */}
            <div className="h-[40%] border-b border-default flex flex-col bg-page">
              <div className="h-8 flex items-center justify-between px-3 border-b border-default shrink-0">
                <div className="flex items-center gap-2">
                  <Code2 size={12} className="text-tertiary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-tertiary">Query Editor</span>
                </div>
                <div className="flex items-center gap-2">
                  <Select.Root>
                    <Select.Trigger className="flex items-center gap-2 px-2 py-0.5 rounded hover:bg-elevated text-xs text-tertiary outline-none transition-colors">
                      <History size={10} />
                      History
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="bg-elevated border border-default rounded-lg p-1 shadow-2xl z-50 max-w-[300px]">
                        <Select.Viewport>
                          {queryHistory.map((q, i) => (
                            <Select.Item 
                              key={i} 
                              value={q}
                              className="flex items-center gap-2 px-2 py-1.5 text-xs text-tertiary hover:bg-accent hover:text-white rounded cursor-pointer outline-none truncate"
                            >
                              <Select.ItemText>{q}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                  <button className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-white text-xs font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/20">
                    <Play size={10} />
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

            {/* RESULTS VIEW */}
            <div className="flex-1 flex flex-col min-h-0 bg-inset/30">
              <div className="h-8 flex items-center px-3 border-b border-default shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-tertiary">Results</span>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-surface border-b border-default">
                    <tr>
                      {activeTable.columns.map(col => (
                        <th key={col.name} className="p-2 border-r border-default last:border-r-0 text-xs font-medium text-tertiary uppercase tracking-wider">
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-default">
                    {activeTable.rows.map((row) => (
                      <tr key={row.id} className="hover:bg-elevated transition-colors">
                        {activeTable.columns.map(col => (
                          <td key={col.name} className="p-2 border-r border-default last:border-r-0 text-xs text-secondary font-mono truncate">
                            {String(row[col.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
