import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { applyTheme, themes, type ThemeAppearance } from '../kernel/theme';

// `Theme` is kept as the appearance type for backward compatibility with existing
// consumers (Rail, SettingsTab, useTheme, App). The live theme is now driven by the
// kernel theme registry, so registered skins can be applied at runtime via setThemeById.
export type Theme = ThemeAppearance;

interface ThemeState {
  /** Current appearance ('dark' | 'light'), kept for backward compatibility. */
  theme: Theme;
  /** Current registered theme id (e.g. 'dark', 'light', 'midnight'). */
  themeId: string;
  /** Set by appearance; uses the default registered theme for that appearance. */
  setTheme: (theme: Theme) => void;
  /** Set by registered theme id — this is how skins are applied. */
  setThemeById: (id: string) => void;
  toggleTheme: () => void;
  /** All registered themes, for building a theme/skin picker. */
  availableThemes: () => { id: string; name: string; appearance: ThemeAppearance }[];
}

function applyById(id: string): { theme: Theme; themeId: string } {
  const resolved = themes.get(id) ?? themes.forAppearance('dark')!;
  applyTheme(resolved);
  return { theme: resolved.appearance, themeId: resolved.id };
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      themeId: 'dark',
      setTheme: (theme) => {
        const id = themes.forAppearance(theme)?.id ?? theme;
        set(applyById(id));
      },
      setThemeById: (id) => set(applyById(id)),
      toggleTheme: () => {
        const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
        const id = themes.forAppearance(next)?.id ?? next;
        set(applyById(id));
      },
      availableThemes: () =>
        themes.all().map((t) => ({ id: t.id, name: t.name, appearance: t.appearance })),
    }),
    {
      name: 'torsor-theme',
      partialize: (state) => ({ theme: state.theme, themeId: state.themeId }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(themes.get(state.themeId) ?? themes.forAppearance(state.theme) ?? themes.get('dark')!);
        }
      },
    }
  )
);
