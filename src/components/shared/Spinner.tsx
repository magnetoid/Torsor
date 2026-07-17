import React from 'react';
import { cn } from '../../lib/utils';

/** The one loading ring — for genuinely indeterminate moments. Prefer `Skeleton`
 *  variants when the loading content has a knowable shape (lists, cards, tables). */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ width: size, height: size }}
      className={cn('border-2 border-default border-t-accent rounded-full animate-spin shrink-0', className)}
    />
  );
}
