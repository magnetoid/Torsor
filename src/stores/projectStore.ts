import { create } from 'zustand';

import { apiRequest } from '../lib/api';

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  lastEdited: string;
  lastModified?: string;
  thumbnail?: string;
  type: 'website' | 'mobile' | 'design' | 'dashboard' | 'api' | 'game' | 'ai' | 'extension';
  isPublished?: boolean;
  isArchived?: boolean;
  teamAvatars?: string[];
  teamMembers?: { name: string; avatar: string }[];
  techStack?: string[];
  mode?: 'builder' | 'ide';
  template?: string;
  vibe?: string;
}

export interface ProjectFile {
  id: string;
  projectId: string;
  filename: string;
  language: string | null;
  content: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectState {
  projects: Project[];
  filesByProject: Record<string, ProjectFile[]>;
  currentProject: Project | null;
  /** The project whose IDE is currently open; drives whether chat runs the agent. Set by
   *  ProjectWorkspace on mount, cleared on unmount so plain chat elsewhere isn't agentic. */
  activeProjectId: string | null;
  setActiveProject: (id: string | null) => void;
  /** Starred project ids — a local pin list (client-side until a backend flag lands). */
  starredIds: string[];
  toggleStar: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  addProject: (project: Project) => void;
  createProject: (projectData: Partial<Project>, workspaceId: string) => Promise<string>;
  deleteProject: (id: string) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  duplicateProject: (id: string) => Promise<void>;
  archiveProject: (id: string) => Promise<void>;
  fetchProject: (id: string) => Promise<Project | null>;
  fetchProjectFiles: (projectId: string) => Promise<ProjectFile[]>;
  saveProjectFile: (projectId: string, payload: Pick<ProjectFile, 'filename' | 'language' | 'content'>) => Promise<ProjectFile>;
  renameProjectFile: (projectId: string, fileId: string, filename: string, language?: string | null) => Promise<ProjectFile>;
  deleteProjectFile: (projectId: string, fileId: string) => Promise<void>;
  getProjectsByWorkspace: (workspaceId: string) => Project[];
  clearWorkspaceProjects: (_workspaceId: string) => void;
}

const fromApiProject = (project: any): Project => ({
  id: project.id,
  workspaceId: 'server-default',
  name: project.name,
  description: project.description || '',
  lastEdited: new Date(project.updatedAt || project.updated_at || project.createdAt || project.created_at).toLocaleDateString(),
  lastModified: project.updatedAt || project.updated_at,
  type: 'website',
  vibe: project.vibe,
  isPublished: Boolean(project.isPublic || project.is_public),
  isArchived: false,
  teamAvatars: [],
  teamMembers: [],
  techStack: [],
  mode: 'builder',
});

const fromApiFile = (file: any): ProjectFile => ({
  id: file.id,
  projectId: file.projectId || file.project_id,
  filename: file.filename,
  language: file.language,
  content: file.content || '',
  version: file.version,
  createdAt: file.createdAt || file.created_at,
  updatedAt: file.updatedAt || file.updated_at,
});

// Local star list (pin-style). Kept in plain localStorage — the rest of this store is
// server-backed, so wrapping the whole thing in `persist` for one field would be noise.
const STARRED_KEY = 'torsor-starred-projects';
const readStarred = (): string[] => {
  try {
    const raw = localStorage.getItem(STARRED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

export const useProjectStore = create<ProjectState>()((set, get) => ({
  projects: [],
  filesByProject: {},
  currentProject: null,
  activeProjectId: null,
  setActiveProject: (id) => set({ activeProjectId: id }),
  starredIds: readStarred(),
  toggleStar: (id) => {
    const next = get().starredIds.includes(id)
      ? get().starredIds.filter((s) => s !== id)
      : [...get().starredIds, id];
    try {
      localStorage.setItem(STARRED_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable (private mode) — stars still work for the session.
    }
    set({ starredIds: next });
  },
  isLoading: false,
  error: null,
  fetchProjects: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiRequest<{ items: any[] }>('/api/v1/projects', { auth: true });
      set({ projects: response.items.map(fromApiProject), isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to load projects' });
      throw error;
    }
  },
  addProject: (project) => set((state) => ({ projects: [project, ...state.projects] })),
  createProject: async (projectData, workspaceId) => {
    set({ isLoading: true, error: null });
    try {
      const created = await apiRequest<any>('/api/v1/projects', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          name: projectData.name || 'Untitled Project',
          description: projectData.description || '',
          vibe: projectData.vibe || projectData.type || 'builder',
          isPublic: Boolean(projectData.isPublished),
        }),
      });
      const project = { ...fromApiProject(created), workspaceId };
      set((state) => ({ projects: [project, ...state.projects], isLoading: false, currentProject: project }));
      return project.id;
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to create project' });
      throw error;
    }
  },
  deleteProject: async (id) => {
    await apiRequest(`/api/v1/projects/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({ projects: state.projects.filter((p) => p.id !== id) }));
  },
  updateProject: async (id, updates) => {
    const updated = await apiRequest<any>(`/api/v1/projects/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(updates),
    });
    const normalized = fromApiProject(updated);
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, ...normalized } : p)),
      currentProject: state.currentProject?.id === id ? { ...state.currentProject, ...normalized } : state.currentProject,
    }));
  },
  duplicateProject: async (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (!project) return;
    await get().createProject({
      name: `${project.name} (Copy)`,
      description: project.description,
      type: project.type,
      vibe: project.vibe,
    }, project.workspaceId);
  },
  archiveProject: async (id) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, isArchived: true } : p)),
    }));
  },
  fetchProject: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const project = await apiRequest<any>(`/api/v1/projects/${id}`, { auth: true });
      const normalized = fromApiProject(project);
      set((state) => ({
        currentProject: normalized,
        projects: state.projects.some((p) => p.id === id)
          ? state.projects.map((p) => (p.id === id ? normalized : p))
          : [normalized, ...state.projects],
        isLoading: false,
      }));
      return normalized;
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to load project' });
      return null;
    }
  },
  fetchProjectFiles: async (projectId) => {
    const response = await apiRequest<{ items: any[] }>(`/api/v1/projects/${projectId}/files`, { auth: true });
    const files = response.items.map(fromApiFile);
    set((state) => ({ filesByProject: { ...state.filesByProject, [projectId]: files } }));
    return files;
  },
  saveProjectFile: async (projectId, payload) => {
    const file = await apiRequest<any>(`/api/v1/projects/${projectId}/files`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(payload),
    });
    const normalized = fromApiFile(file);
    set((state) => ({
      filesByProject: {
        ...state.filesByProject,
        [projectId]: [
          normalized,
          ...(state.filesByProject[projectId] || []).filter((existing) => existing.filename !== normalized.filename),
        ],
      },
    }));
    return normalized;
  },
  renameProjectFile: async (projectId, fileId, filename, language) => {
    const updated = await apiRequest<any>(`/api/v1/projects/${projectId}/files/${fileId}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ filename, ...(language !== undefined ? { language } : {}) }),
    });
    const normalized = fromApiFile(updated);
    set((state) => ({
      filesByProject: {
        ...state.filesByProject,
        [projectId]: (state.filesByProject[projectId] || []).map((existing) =>
          existing.id === fileId ? normalized : existing,
        ),
      },
    }));
    return normalized;
  },
  deleteProjectFile: async (projectId, fileId) => {
    await apiRequest(`/api/v1/projects/${projectId}/files/${fileId}`, { method: 'DELETE', auth: true });
    set((state) => ({
      filesByProject: {
        ...state.filesByProject,
        [projectId]: (state.filesByProject[projectId] || []).filter((existing) => existing.id !== fileId),
      },
    }));
  },
  getProjectsByWorkspace: (_workspaceId) => {
    return get().projects.filter((p) => !p.isArchived);
  },
  clearWorkspaceProjects: (_workspaceId) => {
    set({ projects: [] });
  },
}));

export const useActiveProjects = () => {
  const projects = useProjectStore((state) => state.projects);
  return projects.filter((p) => !p.isArchived);
};
