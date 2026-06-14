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

/** A center-work-area tab. `type` matches the layout store's Tab.type. */
export interface TabContribution {
  type: string;
  label: string;
  component: ComponentType;
  /** Optional id of the plugin that contributed this, for attribution. */
  source?: string;
}

/** A command-palette command. */
export interface CommandContribution {
  id: string;
  title: string;
  run: () => void;
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
