import React from 'react';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'error' | 'muted';
}

/** A small status/label pill. Status variants use a tinted token background. */
export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants = {
    default: 'bg-elevated text-secondary border-default',
    accent: 'bg-accent-muted text-accent border-transparent',
    success: 'bg-success/10 text-success border-transparent',
    warning: 'bg-warning/10 text-warning border-transparent',
    error: 'bg-error/10 text-error border-transparent',
    muted: 'bg-transparent text-tertiary border-default',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-semibold leading-none',
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
