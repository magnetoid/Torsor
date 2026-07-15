import React, { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { useProjectStore } from '../stores/projectStore';

export function ProjectWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { projects, fetchProject, fetchProjectFiles, isLoading, filesByProject, setActiveProject } = useProjectStore();

  const project = useMemo(() => projects.find((p) => p.id === id), [projects, id]);

  useEffect(() => {
    if (!id) return;
    void fetchProject(id);
    void fetchProjectFiles(id);
    // Mark this project active so the chat runs the coding agent against it; clear on
    // leave so chat elsewhere stays plain completion.
    setActiveProject(id);
    return () => setActiveProject(null);
  }, [id, fetchProject, fetchProjectFiles, setActiveProject]);

  if (isLoading && !project) {
    return <div className="flex items-center justify-center h-screen bg-page text-secondary">Loading project…</div>;
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-page text-primary">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Project not found</h1>
          <p className="text-secondary mt-2">The project you're looking for doesn't exist or has been deleted.</p>
        </div>
      </div>
    );
  }

  const files = filesByProject[id || ''] || [];

  return (
    <div className="h-screen flex flex-col bg-page">
      <div className="px-4 py-2 border-b border-default bg-surface text-xs text-secondary flex items-center justify-between">
        <span>{project.name}</span>
        <span>{files.length} file{files.length === 1 ? '' : 's'} loaded from API</span>
      </div>
      <AppShell />
    </div>
  );
}
