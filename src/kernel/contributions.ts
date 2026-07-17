// The Torsor frontend "kernel + contributions" registry.
//
// The kernel is small and stable; every UI feature (tabs, commands, panels, rail items,
// settings pages) is a *contribution*. First-party features register through the exact
// same API a third-party plugin would use — that is what keeps the shell genuinely
// modular instead of modular-on-paper.
//
// This is the contract surface. Today the center work area renders tabs from here;
// the other contribution kinds establish the stable API and will be progressively
// wired into the shell (command palette, rail, side panels, settings).
import type { ComponentType } from 'react';

/** An icon component (a lucide icon satisfies this). */
export type IconComponent = ComponentType<{ size?: number; className?: string }>;

/** Well-known tab groups. Every tab-listing surface (rail "More…", tab-strip "+",
 *  ⌘K palette) renders the same grouped registry, so the lists can never drift. */
export type TabGroupId = 'build' | 'agent' | 'project' | 'labs';

export interface TabGroupDef {
  id: TabGroupId | 'other';
  label: string;
  order: number;
}

export const TAB_GROUPS: TabGroupDef[] = [
  { id: 'build', label: 'Build', order: 0 },
  { id: 'agent', label: 'Agent', order: 1 },
  { id: 'project', label: 'Project', order: 2 },
  // Honest prominence: not-yet-wired mockups live together under an explicit label.
  { id: 'labs', label: 'Labs — previews', order: 3 },
];

/** A center-work-area tab. `type` matches the layout store's Tab.type. */
export interface TabContribution {
  type: string;
  label: string;
  component: ComponentType;
  /** Icon shown on the rail, in the tab strip, the "+" menu, and the palette. */
  icon?: IconComponent;
  /** Section this tab lists under everywhere. Unknown/absent → a trailing "Other"
   *  bucket, so a plugin tab can never disappear. */
  group?: TabGroupId | string;
  /** Sort key within the group (lower first; ties by label). */
  order?: number;
  /** Pinned tabs render inline on the rail (convention: real capabilities only). */
  pinned?: boolean;
  /** 'preview' marks a not-yet-wired mockup: the shell auto-applies the honest
   *  banner and Labs prominence. Default 'real'. */
  maturity?: 'real' | 'preview';
  /** Whether tab instances can be closed (default true). */
  closable?: boolean;
  /** Optional id of the plugin that contributed this, for attribution. */
  source?: string;
}

/** A command-palette command. */
export interface CommandContribution {
  id: string;
  title: string;
  run: () => void;
  icon?: IconComponent;
  /** Palette section heading (e.g. "Tools", "View", "Agent"). */
  group?: string;
  /** Display-only shortcut hint, e.g. "⌘⇧M". */
  shortcut?: string;
  /** Extra fuzzy-search terms. */
  keywords?: string;
  source?: string;
}

/** A docked side panel. */
export interface PanelContribution {
  id: string;
  side: 'left' | 'right';
  component: ComponentType;
  source?: string;
}

/** A left-rail item that typically opens a tab. */
export interface RailItemContribution {
  id: string;
  label: string;
  opensTab?: string;
  icon?: IconComponent;
  /** Pinned items show inline on the rail; the rest live behind a "More…" popover. */
  pinned?: boolean;
  component?: ComponentType;
  source?: string;
}

/** A settings page section. */
export interface SettingsContribution {
  id: string;
  title: string;
  component: ComponentType;
  source?: string;
}

/**
 * ContributionRegistry is the in-memory kernel store. It is intentionally simple:
 * register-by-key with last-writer-wins, plus list/get accessors. The API is versioned
 * by its TypeScript shape and treated as a public contract — additive changes only.
 */
class ContributionRegistry {
  private tabsByType = new Map<string, TabContribution>();
  private commandsById = new Map<string, CommandContribution>();
  private panelsById = new Map<string, PanelContribution>();
  private railItemsById = new Map<string, RailItemContribution>();
  private settingsById = new Map<string, SettingsContribution>();

  registerTab(c: TabContribution): this {
    this.tabsByType.set(c.type, c);
    return this;
  }
  getTab(type: string): TabContribution | undefined {
    return this.tabsByType.get(type);
  }
  tabs(): TabContribution[] {
    return [...this.tabsByType.values()];
  }
  /** Tabs bucketed by TAB_GROUPS order; tabs with an unregistered group land in a
   *  trailing synthetic "Other" bucket. Within a group: `order` asc, then label. */
  tabsByGroup(): { group: TabGroupDef; tabs: TabContribution[] }[] {
    const sortTabs = (ts: TabContribution[]) =>
      [...ts].sort(
        (a, b) =>
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
          a.label.localeCompare(b.label)
      );
    const known = new Set(TAB_GROUPS.map((g) => g.id));
    const out: { group: TabGroupDef; tabs: TabContribution[] }[] = [];
    for (const g of [...TAB_GROUPS].sort((a, b) => a.order - b.order)) {
      const tabs = this.tabs().filter((t) => t.group === g.id);
      if (tabs.length) out.push({ group: g, tabs: sortTabs(tabs) });
    }
    const other = this.tabs().filter((t) => !t.group || !known.has(t.group as TabGroupDef['id']));
    if (other.length) out.push({ group: { id: 'other', label: 'Other', order: 99 }, tabs: sortTabs(other) });
    return out;
  }

  registerCommand(c: CommandContribution): this {
    this.commandsById.set(c.id, c);
    return this;
  }
  commands(): CommandContribution[] {
    return [...this.commandsById.values()];
  }

  registerPanel(c: PanelContribution): this {
    this.panelsById.set(c.id, c);
    return this;
  }
  panels(side?: 'left' | 'right'): PanelContribution[] {
    const all = [...this.panelsById.values()];
    return side ? all.filter((p) => p.side === side) : all;
  }

  registerRailItem(c: RailItemContribution): this {
    this.railItemsById.set(c.id, c);
    return this;
  }
  railItems(): RailItemContribution[] {
    return [...this.railItemsById.values()];
  }

  registerSettings(c: SettingsContribution): this {
    this.settingsById.set(c.id, c);
    return this;
  }
  settings(): SettingsContribution[] {
    return [...this.settingsById.values()];
  }
}

/** The process-wide contribution registry. */
export const contributions = new ContributionRegistry();
