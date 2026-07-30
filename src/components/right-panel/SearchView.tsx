import React, { useEffect, useState } from 'react';
import { Search, FileCode, Loader2 } from 'lucide-react';
import { useAppStore } from '../../useAppStore';
import { useEditorStore } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { apiRequest } from '../../lib/api';

/**
 * Global search (⌘⇧F) backed by a real server-side grep inside the workspace
 * container, so it finds matches in files the editor has never opened. (The old
 * version only filtered already-loaded file contents — near-useless on a fresh
 * project.) Results open in the editor; FileNode.id === workspace path.
 */

interface WorkspaceSearchMatch {
  path: string;
  line: number;
  text: string;
}

export default function SearchView() {
  const workspaceProjectId = useAppStore((s) => s.workspaceProjectId);
  const loadFileContent = useAppStore((s) => s.loadFileContent);
  const { searchQuery, setSearchQuery, openFile } = useEditorStore();
  const { openTab } = useLayoutStore();

  const [results, setResults] = useState<WorkspaceSearchMatch[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced server-side search.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2 || !workspaceProjectId) {
      setResults([]);
      setTruncated(false);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const t = setTimeout(() => {
      apiRequest<{ items: WorkspaceSearchMatch[]; truncated: boolean }>(
        `/api/v1/projects/${workspaceProjectId}/workspace/search`,
        { method: 'POST', auth: true, body: JSON.stringify({ query: q }) },
      )
        .then((res) => {
          setResults(res.items);
          setTruncated(res.truncated);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Search failed'))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery, workspaceProjectId]);

  const handleResultClick = (match: WorkspaceSearchMatch) => {
    openFile(match.path);
    if (workspaceProjectId) void loadFileContent(workspaceProjectId, match.path);
    openTab('code');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* HEADER */}
      <div className="h-9 flex items-center px-3 shrink-0 border-b border-subtle">
        <span className="text-xs font-bold uppercase tracking-wider text-secondary">Search</span>
      </div>

      {/* INPUT */}
      <div className="p-3 border-b border-subtle">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input
            type="text"
            aria-label="Search workspace files"
            placeholder="Search workspace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-subtle rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* RESULTS */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {!workspaceProjectId ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <Search size={24} />
            <p className="text-xs">Open a project workspace to search its files</p>
          </div>
        ) : searchQuery.trim().length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <Search size={24} />
            <p className="text-xs">Type at least 2 characters to search every file in the workspace</p>
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-xs">Searching workspace…</p>
          </div>
        ) : error ? (
          <div className="px-3">
            <p className="text-xs text-error rounded-lg border border-error/20 bg-error/10 p-2">{error}</p>
          </div>
        ) : results.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <p className="text-xs">No results found for "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {truncated && (
              <p className="px-2 py-1 text-[11px] text-tertiary">
                Showing the first {results.length} matches — refine the query for more precision.
              </p>
            )}
            {results.map((match, i) => (
              <button
                key={`${match.path}:${match.line}:${i}`}
                onClick={() => handleResultClick(match)}
                className="w-full p-2 text-left hover:bg-elevated rounded-md transition-colors group focus-ring"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileCode size={12} className="text-accent-hover shrink-0" />
                  <span className="text-xs text-primary font-medium truncate">{match.path}</span>
                  <span className="text-xs text-tertiary ml-auto shrink-0">Ln {match.line}</span>
                </div>
                <div className="text-xs text-secondary font-mono truncate pl-5 group-hover:text-primary transition-colors">
                  {match.text.trim()}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
