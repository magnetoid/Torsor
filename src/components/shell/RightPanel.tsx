import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Library, 
  Search, 
  ChevronRight,
  FolderTree
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../stores/layoutStore';
import FileTree from '../right-panel/FileTree';
import SearchView from '../right-panel/SearchView';
import LibraryView from '../right-panel/LibraryView';

export function RightPanel({ className }: { className?: string }) {
  const {
    rightPanelOpen,
    toggleRightPanel,
    rightPanelView,
    setRightPanelView,
    panelWidths
  } = useLayoutStore();
  const width = panelWidths.right;

  const renderContent = () => {
    switch (rightPanelView) {
      case 'files':
        return <FileTree />;
      case 'library':
        return <LibraryView />;
      case 'search':
        return <SearchView />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence initial={false}>
      {rightPanelOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          // Width nearly instant so PanelResizer drags track the cursor; opacity keeps the
          // gentle open/close fade.
          transition={{ width: { duration: 0.06 }, opacity: { duration: 0.2, ease: 'easeOut' } }}
          className={cn("bg-surface border-l border-default flex flex-col overflow-hidden shrink-0", className)}
        >
          <div style={{ width }} className="h-full flex flex-col">
            <header className="h-9 px-3 flex items-center justify-between border-b border-default shrink-0">
              <span className="text-xs font-medium text-primary capitalize">
                {rightPanelView === 'files' ? 'File tree' : rightPanelView}
              </span>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setRightPanelView('files')}
                  className={cn("p-1 rounded transition-colors", rightPanelView === 'files' ? "text-accent bg-accent/10" : "text-secondary hover:text-primary")}
                >
                  <FolderTree size={14} />
                </button>
                <button 
                  onClick={() => setRightPanelView('library')}
                  className={cn("p-1 rounded transition-colors", rightPanelView === 'library' ? "text-accent bg-accent/10" : "text-secondary hover:text-primary")}
                >
                  <Library size={14} />
                </button>
                <button 
                  onClick={() => setRightPanelView('search')}
                  className={cn("p-1 rounded transition-colors", rightPanelView === 'search' ? "text-accent bg-accent/10" : "text-secondary hover:text-primary")}
                >
                  <Search size={14} />
                </button>
                <div className="w-[1px] h-3 bg-default mx-1" />
                <button 
                  onClick={toggleRightPanel}
                  className="p-1 text-secondary hover:text-primary transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-hidden">
              {renderContent()}
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
