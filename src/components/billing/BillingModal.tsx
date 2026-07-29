import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Separator from '@radix-ui/react-separator';
import { X, CreditCard, ExternalLink } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useActiveWorkspace } from '../../stores/workspaceStore';

export function BillingModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { user } = useAuthStore();
  const activeWorkspace = useActiveWorkspace();

  if (!user || !activeWorkspace) return null;

  const usagePercent = (activeWorkspace.usage.tokensUsedThisMonth / (activeWorkspace.limits.maxTokensPerMonth || 1)) * 100;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-default rounded-xl p-6 shadow-2xl z-[101] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring outline-none max-h-[90vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-accent" />
              <Dialog.Title className="text-lg font-bold text-primary">Plan & Usage</Dialog.Title>
            </div>
            <Dialog.Close className="text-secondary hover:text-primary transition-colors">
              <X size={20} />
            </Dialog.Close>
          </div>

          <div className="space-y-8">
            {/* Current Plan */}
            <div className="bg-page border border-default rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-secondary uppercase tracking-wider">Current Plan</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-primary capitalize">{activeWorkspace.plan}</span>
                    <span className="px-2 py-0.5 bg-accent/10 text-accent text-xs font-bold rounded-full border border-accent/30">Active</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-secondary uppercase tracking-wider">Tokens Used</span>
                  <p className="text-lg font-bold text-primary tabular-nums">{(activeWorkspace.usage.tokensUsedThisMonth ?? 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-secondary uppercase tracking-wider">
                  <span>Usage</span>
                  <span>{(activeWorkspace.usage.tokensUsedThisMonth ?? 0).toLocaleString()} / {(activeWorkspace.limits.maxTokensPerMonth ?? 0).toLocaleString()}</span>
                </div>
                <div className="h-2 bg-inset rounded-full overflow-hidden border border-default">
                  <div 
                    className="h-full bg-accent transition-all duration-500" 
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            <Separator.Root className="h-[1px] bg-default" />

            {/* Honest footer: no payment backend exists on self-hosted Torsor. */}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-tertiary">
                Plans are assigned by your instance admin — no payment is connected on
                self-hosted Torsor.
              </p>
              <a
                href="/billing"
                className="shrink-0 text-xs font-bold text-accent hover:text-accent-hover flex items-center gap-1.5 transition-colors focus-ring"
              >
                Usage details
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
