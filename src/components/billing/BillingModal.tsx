import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Separator from '@radix-ui/react-separator';
import { X, CreditCard, Zap, Shield, Check, ExternalLink, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useActiveWorkspace, useWorkspaceStore } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';

export function BillingModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { user } = useAuthStore();
  const activeWorkspace = useActiveWorkspace();
  const { updateWorkspace } = useWorkspaceStore();
  const [isUpgrading, setIsUpgrading] = useState<string | null>(null);

  const handleUpgrade = async (plan: 'pro' | 'team') => {
    if (!activeWorkspace) return;
    setIsUpgrading(plan);
    await new Promise(resolve => setTimeout(resolve, 1500));
    updateWorkspace(activeWorkspace.id, { plan });
    setIsUpgrading(null);
    // In a real app, this would redirect to Stripe
  };

  const handleTopUp = async (amount: number, price: number) => {
    if (!activeWorkspace) return;
    setIsUpgrading(`topup-${amount}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    updateWorkspace(activeWorkspace.id, { 
      usage: { 
        ...activeWorkspace.usage, 
        tokensUsedThisMonth: Math.max(0, activeWorkspace.usage.tokensUsedThisMonth - amount) 
      } 
    });
    setIsUpgrading(null);
  };

  if (!user || !activeWorkspace) return null;

  const usagePercent = (activeWorkspace.usage.tokensUsedThisMonth / (activeWorkspace.limits.maxTokensPerMonth || 1)) * 100;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface border border-default rounded-2xl p-6 shadow-2xl z-[101] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring outline-none max-h-[90vh] overflow-y-auto custom-scrollbar">
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
                  <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Current Plan</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-primary capitalize">{activeWorkspace.plan}</span>
                    <span className="px-2 py-0.5 bg-accent/10 text-accent text-[10px] font-bold rounded-full border border-accent/30">Active</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Tokens Used</span>
                  <p className="text-lg font-bold text-primary tabular-nums">{(activeWorkspace.usage.tokensUsedThisMonth ?? 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-secondary uppercase tracking-wider">
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

            {/* Upgrade Section */}
            {activeWorkspace.plan === 'free' && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                  <Zap size={16} className="text-amber-400" />
                  Upgrade to Pro
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-page border border-default rounded-xl p-4 flex flex-col gap-3 hover:border-accent/40 transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-primary">Pro</span>
                      <span className="text-lg font-bold text-accent">$25<span className="text-xs text-secondary">/mo</span></span>
                    </div>
                    <ul className="space-y-2 flex-1">
                      {['Unlimited projects', 'All models', '2M tokens', 'Custom domains'].map(f => (
                        <li key={f} className="flex items-center gap-2 text-[10px] text-secondary">
                          <Check size={10} className="text-emerald-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => handleUpgrade('pro')}
                      disabled={!!isUpgrading}
                      className="w-full py-2 bg-accent hover:bg-accent text-white text-xs font-bold rounded-lg transition-all"
                    >
                      {isUpgrading === 'pro' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Upgrade'}
                    </button>
                  </div>

                  <div className="bg-page border border-default rounded-xl p-4 flex flex-col gap-3 hover:border-accent/40 transition-all">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-primary">Team</span>
                      <span className="text-lg font-bold text-accent">$49<span className="text-xs text-secondary">/user</span></span>
                    </div>
                    <ul className="space-y-2 flex-1">
                      {['Everything in Pro', 'Team features', '10M tokens', 'BYOK, SSO'].map(f => (
                        <li key={f} className="flex items-center gap-2 text-[10px] text-secondary">
                          <Check size={10} className="text-emerald-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button 
                      onClick={() => handleUpgrade('team')}
                      disabled={!!isUpgrading}
                      className="w-full py-2 bg-transparent border border-default hover:bg-surface text-primary text-xs font-bold rounded-lg transition-all"
                    >
                      {isUpgrading === 'team' ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Upgrade'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Token Top-up */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-primary flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                Buy more tokens
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { amount: 100000, price: 5 },
                  { amount: 500000, price: 20 },
                  { amount: 1000000, price: 35 }
                ].map(pkg => (
                  <button 
                    key={pkg.amount}
                    onClick={() => handleTopUp(pkg.amount, pkg.price)}
                    disabled={!!isUpgrading}
                    className="bg-page border border-default rounded-xl p-3 flex flex-col items-center gap-1 hover:border-accent/40 transition-all group"
                  >
                    <span className="text-xs font-bold text-primary">{pkg.amount / 1000}K</span>
                    <span className="text-[10px] text-secondary group-hover:text-accent transition-colors">${pkg.price}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input 
                  type="number" 
                  placeholder="Custom amount..." 
                  className="flex-1 bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
                />
                <button className="px-4 py-2 bg-surface border border-default hover:bg-elevated text-primary text-xs font-bold rounded-lg transition-all">
                  Buy
                </button>
              </div>
            </div>

            <Separator.Root className="h-[1px] bg-default" />

            <div className="flex items-center justify-between">
              <button className="text-xs text-secondary hover:text-primary flex items-center gap-1.5 transition-colors">
                Billing details
                <ExternalLink size={12} />
              </button>
              <p className="text-[10px] text-tertiary">Secure payments via Stripe</p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
