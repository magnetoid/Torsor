import React, { useState } from 'react';
import {
  Settings,
  Users,
  Shield,
  Terminal,
  CreditCard,
  Bot,
  KeyRound,
  ScrollText,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import * as ScrollArea from '@radix-ui/react-scroll-area';

// ONE settings implementation: these are the exact section components the /settings page
// renders. This center tab is just a second entry point to the same surface — it used to
// be a parallel 8-section settings app with its own duplicated Workspace/Members forms
// and dead Save/Reset/Sign-Out buttons.
import { GeneralTab } from './GeneralTab';
import { MembersTab } from './MembersTab';
import { BillingTab } from './BillingTab';
import { AgentSettingsTab } from './AgentSettingsTab';
import { ApiKeysTab } from './ApiKeysTab';
import { SecurityTab } from './SecurityTab';
import { AuditLogTab } from './AuditLogTab';
import CLIReference from './CLIReference';

type SectionId = 'general' | 'members' | 'billing' | 'agent' | 'api-keys' | 'security' | 'audit-log' | 'cli';

const SECTIONS: { id: SectionId; label: string; icon: React.ElementType; component: React.ComponentType }[] = [
  { id: 'general', label: 'General', icon: Settings, component: GeneralTab },
  { id: 'members', label: 'Members', icon: Users, component: MembersTab },
  { id: 'billing', label: 'Billing', icon: CreditCard, component: BillingTab },
  { id: 'agent', label: 'Agent', icon: Bot, component: AgentSettingsTab },
  { id: 'api-keys', label: 'API Keys', icon: KeyRound, component: ApiKeysTab },
  { id: 'security', label: 'Security', icon: Shield, component: SecurityTab },
  { id: 'audit-log', label: 'Audit Log', icon: ScrollText, component: AuditLogTab },
  { id: 'cli', label: 'Torsor CLI', icon: Terminal, component: CLIReference },
];

export default function SettingsTab() {
  const [active, setActive] = useState<SectionId>('general');
  const ActiveComponent = SECTIONS.find((s) => s.id === active)?.component ?? GeneralTab;

  return (
    <div className="flex h-full bg-page">
      <aside className="w-[200px] border-r border-default bg-surface flex flex-col shrink-0">
        <header className="h-11 px-4 flex items-center border-b border-default shrink-0">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Settings</span>
        </header>
        <ScrollArea.Root className="flex-1">
          <ScrollArea.Viewport className="h-full">
            <nav className="p-2 space-y-0.5">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActive(section.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                    active === section.id
                      ? 'bg-accent-muted text-accent'
                      : 'text-secondary hover:text-primary hover:bg-elevated'
                  )}
                >
                  <section.icon size={14} />
                  {section.label}
                </button>
              ))}
            </nav>
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <ActiveComponent />
        </div>
      </main>
    </div>
  );
}
