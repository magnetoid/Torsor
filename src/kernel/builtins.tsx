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
import AgentRunsTab from '../components/tabs/AgentRunsTab';
import UsageTab from '../components/tabs/UsageTab';
import MCPServersTab from '../components/tabs/MCPServersTab';
import React from 'react';
import { PreviewBanner } from '../components/shared/PreviewBanner';
import {
  Play, Code2, Terminal, Database, Shield, Puzzle, Sparkles, Lock, HardDrive, UserCheck,
  Rocket, CheckCircle, GitBranch, History, Workflow, Frame, MonitorPlay, Settings,
  PanelLeft, PanelRight, Search, Rocket as DeployIcon, Save, Activity, BarChart3, Plug,
  SunMoon,
} from 'lucide-react';

import { contributions, TAB_GROUPS, type TabContribution } from './contributions';
import { useLayoutStore, type TabType } from '../stores/layoutStore';
import { useProjectStore } from '../stores/projectStore';
import { useCheckpointStore } from '../stores/checkpointStore';
import { useDeployStore } from '../stores/deployStore';
import { useThemeStore } from '../lib/theme';
import { useAppStore } from '../useAppStore';

// Wrap a still-mock tab so it renders an honest "Preview" banner above its (unwired) UI —
// nothing on screen should imply a real backend action succeeded. Applied automatically
// to every tab registered with maturity: 'preview'.
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

// ONE table describes every built-in tab: label, icon, group, order, pinned, maturity.
// The rail, the tab-strip "+" menu, and the ⌘K palette all render from this single
// registration, so the surfaces can never fall out of sync (they used to: three
// parallel lists disagreed on membership and icons).
type BuiltinTab = Omit<TabContribution, 'source'> & {
  /** Friendlier phrase for the mockup banner (defaults to the label). */
  previewFeature?: string;
};

const BUILTIN_TABS: BuiltinTab[] = [
  // Build — the core loop.
  { type: 'preview', label: 'Preview', component: PreviewTab, icon: Play, group: 'build', order: 0, pinned: true },
  { type: 'code', label: 'Code Editor', component: CodeEditorTab, icon: Code2, group: 'build', order: 1, pinned: true },
  { type: 'terminal', label: 'Terminal', component: TerminalTab, icon: Terminal, group: 'build', order: 2, pinned: true },
  // Agent — runs and safety nets.
  { type: 'runs', label: 'Agent Runs', component: AgentRunsTab, icon: Activity, group: 'agent', order: 0, pinned: true },
  { type: 'checkpoints', label: 'Checkpoints', component: CheckpointsTab, icon: History, group: 'agent', order: 1, pinned: true },
  // Project — configuration and shipping.
  { type: 'publishing', label: 'Publishing', component: PublishingTab, icon: Rocket, group: 'project', order: 0, pinned: true },
  { type: 'secrets', label: 'Secrets', component: SecretsTab, icon: Lock, group: 'project', order: 1 },
  { type: 'usage', label: 'Usage', component: UsageTab, icon: BarChart3, group: 'project', order: 2 },
  { type: 'mcp', label: 'MCP Servers', component: MCPServersTab, icon: Plug, group: 'project', order: 3 },
  { type: 'settings', label: 'Settings', component: SettingsTab, icon: Settings, group: 'project', order: 4 },
  // Labs — honest previews of not-yet-wired surfaces (banner auto-applied below).
  { type: 'database', label: 'Database', component: DatabaseTab, icon: Database, group: 'labs', order: 0, maturity: 'preview', previewFeature: 'the Database explorer' },
  { type: 'storage', label: 'App Storage', component: AppStorageTab, icon: HardDrive, group: 'labs', order: 1, maturity: 'preview', previewFeature: 'App Storage' },
  { type: 'auth', label: 'Authentication', component: AuthTab, icon: UserCheck, group: 'labs', order: 2, maturity: 'preview', previewFeature: 'the Authentication manager' },
  { type: 'git', label: 'Git', component: GitTab, icon: GitBranch, group: 'build', order: 3 },
  { type: 'security', label: 'Security Scan', component: SecurityScanTab, icon: Shield, group: 'labs', order: 4, maturity: 'preview', previewFeature: 'the Security Scan' },
  { type: 'validation', label: 'Validation', component: ValidationTab, icon: CheckCircle, group: 'labs', order: 5, maturity: 'preview', previewFeature: 'Validation' },
  { type: 'testing', label: 'App Testing', component: AppTestingTab, icon: MonitorPlay, group: 'labs', order: 6, maturity: 'preview', previewFeature: 'App Testing' },
  { type: 'integrations', label: 'Integrations', component: IntegrationsTab, icon: Puzzle, group: 'labs', order: 7, maturity: 'preview', previewFeature: 'Integrations' },
  { type: 'skills', label: 'Agent Skills', component: AgentSkillsTab, icon: Sparkles, group: 'labs', order: 8, maturity: 'preview', previewFeature: 'Agent Skills' },
  { type: 'workflow', label: 'Workflows', component: WorkflowsTab, icon: Workflow, group: 'labs', order: 9, maturity: 'preview', previewFeature: 'Workflows' },
  { type: 'canvas', label: 'Canvas', component: CanvasTab, icon: Frame, group: 'labs', order: 10, maturity: 'preview', previewFeature: 'the Canvas' },
];

const groupLabel = (gid?: string) => TAB_GROUPS.find((g) => g.id === gid)?.label ?? 'Tools';

for (const { previewFeature, ...tab } of BUILTIN_TABS) {
  contributions.registerTab({
    ...tab,
    component: tab.maturity === 'preview' ? withPreview(tab.component, previewFeature ?? tab.label) : tab.component,
    source: 'core',
  });
  // One "Open <tab>" palette command per tab, sectioned by the same groups.
  contributions.registerCommand({
    id: `open.${tab.type}`,
    title: `Open ${tab.label}`,
    icon: tab.icon,
    group: groupLabel(tab.group as string),
    keywords: tab.maturity === 'preview' ? 'labs preview mockup' : undefined,
    run: () => useLayoutStore.getState().openTab(tab.type as TabType),
    source: 'core',
  });
}

// --- Action / view commands --------------------------------------------------------------

contributions.registerCommand({
  id: 'project.run', title: 'Run project', icon: Play, group: 'Actions', keywords: 'start boot dev server',
  run: () => {
    // Same flow as the TopBar Run button: the Preview tab's BootSteps checklist is the
    // feedback surface for the real provision → start → ready sequence.
    useLayoutStore.getState().openTab('preview');
    useAppStore.getState().triggerBuild();
  },
  source: 'core',
});
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
  id: 'view.toggleTheme', title: 'Toggle light / dark theme', icon: SunMoon, group: 'View', shortcut: '⌘⇧L',
  run: () => useThemeStore.getState().toggleTheme(), source: 'core',
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
