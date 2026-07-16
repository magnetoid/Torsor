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

// --- Rail items + commands ---------------------------------------------------------------
// The rail and ⌘K palette read these from the registry (ADR 0008), so a plugin can add its
// own launcher/commands the same way. `pinned` rail items show inline; the rest live behind
// "More…". Icons are lucide components.
import {
  Play, Code2, Terminal, Database, Shield, Puzzle, Sparkles, Lock, HardDrive, UserCheck,
  Rocket, CheckCircle, GitBranch, History, Workflow, Frame, MonitorPlay, Settings,
  PanelLeft, PanelRight, Search, Rocket as DeployIcon, Save,
} from 'lucide-react';
import { useLayoutStore, type TabType } from '../stores/layoutStore';
import { useProjectStore } from '../stores/projectStore';
import { useCheckpointStore } from '../stores/checkpointStore';
import { useDeployStore } from '../stores/deployStore';

type RailDef = { id: TabType; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; pinned?: boolean };

const RAIL_ITEMS: RailDef[] = [
  { id: 'preview', label: 'Preview', icon: Play, pinned: true },
  { id: 'code', label: 'Code Editor', icon: Code2, pinned: true },
  { id: 'terminal', label: 'Terminal', icon: Terminal, pinned: true },
  { id: 'secrets', label: 'Secrets', icon: Lock, pinned: true },
  { id: 'checkpoints', label: 'Checkpoints', icon: History, pinned: true },
  { id: 'publishing', label: 'Publishing', icon: Rocket, pinned: true },
  { id: 'security', label: 'Security Scan', icon: Shield },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'storage', label: 'App Storage', icon: HardDrive },
  { id: 'integrations', label: 'Integrations', icon: Puzzle },
  { id: 'skills', label: 'Agent Skills', icon: Sparkles },
  { id: 'auth', label: 'Authentication', icon: UserCheck },
  { id: 'validation', label: 'Validation', icon: CheckCircle },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'workflow', label: 'Workflows', icon: Workflow },
  { id: 'canvas', label: 'Canvas', icon: Frame },
  { id: 'testing', label: 'App Testing', icon: MonitorPlay },
];

for (const r of RAIL_ITEMS) {
  contributions.registerRailItem({ id: r.id, label: r.label, opensTab: r.id, icon: r.icon, pinned: r.pinned, source: 'core' });
  contributions.registerCommand({
    id: `open.${r.id}`,
    title: `Open ${r.label}`,
    icon: r.icon,
    group: 'Tools',
    run: () => useLayoutStore.getState().openTab(r.id),
    source: 'core',
  });
}

// Real action commands (no-ops removed).
contributions.registerCommand({
  id: 'view.toggleMode', title: 'Toggle Focus / IDE mode', icon: PanelLeft, group: 'View', shortcut: '⌘⇧M',
  run: () => useLayoutStore.getState().toggleUiMode(), source: 'core',
});
contributions.registerCommand({
  id: 'view.settings', title: 'Open Settings', icon: Settings, group: 'View',
  run: () => useLayoutStore.getState().openTab('settings'), source: 'core',
});
contributions.registerCommand({
  id: 'view.toggleChat', title: 'Toggle chat panel', icon: PanelLeft, group: 'View', shortcut: '⌘B',
  run: () => useLayoutStore.getState().toggleLeftPanel(), source: 'core',
});
contributions.registerCommand({
  id: 'view.toggleFiles', title: 'Toggle file tree', icon: PanelRight, group: 'View', shortcut: '⌘⇧B',
  run: () => useLayoutStore.getState().toggleRightPanel(), source: 'core',
});
contributions.registerCommand({
  id: 'view.search', title: 'Global search', icon: Search, group: 'View', shortcut: '⌘⇧F',
  run: () => useLayoutStore.getState().setRightPanelView('search'), source: 'core',
});
contributions.registerCommand({
  id: 'agent.deploy', title: 'Deploy this project', icon: DeployIcon, group: 'Actions', keywords: 'publish ship live',
  run: () => { void useDeployStore.getState().deploy('torsor'); }, source: 'core',
});
contributions.registerCommand({
  id: 'agent.checkpoint', title: 'Create a checkpoint', icon: Save, group: 'Actions', keywords: 'snapshot save rollback',
  run: () => {
    const pid = useProjectStore.getState().activeProjectId;
    if (pid) void useCheckpointStore.getState().createCheckpoint(pid, '');
  },
  source: 'core',
});
