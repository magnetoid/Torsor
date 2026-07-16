import React from 'react';
import { cn } from '../../lib/utils';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'default' | 'active';
  size?: 'sm' | 'md';
}

/** A square, icon-only button. The default of the calm shell: quiet until hovered. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant = 'ghost', size = 'md', ...props }, ref) => {
    const variants = {
      ghost: 'text-secondary hover:text-primary hover:bg-elevated',
      default: 'text-primary bg-elevated border border-default hover:bg-surface',
      active: 'text-accent bg-accent-muted',
    };
    const sizes = {
      sm: 'h-7 w-7',
      md: 'h-8 w-8',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center shrink-0 rounded-lg select-none',
          'transition-colors duration-fast ease-standard active:scale-[0.96]',
          'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-page',
          'disabled:opacity-40 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

IconButton.displayName = 'IconButton';
