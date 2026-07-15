import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'error' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20 hover:shadow-accent/30',
      secondary: 'bg-elevated text-primary border border-default hover:bg-surface hover:border-accent/40',
      ghost: 'bg-transparent text-secondary hover:text-primary hover:bg-elevated',
      error: 'bg-error text-white hover:bg-error/90 shadow-lg shadow-error/20',
      success: 'bg-success text-white hover:bg-success/90 shadow-lg shadow-success/20',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2',
      icon: 'p-2',
    };

    return (
      <button
        ref={ref}
        className={cn(
          // Uniform motion: quick transition on hover/press, subtle scale-down on active
          // for tactile feedback, on-brand focus-visible ring for keyboard users.
          'inline-flex items-center justify-center whitespace-nowrap select-none rounded-lg font-semibold',
          'transition-all duration-fast ease-standard active:scale-[0.98]',
          'outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-page',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:pointer-events-none',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';
