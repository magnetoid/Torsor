import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migratePersistKey } from '../lib/utils';

// Legacy persist key rename (pre-rebrand residue): tesseract-* -> torsor-*.
migratePersistKey('tesseract-config-storage', 'torsor-config-storage');

export interface Secret {
  key: string;
  value: string;
}

export interface Package {
  name: string;
  version: string;
  size: string;
}

export interface ProjectConfig {
  framework: string;
  nodeVersion: '18' | '20' | '22';
  packageManager: 'npm' | 'pnpm' | 'yarn';
  buildCommand: string;
  devCommand: string;
  outputDir: string;
}

export interface ConfigState {
  secrets: Secret[];
  packages: Package[];
  config: ProjectConfig;
  
  // Actions
  addSecret: (key: string, value: string) => void;
  removeSecret: (key: string) => void;
  updateSecret: (key: string, value: string) => void;
  
  addPackage: (pkg: Package) => void;
  removePackage: (name: string) => void;
  
  updateConfig: (config: Partial<ProjectConfig>) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      secrets: [
        { key: 'DATABASE_URL', value: 'postgresql://user:pass@localhost:5432/db' },
      ],
      packages: [
        { name: 'react', version: '^18.2.0', size: '2.5kb' },
        { name: 'lucide-react', version: '^0.284.0', size: '1.2kb' },
        { name: 'zustand', version: '^4.4.1', size: '0.8kb' },
      ],
      config: {
        framework: 'React (Vite)',
        nodeVersion: '20',
        packageManager: 'npm',
        buildCommand: 'npm run build',
        devCommand: 'npm run dev',
        outputDir: 'dist',
      },

      addSecret: (key, value) => set((state) => ({
        secrets: [...state.secrets.filter(s => s.key !== key), { key, value }]
      })),
      removeSecret: (key) => set((state) => ({
        secrets: state.secrets.filter(s => s.key !== key)
      })),
      updateSecret: (key, value) => set((state) => ({
        secrets: state.secrets.map(s => s.key === key ? { ...s, value } : s)
      })),

      addPackage: (pkg) => set((state) => ({
        packages: [...state.packages.filter(p => p.name !== pkg.name), pkg]
      })),
      removePackage: (name) => set((state) => ({
        packages: state.packages.filter(p => p.name !== name)
      })),

      updateConfig: (newConfig) => set((state) => ({
        config: { ...state.config, ...newConfig }
      })),
    }),
    {
      name: 'torsor-config-storage',
    }
  )
);
