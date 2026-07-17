import React, { useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { 
  Settings, 
  Users, 
  CreditCard, 
  Brain, 
  Key, 
  ShieldCheck, 
  History,
  ChevronRight,
  LayoutGrid
} from 'lucide-react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { AccountBar } from '../components/shared/AccountBar';
import { useActiveWorkspace } from '../stores/workspaceStore';
import { cn } from '../lib/utils';

// Tab Components
import { GeneralTab } from '../components/tabs/GeneralTab';
import { MembersTab } from '../components/tabs/MembersTab';
import { BillingTab } from '../components/tabs/BillingTab';
import { AgentSettingsTab } from '../components/tabs/AgentSettingsTab';
import { ApiKeysTab } from '../components/tabs/ApiKeysTab';
import { SecurityTab } from '../components/tabs/SecurityTab';
import { AuditLogTab } from '../components/tabs/AuditLogTab';

export function SettingsPage() {
  const activeWorkspace = useActiveWorkspace();
  
  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'agent', label: 'Agent', icon: Brain },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'security', label: 'Security', icon: ShieldCheck },
    { id: 'audit-log', label: 'Audit Log', icon: History },
  ];

  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />
      
      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <AccountBar title="Settings" />
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Breadcrumbs / Header */}
          <div className="flex items-center gap-2 text-xs font-bold text-tertiary uppercase tracking-wider mb-2">
            <LayoutGrid size={14} />
            <span>Workspaces</span>
            <ChevronRight size={12} />
            <span className="text-secondary">{activeWorkspace?.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-primary mb-8">Workspace Settings</h1>

          <Tabs.Root defaultValue="general" className="flex flex-col">
            <Tabs.List className="flex gap-1 border-b border-default mb-8 overflow-x-auto no-scrollbar">
              {tabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    "flex items-center gap-2 px-4 pb-3 text-sm font-bold transition-all relative outline-none whitespace-nowrap group",
                    "data-[state=active]:text-accent data-[state=inactive]:text-secondary hover:text-primary"
                  )}
                >
                  <tab.icon size={16} className="group-data-[state=active]:text-accent" />
                  {tab.label}
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent scale-x-0 transition-transform data-[state=active]:scale-x-100" />
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="min-h-[600px]">
              <Tabs.Content value="general">
                <GeneralTab />
              </Tabs.Content>
              
              <Tabs.Content value="members">
                <MembersTab />
              </Tabs.Content>
              
              <Tabs.Content value="billing">
                <BillingTab />
              </Tabs.Content>
              
              <Tabs.Content value="agent">
                <AgentSettingsTab />
              </Tabs.Content>
              
              <Tabs.Content value="api-keys">
                <ApiKeysTab />
              </Tabs.Content>
              
              <Tabs.Content value="security">
                <SecurityTab />
              </Tabs.Content>
              
              <Tabs.Content value="audit-log">
                <AuditLogTab />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </div>
      </main>
    </div>
  );
}
