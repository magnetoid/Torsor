import React from 'react';
import { BookOpen, Github, Keyboard, MessageSquareWarning, ExternalLink } from 'lucide-react';
import { HomeLayout } from '../components/shell/HomeLayout';
import { Kbd } from '../components/shared/Kbd';

const LINKS = [
  {
    icon: Github,
    title: 'Torsor on GitHub',
    description: 'Source, issues, and discussions — Torsor is open source.',
    href: 'https://github.com/magnetoid/Torsor',
  },
  {
    icon: BookOpen,
    title: 'Architecture & roadmap',
    description: 'How Torsor is built and where it is going.',
    href: 'https://github.com/magnetoid/Torsor/blob/main/docs/ARCHITECTURE.md',
  },
  {
    icon: MessageSquareWarning,
    title: 'Report an issue',
    description: 'Something broken or confusing? Tell us.',
    href: 'https://github.com/magnetoid/Torsor/issues/new',
  },
];

/** Help — real links + the shortcut cheat sheet (replaces the old "coming soon" stub). */
export function HelpPage() {
  return (
    <HomeLayout title="Help & Support" mainClassName="flex-1 min-w-0 flex flex-col overflow-y-auto animate-in fade-in duration-slow">
        <div className="max-w-3xl w-full mx-auto px-6 py-8 space-y-8">
          <section className="grid gap-3 sm:grid-cols-2">
            {LINKS.map(({ icon: Icon, title, description, href }) => (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-3 p-4 bg-surface border border-default rounded-xl hover:border-accent/30 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-inset border border-default flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                    {title}
                    <ExternalLink size={11} className="text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-secondary mt-0.5">{description}</p>
                </div>
              </a>
            ))}
          </section>

          <section>
            <h2 className="flex items-center gap-2 text-sm font-bold text-secondary uppercase tracking-wider mb-3">
              <Keyboard size={14} /> Keyboard shortcuts
            </h2>
            <div className="bg-surface border border-default rounded-xl divide-y divide-default">
              {[
                ['Command palette (everything is in here)', '⌘K'],
                ['Toggle Focus / IDE mode', '⌘⇧M'],
                ['Toggle the agent chat', '⌘B'],
                ['Toggle the file tree', '⌘⇧B'],
                ['Global search', '⌘⇧F'],
                ['Open the terminal', '⌘`'],
                ['Toggle light / dark theme', '⌘⇧L'],
              ].map(([label, keys]) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-primary">{label}</span>
                  <Kbd>{keys}</Kbd>
                </div>
              ))}
            </div>
          </section>
        </div>
    </HomeLayout>
  );
}
