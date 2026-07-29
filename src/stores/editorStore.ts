import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migratePersistKey } from '../lib/utils';

// Legacy persist key rename (pre-rebrand residue): tesseract-* -> torsor-*.
migratePersistKey('tesseract-editor-storage', 'torsor-editor-storage');

export interface SearchResult {
  id: string;
  fileId: string;
  filePath: string;
  line: number;
  text: string;
}

interface EditorState {
  openFileIds: string[];
  activeFileId: string | null;
  searchResults: SearchResult[];
  searchQuery: string;
  isCodeOpen: boolean;
  isSidebarOpen: boolean;
  unsavedChanges: string[]; // Array of file IDs with unsaved changes
  
  // Actions
  openFile: (id: string) => void;
  closeFile: (id: string) => void;
  setActiveFile: (id: string) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setSearchQuery: (query: string) => void;
  toggleCode: (force?: boolean) => void;
  toggleSidebar: (force?: boolean) => void;
  setUnsaved: (id: string, unsaved: boolean) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      openFileIds: [],
      activeFileId: null,
      searchResults: [],
      searchQuery: '',
      isCodeOpen: true,
      isSidebarOpen: true,
      unsavedChanges: [],

      reset: () => set({
        openFileIds: [],
        activeFileId: null,
        searchResults: [],
        searchQuery: '',
        unsavedChanges: [],
      }),

      openFile: (id) => {
        const { openFileIds } = get();
        if (!openFileIds.includes(id)) {
          set({ openFileIds: [...openFileIds, id] });
        }
        set({ activeFileId: id });
      },

      closeFile: (id) => set((state) => {
        const newFileIds = state.openFileIds.filter(fid => fid !== id);
        let newActiveId = state.activeFileId;
        
        if (state.activeFileId === id) {
          newActiveId = newFileIds.length > 0 ? newFileIds[newFileIds.length - 1] : null;
        }

        return {
          openFileIds: newFileIds,
          activeFileId: newActiveId
        };
      }),

      setActiveFile: (id) => set({ activeFileId: id }),

      setSearchResults: (results) => set({ searchResults: results }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      toggleCode: (force) => set((state) => ({ isCodeOpen: typeof force === 'boolean' ? force : !state.isCodeOpen })),
      toggleSidebar: (force) => set((state) => ({ isSidebarOpen: typeof force === 'boolean' ? force : !state.isSidebarOpen })),
      setUnsaved: (id, unsaved) => set((state) => ({
        unsavedChanges: unsaved 
          ? [...new Set([...state.unsavedChanges, id])]
          : state.unsavedChanges.filter(fid => fid !== id)
      })),
    }),
    {
      name: 'torsor-editor-storage',
    }
  )
);
