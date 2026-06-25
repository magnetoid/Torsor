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

import { contributions, type TabContribution } from './contributions';

const BUILTIN_TABS: TabContribution[] = [
  { type: 'preview', label: 'Preview', component: PreviewTab, source: 'core' },
  { type: 'code', label: 'Code Editor', component: CodeEditorTab, source: 'core' },
  { type: 'terminal', label: 'Terminal', component: TerminalTab, source: 'core' },
  { type: 'database', label: 'Database', component: DatabaseTab, source: 'core' },
  { type: 'security', label: 'Security Scan', component: SecurityScanTab, source: 'core' },
  { type: 'integrations', label: 'Integrations', component: IntegrationsTab, source: 'core' },
  { type: 'skills', label: 'Agent Skills', component: AgentSkillsTab, source: 'core' },
  { type: 'secrets', label: 'Secrets', component: SecretsTab, source: 'core' },
  { type: 'storage', label: 'App Storage', component: AppStorageTab, source: 'core' },
  { type: 'auth', label: 'Authentication', component: AuthTab, source: 'core' },
  { type: 'publishing', label: 'Publishing', component: PublishingTab, source: 'core' },
  { type: 'validation', label: 'Validation', component: ValidationTab, source: 'core' },
  { type: 'git', label: 'Git', component: GitTab, source: 'core' },
  { type: 'workflow', label: 'Workflows', component: WorkflowsTab, source: 'core' },
  { type: 'canvas', label: 'Canvas', component: CanvasTab, source: 'core' },
  { type: 'testing', label: 'App Testing', component: AppTestingTab, source: 'core' },
  { type: 'settings', label: 'Settings', component: SettingsTab, source: 'core' },
];

for (const tab of BUILTIN_TABS) {
  contributions.registerTab(tab);
}
