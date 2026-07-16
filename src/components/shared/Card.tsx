import React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Adds a calm hover affordance for clickable cards. */
  interactive?: boolean;
}

/** A padded surface card. Quiet border, generous padding — the calm-interface default. */
export function Card({ className, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-default rounded-xl p-4',
        interactive &&
          'transition-colors duration-fast ease-standard hover:bg-elevated cursor-pointer',
        className
      )}
      {...props}
    />
  );
}
