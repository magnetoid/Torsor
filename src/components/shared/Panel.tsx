import React from 'react';
import { cn } from '../../lib/utils';

/** A bordered surface container with optional header/body/footer. The building block of
 *  the shell's panels — one place to tune the calm visual language. */
export function Panel({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col min-h-0 bg-surface border border-default rounded-xl overflow-hidden', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 h-10 shrink-0 border-b border-default text-xs font-semibold text-primary',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 min-h-0 overflow-y-auto', className)} {...props}>
      {children}
    </div>
  );
}

export function PanelFooter({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('shrink-0 border-t border-default px-4 py-3', className)} {...props}>
      {children}
    </div>
  );
}
