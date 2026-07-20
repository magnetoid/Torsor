import React from 'react';
import { DollarSign } from 'lucide-react';

/**
 * Revenue is intentionally an honest empty state: Torsor has no billing/payment backend yet
 * (it's free and self-hostable by default), so there is no revenue data to show. This replaces
 * the previous fabricated subscriptions/MRR charts. When a payment processor is wired, this
 * surfaces real figures.
 */
export function AdminRevenueTab() {
  return (
    <div className="flex flex-col h-full bg-page">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <DollarSign size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">Revenue</h2>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
        <DollarSign size={32} className="text-tertiary opacity-30" />
        <p className="text-sm text-secondary">No revenue data</p>
        <p className="text-xs text-tertiary max-w-sm">
          Billing isn&apos;t connected on this instance — Torsor is free and self-hostable by default. Wire a
          payment processor to populate real subscription and revenue figures here.
        </p>
      </div>
    </div>
  );
}
