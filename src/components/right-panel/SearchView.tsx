import React, { useState, useEffect } from 'react';
import { Search, FileCode, ChevronRight, Hash } from 'lucide-react';
import { useAppStore } from '../../useAppStore';
import { useEditorStore, SearchResult } from '../../stores/editorStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { cn } from '../../lib/utils';

export default function SearchView() {
  const { files } = useAppStore();
  const { searchQuery, setSearchQuery, searchResults, setSearchResults, openFile } = useEditorStore();
  const { openTab } = useLayoutStore();

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const results: SearchResult[] = [];
    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        const lines = file.content.split('\n');
        lines.forEach((lineText, idx) => {
          if (lineText.toLowerCase().includes(searchQuery.toLowerCase())) {
            results.push({
              id: `search-${file.id}-${idx}`,
              fileId: file.id,
              filePath: file.name,
              line: idx + 1,
              text: lineText.trim()
            });
          }
        });
      }
    });
    setSearchResults(results);
  }, [searchQuery, files]);

  const handleResultClick = (result: SearchResult) => {
    openFile(result.fileId);
    openTab('code');
    // In a real app, we'd also jump to the specific line in Monaco
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
            aria-label="Search files"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-page border border-subtle rounded-lg pl-9 pr-3 py-1.5 text-xs text-primary outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* RESULTS */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {searchQuery.trim().length < 2 ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <Search size={24} />
            <p className="text-xs">Type at least 2 characters to search</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-tertiary gap-2 px-4 text-center">
            <p className="text-xs">No results found for "{searchQuery}"</p>
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {searchResults.map((result) => (
              <button
                key={result.id}
                onClick={() => handleResultClick(result)}
                className="w-full p-2 text-left hover:bg-elevated rounded-md transition-colors group focus-ring"
              >
                <div className="flex items-center gap-2 mb-1">
                  <FileCode size={12} className="text-accent-hover" />
                  <span className="text-xs text-primary font-medium truncate">{result.filePath}</span>
                  <span className="text-xs text-tertiary ml-auto">Ln {result.line}</span>
                </div>
                <div className="text-xs text-secondary font-mono truncate pl-5 group-hover:text-primary transition-colors">
                  {result.text}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
