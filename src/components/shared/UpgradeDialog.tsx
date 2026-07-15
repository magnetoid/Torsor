import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Accordion from '@radix-ui/react-accordion';
import { 
  X, 
  Check, 
  Zap, 
  Users, 
  Shield, 
  Globe, 
  Rocket, 
  Sparkles, 
  ChevronDown,
  Lock,
  Headphones,
  Server,
  Cloud,
  Cpu,
  ShieldCheck
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspacePlan } from '../../types/workspace';
import { PLANS } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

interface PlanFeature {
  text: string;
  included: boolean;
}

interface PlanCardProps {
  id: WorkspacePlan;
  name: string;
  price: string;
  description: string;
  features: PlanFeature[];
  icon: React.ElementType;
  isCurrent: boolean;
  onSelect: () => void;
  accentColor: string;
  isPopular?: boolean;
}

function PlanCard({ id, name, price, description, features, icon: Icon, isCurrent, onSelect, accentColor, isPopular }: PlanCardProps) {
  return (
    <div className={cn(
      "flex flex-col p-5 rounded-2xl border transition-all relative overflow-hidden flex-1 min-w-[240px]",
      isCurrent ? "bg-accent-muted border-accent" : "bg-surface border-default hover:border-subtle",
      isPopular && !isCurrent && "border-accent/50 shadow-lg shadow-accent/5"
    )}>
      {isPopular && (
        <div className="absolute top-0 right-0 bg-accent text-white text-[9px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
          Popular
        </div>
      )}
      
      <div className="flex items-center gap-3 mb-4">
        <div className={cn("p-2 rounded-lg", accentColor)}>
          <Icon size={18} className="text-white" />
        </div>
        <h3 className="text-base font-bold text-primary">{name}</h3>
      </div>
      
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-primary">{price}</span>
          {price !== 'Custom' && <span className="text-secondary text-xs">/mo</span>}
        </div>
        <p className="text-xs text-secondary mt-1 h-8 line-clamp-2">{description}</p>
      </div>
      
      <div className="flex-1 space-y-2.5 mb-8">
        {features.map((feature, i) => (
          <div key={i} className="flex items-start gap-2.5 text-xs">
            <div className={cn(
              "mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center",
              feature.included ? "bg-success/20 text-success" : "bg-tertiary/20 text-tertiary"
            )}>
              {feature.included ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
            </div>
            <span className={feature.included ? "text-primary" : "text-tertiary"}>{feature.text}</span>
          </div>
        ))}
      </div>
      
      <button
        onClick={onSelect}
        disabled={isCurrent}
        className={cn(
          "w-full py-2 rounded-xl text-xs font-bold transition-all",
          isCurrent 
            ? "bg-elevated text-tertiary cursor-default border border-default" 
            : id === 'enterprise'
              ? "bg-surface border border-default text-primary hover:bg-elevated"
              : "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
        )}
      >
        {isCurrent ? 'Current Plan' : id === 'enterprise' ? 'Contact Sales' : `Upgrade to ${name}`}
      </button>
    </div>
  );
}

const FAQ_ITEMS = [
  {
    question: "Can I downgrade my plan?",
    answer: "Yes, you can downgrade at any time. Your new limits will take effect at the end of your current billing cycle."
  },
  {
    question: "What happens to my data if I hit a limit?",
    answer: "Your data remains safe. You'll simply be unable to create new projects or use certain features until you upgrade or free up space."
  },
  {
    question: "Do you offer annual billing?",
    answer: "Yes! Annual billing is available for Pro and Team plans with a 20% discount. Contact support to switch."
  }
];

export function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { getActiveWorkspace, updateWorkspace } = useWorkspaceStore();
  const activeWorkspace = getActiveWorkspace();
  const [isUpgrading, setIsUpgrading] = useState(false);
  
  const handleUpgrade = async (plan: WorkspacePlan) => {
    if (!activeWorkspace || plan === activeWorkspace.plan) return;
    
    if (plan === 'enterprise') {
      toast.info('Redirecting to sales contact form...');
      return;
    }

    setIsUpgrading(true);
    
    // Mock upgrade delay
    await new Promise(resolve => setTimeout(resolve, 800));

    updateWorkspace(activeWorkspace.id, { 
      plan,
      limits: PLANS[plan].limits
    });
    
    toast.success(`Upgraded to ${plan.charAt(0).toUpperCase() + plan.slice(1)}!`);
    setIsUpgrading(false);
    onOpenChange(false);
  };

  const plans = [
    {
      id: 'free' as WorkspacePlan,
      name: 'Free',
      price: '$0',
      description: 'Perfect for hobbyists and side projects.',
      icon: Rocket,
      accentColor: 'bg-secondary',
      features: [
        { text: '3 projects', included: true },
        { text: '1 member', included: true },
        { text: '50K tokens/month', included: true },
        { text: 'Turbo + Balanced modes', included: true },
        { text: 'Public projects only', included: true },
        { text: '100MB storage', included: true },
      ]
    },
    {
      id: 'pro' as WorkspacePlan,
      name: 'Pro',
      price: '$25',
      description: 'For power users and professional developers.',
      icon: Zap,
      accentColor: 'bg-accent',
      isPopular: true,
      features: [
        { text: '25 projects', included: true },
        { text: '5 members', included: true },
        { text: '2M tokens/month', included: true },
        { text: 'All economy modes', included: true },
        { text: 'Private projects', included: true },
        { text: 'Custom domains', included: true },
        { text: '5GB storage', included: true },
        { text: 'Priority support', included: true },
      ]
    },
    {
      id: 'team' as WorkspacePlan,
      name: 'Team',
      price: '$49',
      description: 'Collaborate with your team at scale.',
      icon: Users,
      accentColor: 'bg-success',
      features: [
        { text: 'Unlimited projects', included: true },
        { text: '50 members', included: true },
        { text: '10M tokens/month', included: true },
        { text: 'BYOK (Bring your own keys)', included: true },
        { text: 'SSO/SAML ready', included: true },
        { text: 'Audit logs', included: true },
        { text: 'Role-based access', included: true },
        { text: '50GB storage', included: true },
      ]
    },
    {
      id: 'enterprise' as WorkspacePlan,
      name: 'Enterprise',
      price: 'Custom',
      description: 'Custom infrastructure and dedicated support.',
      icon: ShieldCheck,
      accentColor: 'bg-primary',
      features: [
        { text: 'Everything in Team', included: true },
        { text: 'Self-hosted deployment', included: true },
        { text: 'Dedicated infrastructure', included: true },
        { text: 'Custom model fine-tuning', included: true },
        { text: 'Air-gapped option', included: true },
        { text: 'Custom SLA', included: true },
      ]
    }
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out duration-base" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-6xl bg-page border border-default rounded-3xl shadow-2xl z-[101] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in data-[state=closed]:fade-out data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring">
          <div className="p-8 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-8">
              <div>
                <Dialog.Title className="text-2xl font-bold text-primary flex items-center gap-2">
                  <Sparkles className="text-accent" size={24} />
                  Choose your plan
                  {activeWorkspace && (
                    <span className="ml-3 px-2 py-0.5 bg-accent-muted text-accent text-[10px] font-bold rounded-full uppercase tracking-wider border border-accent/20">
                      Current: {activeWorkspace.plan}
                    </span>
                  )}
                </Dialog.Title>
                <Dialog.Description className="text-secondary mt-1">
                  Scale your development with the right tools and limits.
                </Dialog.Description>
              </div>
              <Dialog.Close className="p-2 hover:bg-elevated rounded-full text-tertiary hover:text-primary transition-colors">
                <X size={20} />
              </Dialog.Close>
            </div>
            
            <div className="flex gap-4 mb-12 overflow-x-auto pb-4 px-1">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  id={plan.id}
                  name={plan.name}
                  price={plan.price}
                  description={plan.description}
                  features={plan.features}
                  icon={plan.icon}
                  isCurrent={activeWorkspace?.plan === plan.id}
                  onSelect={() => handleUpgrade(plan.id)}
                  accentColor={plan.accentColor}
                  isPopular={plan.isPopular}
                />
              ))}
            </div>

            <div className="max-w-2xl mx-auto">
              <h4 className="text-sm font-bold text-primary mb-4 text-center">Frequently Asked Questions</h4>
              <Accordion.Root type="single" collapsible className="space-y-2">
                {FAQ_ITEMS.map((item, i) => (
                  <Accordion.Item key={i} value={`item-${i}`} className="bg-surface border border-default rounded-xl overflow-hidden">
                    <Accordion.Header>
                      <Accordion.Trigger className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-primary hover:bg-elevated transition-colors text-left group">
                        {item.question}
                        <ChevronDown size={16} className="text-tertiary group-data-[state=open]:rotate-180 transition-transform" />
                      </Accordion.Trigger>
                    </Accordion.Header>
                    <Accordion.Content className="px-4 py-3 text-xs text-secondary bg-inset border-t border-default animate-in slide-in-from-top-2 duration-200">
                      {item.answer}
                    </Accordion.Content>
                  </Accordion.Item>
                ))}
              </Accordion.Root>
            </div>
          </div>

          {isUpgrading && (
            <div className="absolute inset-0 bg-page/50 backdrop-blur-[1px] flex items-center justify-center z-[102]">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                <span className="text-sm font-bold text-primary">Processing upgrade...</span>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
