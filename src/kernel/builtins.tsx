// First-party contributions. These register Torsor's own features through the same
// kernel API a third-party plugin uses. Importing this module has the side effect of
// registering them, so the kernel barrel (./index) imports it once at startup.
import PreviewTab from '../components/tabs/PreviewTab';
import CodeEditorTab from '../components/tabs/CodeEditorTab';
import TerminalTab from '../components/tabs/TerminalTab';
import DatabaseTab from '../components/tabs/DatabaseTab';
import SecurityScanTab from '../components/tabs/SecurityScanTab';
import IntegrationsTab from '../components/tabs/IntegrationsTab';
import AgentSkillsTab from '../components/tabs/AgentSkillsTab';
import SecretsTab from '../components/tabs/SecretsTab';
import AppStorageTab from '../components/tabs/AppStorageTab';
import AuthTab from '../components/tabs/AuthTab';
import PublishingTab from '../components/tabs/PublishingTab';
import ValidationTab from '../components/tabs/ValidationTab';
import GitTab from '../components/tabs/GitTab';
import WorkflowsTab from '../components/tabs/WorkflowsTab';
import CanvasTab from '../components/tabs/CanvasTab';
import AppTestingTab from '../components/tabs/AppTestingTab';
import SettingsTab from '../components/tabs/SettingsTab';
import CheckpointsTab from '../components/tabs/CheckpointsTab';
import React from 'react';
import { PreviewBanner } from '../components/shared/PreviewBanner';

import { contributions, type TabContribution } from './contributions';

// Wrap a still-mock tab so it renders an honest "Preview" banner above its (unwired) UI —
// nothing on screen should imply a real backend action succeeded. Drop the wrapper once the
// tab is wired to real endpoints.
function withPreview(Comp: React.ComponentType, feature: string): React.FC {
  const Wrapped: React.FC = () => (
    <div className="flex flex-col h-full min-h-0">
      <PreviewBanner feature={feature} />
      <div className="flex-1 min-h-0 overflow-hidden">
        <Comp />
      </div>
    </div>
  );
  Wrapped.displayName = `Preview(${feature})`;
  return Wrapped;
}

const BUILTIN_TABS: TabContribution[] = [
  { type: 'preview', label: 'Preview', component: PreviewTab, source: 'core' },
  { type: 'code', label: 'Code Editor', component: CodeEditorTab, source: 'core' },
  { type: 'terminal', label: 'Terminal', component: TerminalTab, source: 'core' },
  { type: 'database', label: 'Database', component: withPreview(DatabaseTab, 'the Database explorer'), source: 'core' },
  { type: 'security', label: 'Security Scan', component: SecurityScanTab, source: 'core' },
  { type: 'integrations', label: 'Integrations', component: IntegrationsTab, source: 'core' },
  { type: 'skills', label: 'Agent Skills', component: AgentSkillsTab, source: 'core' },
  { type: 'secrets', label: 'Secrets', component: SecretsTab, source: 'core' },
  { type: 'storage', label: 'App Storage', component: withPreview(AppStorageTab, 'App Storage'), source: 'core' },
  { type: 'auth', label: 'Authentication', component: AuthTab, source: 'core' },
  { type: 'publishing', label: 'Publishing', component: PublishingTab, source: 'core' },
  { type: 'validation', label: 'Validation', component: ValidationTab, source: 'core' },
  { type: 'git', label: 'Git', component: withPreview(GitTab, 'the Git panel'), source: 'core' },
  { type: 'checkpoints', label: 'Checkpoints', component: CheckpointsTab, source: 'core' },
  { type: 'workflow', label: 'Workflows', component: WorkflowsTab, source: 'core' },
  { type: 'canvas', label: 'Canvas', component: CanvasTab, source: 'core' },
  { type: 'testing', label: 'App Testing', component: withPreview(AppTestingTab, 'App Testing'), source: 'core' },
  { type: 'settings', label: 'Settings', component: SettingsTab, source: 'core' },
];

for (const tab of BUILTIN_TABS) {
  contributions.registerTab(tab);
}
