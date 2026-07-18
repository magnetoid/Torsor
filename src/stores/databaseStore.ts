import { create } from 'zustand';
import { useProjectStore } from './projectStore';
import { apiExecCollect } from '../lib/api';

// Real SQLite explorer. Every operation runs `sqlite3` inside the project's
// workspace container via the existing exec primitive — no bespoke DB engine and
// no new backend. It works against any SQLite file already in the workspace;
// when none exists (or sqlite3 isn't installed) it reports that honestly rather
// than showing fabricated tables.

export interface DBColumn {
  name: string;
  type: string;
  isPK?: boolean;
  isNullable?: boolean;
}

export interface DatabaseState {
  sqliteAvailable: boolean;
  databases: string[];
  activeDb: string | null;
  tables: string[];
  activeTable: string | null;
  columns: DBColumn[];
  rows: Record<string, unknown>[];
  queryResult: { columns: string[]; rows: Record<string, unknown>[] } | null;
  queryError: string | null;
  queryHistory: string[];
  isLoading: boolean;
  error: string | null;

  detectDatabases: () => Promise<void>;
  selectDatabase: (path: string) => Promise<void>;
  selectTable: (table: string) => Promise<void>;
  runQuery: (sql: string) => Promise<void>;
}

const activeProjectId = () => useProjectStore.getState().activeProjectId;

// Parse `sqlite3 -json` output — a JSON array of row objects, or empty on no rows.
function parseJsonRows(stdout: string): Record<string, unknown>[] {
  const s = stdout.trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const useDatabaseStore = create<DatabaseState>()((set, get) => ({
  sqliteAvailable: true,
  databases: [],
  activeDb: null,
  tables: [],
  activeTable: null,
  columns: [],
  rows: [],
  queryResult: null,
  queryError: null,
  queryHistory: [],
  isLoading: false,
  error: null,

  detectDatabases: async () => {
    const projectId = activeProjectId();
    if (!projectId) {
      set({ error: 'No active project', databases: [] });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      // Is sqlite3 available in the container?
      const probe = await apiExecCollect(projectId, ['sh', '-c', 'command -v sqlite3 || true']);
      const sqliteAvailable = probe.stdout.trim() !== '';

      // Find SQLite files (skip node_modules / .git).
      const find = await apiExecCollect(projectId, [
        'sh',
        '-c',
        "find . -maxdepth 6 \\( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' \\) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -50",
      ]);
      const databases = find.stdout
        .split('\n')
        .map((l) => l.trim().replace(/^\.\//, ''))
        .filter(Boolean);

      set({ sqliteAvailable, databases, isLoading: false });
      if (sqliteAvailable && databases.length > 0 && !get().activeDb) {
        await get().selectDatabase(databases[0]);
      }
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to inspect databases' });
    }
  },

  selectDatabase: async (path) => {
    const projectId = activeProjectId();
    if (!projectId) return;
    set({ activeDb: path, isLoading: true, tables: [], activeTable: null, columns: [], rows: [] });
    try {
      const res = await apiExecCollect(projectId, [
        'sqlite3',
        path,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
      ]);
      const tables = res.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      set({ tables, isLoading: false });
      if (tables.length > 0) await get().selectTable(tables[0]);
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to read tables' });
    }
  },

  selectTable: async (table) => {
    const projectId = activeProjectId();
    const db = get().activeDb;
    if (!projectId || !db) return;
    set({ activeTable: table, isLoading: true });
    try {
      const [info, data] = await Promise.all([
        apiExecCollect(projectId, ['sqlite3', '-json', db, `PRAGMA table_info('${table.replace(/'/g, "''")}');`]),
        apiExecCollect(projectId, ['sqlite3', '-json', db, `SELECT * FROM '${table.replace(/'/g, "''")}' LIMIT 200;`]),
      ]);
      const columns: DBColumn[] = parseJsonRows(info.stdout).map((c) => ({
        name: String(c.name ?? ''),
        type: String(c.type ?? '').toLowerCase() || 'text',
        isPK: Number(c.pk) > 0,
        isNullable: Number(c.notnull) === 0,
      }));
      set({ columns, rows: parseJsonRows(data.stdout), isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to read table' });
    }
  },

  runQuery: async (sql) => {
    const projectId = activeProjectId();
    const db = get().activeDb;
    if (!projectId || !db) {
      set({ queryError: 'No database selected' });
      return;
    }
    set({ isLoading: true, queryError: null, queryResult: null });
    try {
      const res = await apiExecCollect(projectId, ['sqlite3', '-json', db, sql]);
      if (res.exitCode !== 0) {
        set({ isLoading: false, queryError: res.stderr.trim() || 'Query failed' });
        return;
      }
      const rows = parseJsonRows(res.stdout);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      set((state) => ({
        isLoading: false,
        queryResult: { columns, rows },
        queryHistory: [sql, ...state.queryHistory.filter((q) => q !== sql)].slice(0, 25),
      }));
    } catch (err) {
      set({ isLoading: false, queryError: err instanceof Error ? err.message : 'Query failed' });
    }
  },
}));
