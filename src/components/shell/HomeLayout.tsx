import React from 'react';
import { HomeSidebar } from './HomeSidebar';
import { AccountBar } from '../shared/AccountBar';

/**
 * Standard shell for the non-project ("home") pages. Mirrors the project AppShell shape:
 * a full-width AccountBar spanning the whole window, with the sidebar + scrollable content
 * in a row BELOW it. Keeping every home page on this one component means the top bar can
 * never rise alongside/over the sidebar again (the bug HomePage used to have) and the chrome
 * stays consistent across the app without per-page copy-paste.
 */
export function HomeLayout({
  title,
  actions,
  mainClassName = 'flex-1 min-w-0 overflow-y-auto',
  children,
}: {
  title?: React.ReactNode;
  /** Optional controls rendered on the right of the AccountBar (filters, bulk actions). */
  actions?: React.ReactNode;
  /** Classes for the scrollable <main>. Override when a page needs its own scroll/flex setup. */
  mainClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen bg-page text-primary font-sans">
      <AccountBar title={title} actions={actions} />
      <div className="flex flex-1 min-h-0">
        <HomeSidebar />
        <main className={mainClassName}>{children}</main>
      </div>
    </div>
  );
}
