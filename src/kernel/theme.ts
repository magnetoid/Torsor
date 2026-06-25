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
    'bg-page': '#1C1C1E',
    'bg-surface': '#2B2B2E',
    'bg-elevated': '#3A3A3D',
    'bg-inset': '#232326',
    border: '#3E3E42',
    'border-subtle': '#333337',
    'text-primary': '#F0F0F2',
    'text-secondary': '#8E8E93',
    'text-tertiary': '#5A5A5E',
    accent: '#7B6AEE',
    'accent-hover': '#9585F5',
    'accent-muted': 'rgba(123,106,238,0.12)',
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    info: '#5AC8FA',
  },
};

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  appearance: 'light',
  tokens: {
    'bg-page': '#F5F2ED',
    'bg-surface': '#FFFFFF',
    'bg-elevated': '#F0EDE8',
    'bg-inset': '#E8E5DF',
    border: '#E4E0DA',
    'border-subtle': '#ECEAE5',
    'text-primary': '#1C1C1E',
    'text-secondary': '#6E6E73',
    'text-tertiary': '#AEAEB2',
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
