import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: 'editor' | 'viewer';
  isOnline: boolean;
  currentFile?: string;
}

export interface Template {
  id: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  stars: number;
  price: number; // 0 for free
}

export interface SocialState {
  shareLink: string;
  accessLevel: 'public-view' | 'public-edit' | 'private';
  allowForking: boolean;
  collaborators: Collaborator[];
  templates: Template[];
  
  // Actions
  setAccessLevel: (level: SocialState['accessLevel']) => void;
  setAllowForking: (allow: boolean) => void;
  invitePerson: (email: string) => void;
  removeCollaborator: (id: string) => void;
  publishTemplate: (template: Omit<Template, 'id' | 'stars'>) => void;
  forkProject: (projectId: string) => void;
}

const MOCK_TEMPLATES: Template[] = [
  { id: 't1', name: 'SaaS Landing Page', author: 'alex_dev', description: 'High-conversion landing page with Framer Motion.', category: 'Landing Page', tags: ['React', 'Tailwind'], stars: 124, price: 0 },
  { id: 't2', name: 'AI Chat Dashboard', author: 'tesseract_team', description: 'Complete AI chat interface with history and settings.', category: 'AI', tags: ['OpenAI', 'Zustand'], stars: 856, price: 0 },
  { id: 't3', name: 'E-commerce Starter', author: 'shop_pro', description: 'Full-stack store with Stripe integration.', category: 'Full-Stack', tags: ['Prisma', 'Stripe'], stars: 432, price: 15 },
  { id: 't4', name: 'Developer Portfolio', author: 'design_guru', description: 'Minimalist portfolio with dark mode and blog.', category: 'Tool', tags: ['Vite', 'MDX'], stars: 215, price: 0 },
  { id: 't5', name: 'Real-time Whiteboard', author: 'canvas_king', description: 'Collaborative drawing tool using Konva.', category: 'Tool', tags: ['WebSockets', 'Konva'], stars: 189, price: 0 },
  { id: 't6', name: 'Retro Platformer', author: 'game_dev', description: '2D platformer engine with physics.', category: 'Game', tags: ['Canvas', 'Physics'], stars: 98, price: 5 },
];

const MOCK_COLLABORATORS: Collaborator[] = [
  { id: 'u1', name: 'Sarah Chen', email: 'sarah@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', role: 'editor', isOnline: true, currentFile: 'App.tsx' },
  { id: 'u2', name: 'James Wilson', email: 'james@example.com', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James', role: 'viewer', isOnline: true, currentFile: 'useAppStore.ts' },
];

export const useSocialStore = create<SocialState>()(
  persist(
    (set) => ({
      shareLink: 'https://tesseract.app/p/abc123',
      accessLevel: 'private',
      allowForking: true,
      collaborators: MOCK_COLLABORATORS,
      templates: MOCK_TEMPLATES,

      setAccessLevel: (accessLevel) => set({ accessLevel }),
      setAllowForking: (allowForking) => set({ allowForking }),
      invitePerson: (email) => set((state) => ({
        collaborators: [
          ...state.collaborators,
          {
            id: Math.random().toString(36).substring(7),
            name: email.split('@')[0],
            email,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
            role: 'viewer',
            isOnline: false
          }
        ]
      })),
      removeCollaborator: (id) => set((state) => ({
        collaborators: state.collaborators.filter(c => c.id !== id)
      })),
      publishTemplate: (template) => set((state) => ({
        templates: [
          { ...template, id: Math.random().toString(36).substring(7), stars: 0 },
          ...state.templates
        ]
      })),
      forkProject: (_projectId) => {
        // Not wired yet — forking a public project needs a backend clone endpoint.
      },
    }),
    {
      name: 'tesseract-social-storage',
    }
  )
);
