import React from 'react';
import { X, FolderTree } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import FileTree from '../right-panel/FileTree';

/**
 * The left "Files" panel — a file manager for the open project, toggled from the TopBar
 * button next to the account menu. Reuses the real workspace FileTree (create/rename/
 * delete/duplicate, click-to-open in the editor); width is dragged via the adjacent
 * PanelResizer and persisted in the layout store.
 */
export function FileManagerPanel() {
  const { panelWidths, toggleFileManager } = useLayoutStore();

  return (
    <aside
      style={{ width: panelWidths.fileManager }}
      className="bg-surface border-r border-default flex flex-col overflow-hidden shrink-0"
    >
      <header className="h-9 px-3 flex items-center justify-between border-b border-default shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <FolderTree size={12} className="text-accent" />
          Files
        </span>
        <button
          onClick={toggleFileManager}
          aria-label="Close files panel"
          className="p-1 text-tertiary hover:text-primary transition-colors"
        >
          <X size={12} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </aside>
  );
}
