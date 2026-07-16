import React from 'react';
import { cn } from '../../lib/utils';

/** Renders a keyboard key/shortcut, e.g. <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export function Kbd({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded border border-default bg-page',
        'text-[10px] font-medium text-tertiary select-none leading-none',
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  );
}
