import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileEdit, TerminalSquare, ExternalLink, X, ArrowRight } from 'lucide-react';
import { useLayoutStore, Disclosure } from '../../stores/layoutStore';

function iconFor(kind: Disclosure['kind']) {
  switch (kind) {
    case 'files-changed':
      return <FileEdit size={14} />;
    case 'run-failed':
      return <TerminalSquare size={14} />;
    case 'preview-ready':
      return <ExternalLink size={14} />;
  }
}

/**
 * The single, calm "advanced on demand" chip. A real event (agent edited files, a command
 * failed, the app deployed) surfaces one dismissible offer to reveal the relevant surface.
 * Never modal; at most one visible — the progressive-disclosure discipline of Focus mode.
 */
export function DisclosureBar() {
  const disclosure = useLayoutStore((s) => s.disclosure);
  const acceptDisclosure = useLayoutStore((s) => s.acceptDisclosure);
  const dismissDisclosure = useLayoutStore((s) => s.dismissDisclosure);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <AnimatePresence>
        {disclosure && (
          <motion.div
            key={disclosure.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto flex items-center gap-3 rounded-xl border border-default bg-elevated px-3 py-2 shadow-2xl"
          >
            <span className="text-accent shrink-0">{iconFor(disclosure.kind)}</span>
            <span className="text-xs text-primary">{disclosure.label}</span>
            <button
              onClick={acceptDisclosure}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-white transition-colors duration-fast ease-standard hover:bg-accent-hover"
            >
              {disclosure.actionLabel}
              <ArrowRight size={12} />
            </button>
            <button
              onClick={dismissDisclosure}
              className="text-tertiary hover:text-primary transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
