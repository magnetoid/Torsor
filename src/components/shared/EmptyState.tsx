import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  className,
  children
}) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center p-8 animate-in fade-in zoom-in-95 duration-500",
      className
    )}>
      <div className="w-16 h-16 bg-elevated rounded-xl flex items-center justify-center text-tertiary mb-6 shadow-sm border border-default">
        <Icon size={32} strokeWidth={1.5} />
      </div>
      
      <h3 className="text-lg font-bold text-primary mb-2 tracking-tight">
        {title}
      </h3>
      
      <p className="text-sm text-secondary max-w-[280px] leading-relaxed mb-8">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button 
          onClick={onAction}
          variant="primary"
          size="lg"
        >
          {actionLabel}
        </Button>
      )}

      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
};
