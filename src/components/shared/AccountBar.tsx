import React from 'react';
import { AccountMenu } from './AccountMenu';

/**
 * A slim sticky top bar carrying the account menu on the right (and an optional page title
 * / actions on the left). Injected at the top of every page's content column so the account
 * affordance is consistently top-right across the whole app — matching the IDE TopBar's
 * chrome. Because it is `sticky top-0`, it stays put while the page content scrolls beneath.
 */
export function AccountBar({ title, actions }: { title?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="sticky top-0 z-30 shrink-0 h-12 flex items-center justify-between gap-3 px-4 border-b border-default bg-surface">
      <div className="min-w-0 text-sm font-semibold text-primary truncate">{title}</div>
      <div className="flex items-center gap-2 shrink-0">
        {actions}
        <AccountMenu size="md" />
      </div>
    </div>
  );
}
