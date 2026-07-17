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
  /** Token pack written as inline CSS variables when the theme is applied. OMIT for
   *  CSS-driven built-ins: their values live in src/index.css (the single source of
   *  truth), selected via the `data-theme` attribute — duplicating them here caused
   *  silent drift where stale inline styles overrode the stylesheet. */
  tokens?: ThemeTokens;
  /** Optional id of the plugin that contributed this theme. */
  source?: string;
}

// Built-in themes are CSS-driven: no token literals here. src/index.css `:root` (dark)
// and `[data-theme="light"]` own the values, so a calm-pass edit there is the one edit.
export const darkTheme: Theme = {
  id: 'dark',
  name: 'Dark',
  appearance: 'dark',
};

export const lightTheme: Theme = {
  id: 'light',
  name: 'Light',
  appearance: 'light',
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

/** Apply a theme. Custom packs write their tokens as inline CSS variables; CSS-driven
 *  built-ins (no `tokens`) instead CLEAR any inline overrides so src/index.css rules. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const name of THEME_TOKEN_NAMES) {
    if (theme.tokens) {
      root.style.setProperty(`--${name}`, theme.tokens[name]);
    } else {
      root.style.removeProperty(`--${name}`);
    }
  }
  // data-theme selects the stylesheet-side token set and appearance-keyed selectors.
  root.setAttribute('data-theme', theme.appearance);
}
