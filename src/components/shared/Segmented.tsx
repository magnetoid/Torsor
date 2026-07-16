import React from 'react';
import { cn } from '../../lib/utils';

interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** A compact segmented control (the Turbo/Balanced/Max style toggle, generalized). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ...rest
}: SegmentedProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';
  return (
    <div
      role="tablist"
      className={cn('inline-flex items-center gap-0.5 rounded-lg border border-default bg-page p-0.5', className)}
      {...rest}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-md font-semibold select-none transition-colors duration-fast ease-standard',
              'outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:opacity-40 disabled:pointer-events-none',
              pad,
              active ? 'bg-elevated text-primary' : 'text-secondary hover:text-primary'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
