import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLayoutStore } from '../../stores/layoutStore';
import { cn } from '../../lib/utils';
import ChatPanel from '../../ChatPanel'; // Assuming ChatPanel exists at this path

export function LeftPanel({ className }: { className?: string }) {
  const { leftPanelOpen, uiMode, panelWidths } = useLayoutStore();
  // Draggable width in the IDE (via PanelResizer); Focus keeps its centered flex layout.
  const width = uiMode === 'focus' ? 380 : panelWidths.left;

  return (
    <AnimatePresence initial={false}>
      {leftPanelOpen && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          // Width nearly instant so PanelResizer drags track the cursor; opacity keeps the
          // gentle open/close fade.
          transition={{ width: { duration: 0.06 }, opacity: { duration: 0.2, ease: 'easeOut' } }}
          className={cn("bg-page border-r border-default flex flex-col overflow-hidden shrink-0", className)}
        >
          <div style={{ width }} className="h-full flex flex-col">
            <ChatPanel />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
