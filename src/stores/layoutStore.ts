import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Code2, 
  Play, 
  Terminal, 
  Database, 
  Shield, 
  Puzzle, 
  Sparkles,
  Settings,
  Lock as LockIcon,
  HardDrive,
  UserCheck,
  Rocket,
  CheckCircle,
  GitBranch,
  Workflow,
  Frame,
  MonitorPlay,
  History,
  Activity,
  BarChart3,
  LucideIcon
} from 'lucide-react';

export type TabType = 'preview' | 'code' | 'terminal' | 'database' | 'security' | 'integrations' | 'skills' | 'settings' | 'secrets' | 'storage' | 'auth' | 'publishing' | 'validation' | 'git' | 'workflow' | 'canvas' | 'testing' | 'checkpoints' | 'runs' | 'usage';

export interface Tab {
  id: string;
  type: TabType;
  label: string;
  closable: boolean;
}

export type UiMode = 'focus' | 'ide';

/** A single, dismissible "advanced on demand" offer surfaced by a real event (the agent
 *  edited files, a command failed, the app deployed). Calm discipline: at most one visible. */
export interface Disclosure {
  id: string;
  kind: 'files-changed' | 'run-failed' | 'preview-ready';
  label: string;
  actionLabel: string;
  /** Tab to open when the user accepts the offer (escalates Focus→IDE). */
  tab?: TabType;
  /** External URL to open instead of a tab. */
  url?: string;
}

interface LayoutState {
  /** 'focus' = the calm, minimal surface (chat + preview) for describe→build; 'ide' = the
   *  full workspace (rail, tabs, side panels). New users start in focus; the toggle + ⌘K
   *  reveal the IDE on demand. */
  uiMode: UiMode;
  /** The current progressive-disclosure offer, or null. Never persisted. */
  disclosure: Disclosure | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  rightPanelView: 'files' | 'library' | 'search';
  centerTabs: Tab[];
  activeTabId: string;
  secondaryTabId: string | null;
  splitDirection: 'none' | 'vertical' | 'horizontal';
  splitRatio: number;
  commandPaletteOpen: boolean;
  quickOpenOpen: boolean;
  homeSidebarCollapsed: boolean;
  
  // Actions
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setRightPanelView: (view: 'files' | 'library' | 'search') => void;
  openTab: (type: TabType) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  setSecondaryTab: (id: string | null) => void;
  setSplit: (direction: 'none' | 'vertical' | 'horizontal') => void;
  setSplitRatio: (ratio: number) => void;
  reorderTabs: (tabs: Tab[]) => void;
  setCommandPalette: (open: boolean) => void;
  setQuickOpen: (open: boolean) => void;
  setHomeSidebarCollapsed: (collapsed: boolean) => void;
  toggleHomeSidebar: () => void;
  setUiMode: (mode: UiMode) => void;
  toggleUiMode: () => void;
  /** Surface a disclosure offer (replaces any current one — max one visible). */
  pushDisclosure: (d: Omit<Disclosure, 'id'>) => void;
  dismissDisclosure: () => void;
  /** Accept the current offer: open its tab (escalating to IDE) or URL, then dismiss. */
  acceptDisclosure: () => void;
}

export const TAB_CONFIG: Record<TabType, { label: string; icon: LucideIcon; closable: boolean }> = {
  preview: { label: 'Preview', icon: Play, closable: true },
  code: { label: 'Code Editor', icon: Code2, closable: true },
  terminal: { label: 'Terminal', icon: Terminal, closable: true },
  database: { label: 'Database', icon: Database, closable: true },
  security: { label: 'Security Scan', icon: Shield, closable: true },
  integrations: { label: 'Integrations', icon: Puzzle, closable: true },
  skills: { label: 'Agent Skills', icon: Sparkles, closable: true },
  settings: { label: 'Settings', icon: Settings, closable: true },
  secrets: { label: 'Secrets', icon: LockIcon, closable: true },
  storage: { label: 'App Storage', icon: HardDrive, closable: true },
  auth: { label: 'Authentication', icon: UserCheck, closable: true },
  publishing: { label: 'Publishing', icon: Rocket, closable: true },
  validation: { label: 'Validation', icon: CheckCircle, closable: true },
  git: { label: 'Git', icon: GitBranch, closable: true },
  workflow: { label: 'Workflows', icon: Workflow, closable: true },
  canvas: { label: 'Canvas', icon: Frame, closable: true },
  testing: { label: 'App Testing', icon: MonitorPlay, closable: true },
  checkpoints: { label: 'Checkpoints', icon: History, closable: true },
  runs: { label: 'Agent Runs', icon: Activity, closable: true },
  usage: { label: 'Usage', icon: BarChart3, closable: true },
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      uiMode: 'focus',
      disclosure: null,
      leftPanelOpen: true,
      rightPanelOpen: true,
      rightPanelView: 'files',
      centerTabs: [
        { id: 'tab-preview', type: 'preview', label: 'Preview', closable: false }
      ],
      activeTabId: 'tab-preview',
      secondaryTabId: null,
      splitDirection: 'none',
      splitRatio: 0.5,
      commandPaletteOpen: false,
      quickOpenOpen: false,
      homeSidebarCollapsed: false,

      toggleLeftPanel: () => set((state) => ({ leftPanelOpen: !state.leftPanelOpen })),
      toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),
      setRightPanelView: (view) => set({ rightPanelView: view, rightPanelOpen: true }),
      
      openTab: (type) => {
        const { centerTabs } = get();
        const existingTab = centerTabs.find(t => t.type === type);
        
        if (existingTab) {
          set({ activeTabId: existingTab.id });
          return;
        }

        const config = TAB_CONFIG[type];
        const newTab: Tab = {
          id: `tab-${type}-${Date.now()}`,
          type,
          label: config.label,
          closable: config.closable
        };

        set({ 
          centerTabs: [...centerTabs, newTab],
          activeTabId: newTab.id
        });
      },

      closeTab: (id) => set((state) => {
        const newTabs = state.centerTabs.filter(t => t.id !== id);
        let newActiveId = state.activeTabId;
        let newSecondaryId = state.secondaryTabId;
        let newSplit = state.splitDirection;
        
        if (state.activeTabId === id) {
          newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : '';
        }

        if (state.secondaryTabId === id) {
          newSecondaryId = null;
          newSplit = 'none';
        }

        return {
          centerTabs: newTabs,
          activeTabId: newActiveId,
          secondaryTabId: newSecondaryId,
          splitDirection: newSplit
        };
      }),

      setActiveTab: (id) => set({ activeTabId: id }),
      setSecondaryTab: (id) => set({ secondaryTabId: id }),
      setSplit: (direction) => set({ splitDirection: direction }),
      setSplitRatio: (ratio) => set({ splitRatio: ratio }),
      reorderTabs: (tabs) => set({ centerTabs: tabs }),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),
      setQuickOpen: (open) => set({ quickOpenOpen: open }),
      setHomeSidebarCollapsed: (collapsed) => set({ homeSidebarCollapsed: collapsed }),
      toggleHomeSidebar: () => set((state) => ({ homeSidebarCollapsed: !state.homeSidebarCollapsed })),
      setUiMode: (mode) => set({ uiMode: mode }),
      toggleUiMode: () => set((state) => ({ uiMode: state.uiMode === 'focus' ? 'ide' : 'focus' })),
      pushDisclosure: (d) => set({ disclosure: { ...d, id: `disc-${Date.now()}` } }),
      dismissDisclosure: () => set({ disclosure: null }),
      acceptDisclosure: () => {
        const d = get().disclosure;
        if (!d) return;
        if (d.url) {
          window.open(d.url, '_blank', 'noopener');
        } else if (d.tab) {
          // Escalate Focus→IDE so the drilled-into surface is fully navigable.
          set({ uiMode: 'ide' });
          get().openTab(d.tab);
        }
        set({ disclosure: null });
      },
    }),
    {
      name: 'tesseract-layout-storage',
      version: 2,
      migrate: (persisted, version) => {
        // v1: the home sidebar now defaults to expanded. Correct the old collapsed
        // default for users who have the previous persisted value, once.
        if (version < 1 && persisted && typeof persisted === 'object') {
          (persisted as LayoutState).homeSidebarCollapsed = false;
        }
        // v2: uiMode was introduced. New users default to 'focus'; existing users (who have
        // any persisted layout) keep the full IDE they're used to.
        if (version < 2 && persisted && typeof persisted === 'object') {
          (persisted as LayoutState).uiMode = 'ide';
        }
        return persisted as LayoutState;
      },
    }
  )
);
