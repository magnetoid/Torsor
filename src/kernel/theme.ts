// Theme-token contract: a theme (or "skin") is a typed pack of design tokens that maps
// directly onto the CSS custom properties the UI already consumes (see src/index.css).
// Themes are registered and applied at runtime, so white-labeling / skinning is a
// drop-in contribution — no component changes required.

/** The complete set of design tokens. Each maps to a `--<name>` CSS variable. */
export const THEME_TOKEN_NAMES = [
  'bg-page',
  'bg-surface',
  'bg-elevated',
  'bg-inset',
  'border',
  'border-subtle',
  'text-primary',
  'text-secondary',
  'text-tertiary',
  'accent',
  'accent-hover',
  'accent-muted',
  'success',
  'warning',
  'error',
  'info',
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];
export type ThemeTokens = Record<ThemeTokenName, string>;
export type ThemeAppearance = 'dark' | 'light';

export interface Theme {
  id: string;
  name: string;
  appearance: ThemeAppearance;
  tokens: ThemeTokens;
  /** Optional id of the plugin that contributed this theme. */
  source?: string;
}

// Built-in themes. `dark` and `light` mirror the values in src/index.css exactly, so
// routing the live theme through this registry is behavior-preserving.
export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  appearance: 'dark',
  tokens: {
    'bg-page': '#202023',
    'bg-surface': '#303034',
    'bg-elevated': '#3E3E43',
    'bg-inset': '#27272B',
    border: '#48484E',
    'border-subtle': '#3B3B41',
    'text-primary': '#F6F6F8',
    'text-secondary': '#A1A1A8',
    'text-tertiary': '#6D6D74',
    accent: '#8577F2',
    'accent-hover': '#9C8EF7',
    'accent-muted': 'rgba(133,119,242,0.14)',
    success: '#3DD263',
    warning: '#FFA71F',
    error: '#FF5449',
    info: '#64CDFB',
  },
};

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  appearance: 'light',
  tokens: {
    'bg-page': '#F8F8FA',
    'bg-surface': '#FFFFFF',
    'bg-elevated': '#F1F1F5',
    'bg-inset': '#EAEAEF',
    border: '#E2E2E8',
    'border-subtle': '#ECECF1',
    'text-primary': '#18181B',
    'text-secondary': '#62626B',
    'text-tertiary': '#A0A0AA',
    accent: '#6B5CE7',
    'accent-hover': '#5A4BD6',
    'accent-muted': 'rgba(107,92,231,0.08)',
    success: '#30B850',
    warning: '#E8920A',
    error: '#E8372E',
    info: '#3AA8E0',
  },
};

// A demonstration third-party-style skin proving runtime theme swap / extensibility.
export const midnightTheme: Theme = {
  id: 'midnight',
  name: 'Midnight (teal)',
  appearance: 'dark',
  tokens: {
    'bg-page': '#0F1115',
    'bg-surface': '#161A20',
    'bg-elevated': '#1E232B',
    'bg-inset': '#12151A',
    border: '#262C36',
    'border-subtle': '#1E232B',
    'text-primary': '#E6EDF3',
    'text-secondary': '#8B98A5',
    'text-tertiary': '#56606B',
    accent: '#2DD4BF',
    'accent-hover': '#5EEAD4',
    'accent-muted': 'rgba(45,212,191,0.12)',
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    info: '#38BDF8',
  },
};

class ThemeRegistry {
  private byId = new Map<string, Theme>();

  register(theme: Theme): this {
    this.byId.set(theme.id, theme);
    return this;
  }
  get(id: string): Theme | undefined {
    return this.byId.get(id);
  }
  all(): Theme[] {
    return [...this.byId.values()];
  }
  /** First registered theme matching an appearance; used as the default per mode. */
  forAppearance(appearance: ThemeAppearance): Theme | undefined {
    return this.all().find((t) => t.appearance === appearance);
  }
}

export const themes = new ThemeRegistry();
themes.register(darkTheme).register(lightTheme).register(midnightTheme);

/** Apply a theme by writing its tokens to the document root as CSS variables. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const name of THEME_TOKEN_NAMES) {
    root.style.setProperty(`--${name}`, theme.tokens[name]);
  }
  // Keep data-theme in sync so appearance-keyed CSS selectors still work.
  root.setAttribute('data-theme', theme.appearance);
}
