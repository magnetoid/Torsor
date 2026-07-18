import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewportMode = 'desktop' | 'tablet' | 'mobile';
export type ToolType = 'pointer' | 'hand';

export interface CanvasElement {
  id: string;
  type: string;
  content: string;
  classes: string[];
  props: Record<string, any>;
  parentId?: string;
  children?: string[];
}

interface CanvasState {
  selectedElementId: string | null;
  viewportMode: ViewportMode;
  activeTool: ToolType;
  isSyncEnabled: boolean;
  elements: Record<string, CanvasElement>;
  history: any[];
  
  // Actions
  selectElement: (id: string | null) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setActiveTool: (tool: ToolType) => void;
  toggleSync: () => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  addElement: (type: string, parentId?: string) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const MOCK_ELEMENTS: Record<string, CanvasElement> = {
  'root': {
    id: 'root',
    type: 'Container',
    content: '',
    classes: ['p-8', 'bg-[#0a0a0c]', 'min-h-full', 'flex', 'flex-col', 'gap-6'],
    props: {},
    children: ['header', 'hero', 'features']
  },
  'header': {
    id: 'header',
    type: 'Header',
    content: '',
    classes: ['flex', 'items-center', 'justify-between'],
    props: {},
    parentId: 'root',
    children: ['logo', 'nav']
  },
  'logo': {
    id: 'logo',
    type: 'Text',
    content: 'TESSERACT',
    classes: ['text-xl', 'font-black', 'tracking-tighter', 'text-accent'],
    props: {},
    parentId: 'header'
  },
  'nav': {
    id: 'nav',
    type: 'Nav',
    content: '',
    classes: ['flex', 'gap-4'],
    props: {},
    parentId: 'header',
    children: ['nav-item-1', 'nav-item-2']
  },
  'nav-item-1': {
    id: 'nav-item-1',
    type: 'Link',
    content: 'Features',
    classes: ['text-sm', 'text-[#6b6b7a]', 'hover:text-[#e8e8ed]'],
    props: {},
    parentId: 'nav'
  },
  'nav-item-2': {
    id: 'nav-item-2',
    type: 'Link',
    content: 'Pricing',
    classes: ['text-sm', 'text-[#6b6b7a]', 'hover:text-[#e8e8ed]'],
    props: {},
    parentId: 'nav'
  },
  'hero': {
    id: 'hero',
    type: 'Section',
    content: '',
    classes: ['py-12', 'text-center', 'space-y-4'],
    props: {},
    parentId: 'root',
    children: ['hero-title', 'hero-desc', 'hero-cta']
  },
  'hero-title': {
    id: 'hero-title',
    type: 'Heading',
    content: 'Build faster than ever.',
    classes: ['text-5xl', 'font-bold', 'text-[#e8e8ed]', 'tracking-tight'],
    props: { level: 1 },
    parentId: 'hero'
  },
  'hero-desc': {
    id: 'hero-desc',
    type: 'Text',
    content: 'The first AI-native IDE that actually writes code with you.',
    classes: ['text-lg', 'text-[#6b6b7a]', 'max-w-2xl', 'mx-auto'],
    props: {},
    parentId: 'hero'
  },
  'hero-cta': {
    id: 'hero-cta',
    type: 'Button',
    content: 'Get Started Free',
    classes: ['px-6', 'py-3', 'bg-violet-600', 'hover:bg-violet-500', 'text-white', 'rounded-xl', 'font-bold', 'transition-all'],
    props: { variant: 'primary', size: 'lg' },
    parentId: 'hero'
  },
  'features': {
    id: 'features',
    type: 'Grid',
    content: '',
    classes: ['grid', 'grid-cols-3', 'gap-6'],
    props: {},
    parentId: 'root',
    children: ['feat-1', 'feat-2', 'feat-3']
  },
  'feat-1': {
    id: 'feat-1',
    type: 'Card',
    content: 'AI Agent',
    classes: ['p-6', 'bg-[#141416]', 'border', 'border-[#232328]', 'rounded-xl'],
    props: {},
    parentId: 'features'
  },
  'feat-2': {
    id: 'feat-2',
    type: 'Card',
    content: 'Real-time Sync',
    classes: ['p-6', 'bg-[#141416]', 'border', 'border-[#232328]', 'rounded-xl'],
    props: {},
    parentId: 'features'
  },
  'feat-3': {
    id: 'feat-3',
    type: 'Card',
    content: 'Cloud Deploy',
    classes: ['p-6', 'bg-[#141416]', 'border', 'border-[#232328]', 'rounded-xl'],
    props: {},
    parentId: 'features'
  }
};

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set) => ({
      selectedElementId: null,
      viewportMode: 'desktop',
      activeTool: 'pointer',
      isSyncEnabled: true,
      elements: MOCK_ELEMENTS,
      history: [],

      selectElement: (id) => set({ selectedElementId: id }),
      
      setViewportMode: (mode) => set({ viewportMode: mode }),
      
      setActiveTool: (tool) => set({ activeTool: tool }),
      
      toggleSync: () => set((state) => ({ isSyncEnabled: !state.isSyncEnabled })),
      
      updateElement: (id, updates) => set((state) => ({
        elements: {
          ...state.elements,
          [id]: { ...state.elements[id], ...updates }
        }
      })),

      addElement: (type, parentId = 'root') => set((state) => {
        const id = `el-${Date.now()}`;
        const newElement: CanvasElement = {
          id,
          type,
          content: `New ${type}`,
          classes: ['p-4', 'bg-[#141416]', 'border', 'border-[#232328]', 'rounded-xl'],
          props: {},
          parentId
        };

        const parent = state.elements[parentId];
        const updatedParent = {
          ...parent,
          children: [...(parent.children || []), id]
        };

        return {
          elements: {
            ...state.elements,
            [parentId]: updatedParent,
            [id]: newElement
          },
          selectedElementId: id
        };
      }),

      undo: () => {},
      redo: () => {},
      reset: () => set({
        selectedElementId: null,
        viewportMode: 'desktop',
        activeTool: 'pointer',
        elements: MOCK_ELEMENTS,
        history: [],
      }),
    }),
    {
      name: 'torsor-canvas-storage',
    }
  )
);
