import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { Search, FileCode } from 'lucide-react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAppStore } from '../../useAppStore';
import { useEditorStore } from '../../stores/editorStore';
import { contributions, TAB_GROUPS } from '../../kernel/contributions';
import { cn } from '../../lib/utils';
import { overlayMotion, dialogMotion } from '../../lib/motion';
import { Kbd } from './Kbd';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPalette } = useLayoutStore();
  const { files } = useAppStore();
  const { openFile } = useEditorStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPalette(!commandPaletteOpen);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [commandPaletteOpen, setCommandPalette]);

  const run = (fn: () => void) => {
    fn();
    setCommandPalette(false);
  };

  // Commands come from the contribution registry (ADR 0008) — first-party and plugin
  // commands render identically. Sections follow the canonical tab-group order
  // (Build → Agent → Project → Labs), then View/Actions, then anything else.
  const commands = contributions.commands();
  const canon = [...TAB_GROUPS]
    .sort((a, b) => a.order - b.order)
    .map((g) => g.label)
    .concat(['View', 'Actions']);
  const groups: string[] = [];
  for (const c of commands) {
    const g = c.group || 'Commands';
    if (!groups.includes(g)) groups.push(g);
  }
  groups.sort((a, b) => {
    const ia = canon.indexOf(a);
    const ib = canon.indexOf(b);
    return (ia === -1 ? canon.length : ia) - (ib === -1 ? canon.length : ib);
  });

  return (
    <Dialog.Root open={commandPaletteOpen} onOpenChange={setCommandPalette}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn('fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]', overlayMotion)} />
        <Dialog.Content className={cn('fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg bg-surface border border-default rounded-xl shadow-2xl z-[101] overflow-hidden', dialogMotion)}>
          <Command className="flex flex-col h-full">
            <div className="flex items-center px-4 border-b border-default">
              <Search className="mr-3 text-tertiary" size={18} />
              <Command.Input
                placeholder="Search files, tools, and actions..."
                className="flex-1 h-12 bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
              />
            </div>

            <Command.List className="max-h-[320px] overflow-y-auto p-2 no-scrollbar">
              <Command.Empty className="py-6 text-center text-sm text-secondary">No results found.</Command.Empty>

              {groups.map((group) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="px-2 py-1.5 text-xs font-bold text-tertiary uppercase tracking-widest"
                >
                  {commands
                    .filter((c) => (c.group || 'Commands') === group)
                    .map((c) => {
                      const Icon = c.icon;
                      return (
                        <Item
                          key={c.id}
                          value={`${c.title} ${c.keywords ?? ''}`}
                          onSelect={() => run(c.run)}
                          icon={Icon ? <Icon size={14} /> : null}
                          label={c.title}
                          shortcut={c.shortcut}
                        />
                      );
                    })}
                </Command.Group>
              ))}

              {files.length > 0 && (
                <Command.Group
                  heading="Files"
                  className="px-2 py-1.5 text-xs font-bold text-tertiary uppercase tracking-widest mt-2"
                >
                  {files.map((file) => (
                    <Item
                      key={file.id}
                      value={file.name}
                      onSelect={() => run(() => openFile(file.id))}
                      icon={<FileCode size={14} />}
                      label={file.name}
                      meta={file.extension}
                    />
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({
  icon,
  label,
  shortcut,
  meta,
  value,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  /** A real keybinding — rendered as keycaps. */
  shortcut?: string;
  /** Non-keybinding trailing hint (e.g. a file extension) — rendered as plain text. */
  meta?: string;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-primary hover:bg-accent-muted hover:text-accent-hover cursor-pointer transition-colors aria-selected:bg-accent-muted aria-selected:text-accent-hover outline-none"
    >
      <span className="text-secondary">{icon}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
      {meta && <span className="text-xs text-tertiary font-mono">{meta}</span>}
    </Command.Item>
  );
}
