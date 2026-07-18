import { create } from 'zustand';
import { toast } from 'sonner';
import { useProjectStore } from './projectStore';
import {
  apiStorageList,
  apiStorageUpload,
  apiStorageDelete,
  apiStorageDownload,
  type ApiStorageFile,
} from '../lib/api';

export type FileType = 'image' | 'video' | 'document' | 'other';

export interface StorageFile {
  id: string; // relative path within the storage root (unique)
  name: string;
  type: FileType;
  size: number;
  uploadedAt: number;
  url: string; // in-app data URL for images (assets are project-private, not a public CDN)
  path: string;
  thumbnailUrl?: string;
}

export interface UploadProgress {
  id: string;
  name: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error';
}

interface StorageState {
  files: StorageFile[];
  currentPath: string;
  viewMode: 'grid' | 'list';
  totalCapacity: number;
  uploads: UploadProgress[];
  isLoading: boolean;

  fetchFiles: () => Promise<void>;
  setPath: (path: string) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  uploadFile: (file: File) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  downloadFile: (id: string) => Promise<void>;
  clearUploads: () => void;
}

const activeProjectId = () => useProjectStore.getState().activeProjectId;

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
};

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const mapFile = (f: ApiStorageFile): StorageFile => ({
  id: f.id,
  name: f.name,
  type: f.type,
  size: f.size,
  uploadedAt: f.uploadedAt,
  path: f.path,
  url: '',
});

export const useStorageStore = create<StorageState>()((set, get) => ({
  files: [],
  currentPath: '/',
  viewMode: 'grid',
  totalCapacity: 100 * 1024 * 1024,
  uploads: [],
  isLoading: false,

  fetchFiles: async () => {
    const projectId = activeProjectId();
    if (!projectId) {
      set({ files: [] });
      return;
    }
    set({ isLoading: true });
    try {
      const items = (await apiStorageList(projectId)).map(mapFile);
      set({ files: items, isLoading: false });

      // Lazily hydrate image previews as data URLs (assets are project-private,
      // so there's no public URL — we fetch bytes through the auth-gated API).
      const images = items.filter((f) => f.type === 'image').slice(0, 24);
      await Promise.all(
        images.map(async (f) => {
          try {
            const data = await apiStorageDownload(projectId, f.id);
            const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
            const mime = IMAGE_MIME[ext] ?? 'application/octet-stream';
            const dataUrl = `data:${mime};base64,${data.contentBase64}`;
            set((state) => ({
              files: state.files.map((x) => (x.id === f.id ? { ...x, url: dataUrl, thumbnailUrl: dataUrl } : x)),
            }));
          } catch {
            /* preview is best-effort */
          }
        }),
      );
    } catch (err) {
      set({ isLoading: false });
      toast.error(err instanceof Error ? err.message : 'Failed to load storage');
    }
  },

  setPath: (path) => set({ currentPath: path }),
  setViewMode: (mode) => set({ viewMode: mode }),

  uploadFile: (file) => {
    const projectId = activeProjectId();
    if (!projectId) {
      toast.error('Open a project first');
      return;
    }
    const id = `upload-${file.name}-${file.size}`;
    set((state) => ({
      uploads: [{ id, name: file.name, progress: 10, status: 'uploading' }, ...state.uploads],
    }));
    void (async () => {
      try {
        const contentBase64 = await fileToBase64(file);
        set((state) => ({
          uploads: state.uploads.map((u) => (u.id === id ? { ...u, progress: 60 } : u)),
        }));
        await apiStorageUpload(projectId, { name: file.name, path: get().currentPath, contentBase64 });
        set((state) => ({
          uploads: state.uploads.map((u) => (u.id === id ? { ...u, progress: 100, status: 'completed' } : u)),
        }));
        await get().fetchFiles();
      } catch (err) {
        set((state) => ({
          uploads: state.uploads.map((u) => (u.id === id ? { ...u, status: 'error' } : u)),
        }));
        toast.error(err instanceof Error ? err.message : `Failed to upload ${file.name}`);
      }
    })();
  },

  deleteFile: (id) => {
    const projectId = activeProjectId();
    if (!projectId) return;
    const prev = get().files;
    set({ files: prev.filter((f) => f.id !== id) });
    void apiStorageDelete(projectId, id).catch((err) => {
      set({ files: prev });
      toast.error(err instanceof Error ? err.message : 'Failed to delete file');
    });
  },

  // No backend rename endpoint — do it honestly with the primitives that exist:
  // download the bytes, re-upload under the new name, then delete the old file.
  renameFile: (id, newName) => {
    const projectId = activeProjectId();
    if (!projectId || !newName.trim()) return;
    const file = get().files.find((f) => f.id === id);
    if (!file) return;
    void (async () => {
      try {
        const data = await apiStorageDownload(projectId, id);
        await apiStorageUpload(projectId, { name: newName, path: file.path, contentBase64: data.contentBase64 });
        await apiStorageDelete(projectId, id);
        await get().fetchFiles();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to rename file');
      }
    })();
  },

  downloadFile: async (id) => {
    const projectId = activeProjectId();
    if (!projectId) return;
    try {
      const data = await apiStorageDownload(projectId, id);
      const bytes = Uint8Array.from(atob(data.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to download file');
    }
  },

  clearUploads: () => set({ uploads: [] }),
}));
