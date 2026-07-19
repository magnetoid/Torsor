import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { contributions } from '../kernel/contributions';

export type TabType = 'preview' | 'code' | 'terminal' | 'database' | 'security' | 'integrations' | 'skills' | 'settings' | 'secrets' | 'storage' | 'auth' | 'publishing' | 'validation' | 'git' | 'workflow' | 'canvas' | 'testing' | 'checkpoints' | 'runs' | 'usage' | 'mcp' | 'memory' | 'learning';

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
  kind: 'files-changed' | 'run-failed' | 'preview-ready' | 'run-delegated';
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
  /** The left "Files" panel (project file manager), toggled from the TopBar button next to
   *  the account menu. Independent of the right panel's files view. */
  fileManagerOpen: boolean;
  /** Widths (px) of the resizable shell panels — dragged via PanelResizer, persisted. */
  panelWidths: { fileManager: number; left: number; right: number };
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
  toggleFileManager: () => void;
  /** Set a panel's width (px); clamped to sane bounds so a drag can't lose a panel. */
  setPanelWidth: (panel: 'fileManager' | 'left' | 'right', width: number) => void;
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

// Tab metadata (label / icon / closable / group) lives on the kernel contribution
// registry — the single source of truth all shell surfaces render from.

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      uiMode: 'focus',
      disclosure: null,
      leftPanelOpen: true,
      rightPanelOpen: true,
      rightPanelView: 'files',
      fileManagerOpen: false,
      panelWidths: { fileManager: 240, left: 380, right: 260 },
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
      toggleFileManager: () => set((state) => ({ fileManagerOpen: !state.fileManagerOpen })),
      setPanelWidth: (panel, width) =>
        set((state) => ({
          panelWidths: { ...state.panelWidths, [panel]: Math.min(560, Math.max(180, Math.round(width))) },
        })),
      setRightPanelView: (view) => set({ rightPanelView: view, rightPanelOpen: true }),
      
      openTab: (type) => {
        const { centerTabs } = get();
        const existingTab = centerTabs.find(t => t.type === type);

        if (existingTab) {
          set({ activeTabId: existingTab.id });
          return;
        }

        // Metadata comes from the kernel registry; unknown types (e.g. a stale persisted
        // tab from an uninstalled plugin) degrade to a plain closable tab, never a crash.
        const contrib = contributions.getTab(type);
        const newTab: Tab = {
          id: `tab-${type}-${Date.now()}`,
          type,
          label: contrib?.label ?? type,
          closable: contrib?.closable ?? true
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
