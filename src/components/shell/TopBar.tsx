import React, { useState } from 'react';
import * as Separator from '@radix-ui/react-separator';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Play, Loader2, Search, FolderTree } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../stores/layoutStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAppStore } from '../../useAppStore';
import { WorkspaceSwitcher } from '../shared/WorkspaceSwitcher';
import { Segmented } from '../shared/ui';
import { PresenceAvatars } from '../shared/PresenceAvatars';
import { AccountMenu } from '../shared/AccountMenu';
import { TabBar } from './TabBar';

export function TopBar() {
  const { toggleLeftPanel, uiMode, setUiMode, openTab, setCommandPalette, fileManagerOpen, toggleFileManager } = useLayoutStore();
  const focus = uiMode === 'focus';

  // Real run flow: provision → start → poll preview readiness (useAppStore.triggerBuild).
  // The Preview tab's BootSteps checklist is the feedback surface, so Run opens it.
  const { buildStatus, triggerBuild } = useAppStore();
  const building = buildStatus === 'building';
  const handleRun = () => {
    openTab('preview');
    if (!building) triggerBuild();
  };

  // Real project name (the bar used to show a hardcoded placeholder). Double-click to
  // rename; persists via PATCH /projects/{id}.
  const { projects, activeProjectId, updateProject } = useProjectStore();
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const [draftName, setDraftName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const startEditing = () => {
    if (!activeProject) return;
    setDraftName(activeProject.name);
    setIsEditing(true);
  };

  const handleProjectNameBlur = () => {
    setIsEditing(false);
    const name = draftName.trim();
    if (activeProject && name && name !== activeProject.name) {
      void updateProject(activeProject.id, { name });
    }
  };

  return (
    <header className="h-10 bg-surface border-b border-default flex items-center px-2 gap-2 shrink-0 z-50">
      {/* LEFT SECTION */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Single identity block: the workspace switcher doubles as the app mark (its
           dropdown includes Home) — a separate logo square next to it read as two icons. */}
        <WorkspaceSwitcher collapsed={true} />

        <Separator.Root className="w-[1px] h-4 bg-default mx-1" />

        {activeProject && (
          <div className="flex items-center gap-1 min-w-0 max-w-[220px]">
            {isEditing ? (
              <input
                autoFocus
                className="bg-elevated border border-accent/50 rounded px-1 text-sm font-medium text-primary outline-none w-full"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleProjectNameBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleProjectNameBlur()}
              />
            ) : (
              <span
                className="text-sm font-medium text-primary cursor-text px-1 hover:bg-elevated rounded transition-colors truncate"
                title={activeProject.name}
                onDoubleClick={startEditing}
              >
                {activeProject.name}
              </span>
            )}
          </div>
        )}

        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={handleRun}
                disabled={building}
                aria-label={building ? 'Starting the dev server' : 'Run project'}
                className="w-6 h-6 rounded-md bg-success/10 text-success flex items-center justify-center hover:bg-success/20 transition-all disabled:opacity-60"
              >
                {building ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} fill="currentColor" />}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl" sideOffset={5}>
                {building ? 'Starting… (see Preview)' : 'Run project'}
                <Tooltip.Arrow className="fill-default" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        <button
          onClick={toggleLeftPanel}
          className="flex items-center gap-1.5 px-2 py-0.5 bg-elevated hover:bg-surface rounded-full border border-default transition-all group"
          title="Toggle the agent chat"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-accent" />
          <span className="text-[10px] font-bold text-primary">Agent</span>
        </button>
      </div>

      {/* CENTER: the tab strip — IDE-only chrome; hidden in the calm Focus surface. */}
      {!focus && (
        <>
          <Separator.Root className="w-[1px] h-4 bg-default" />
          <TabBar />
        </>
      )}
      {focus && <div className="flex-1" />}

      {/* RIGHT SECTION */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Live collaborators — a calm dot in Focus, stacked avatars in IDE. */}
        <PresenceAvatars focus={focus} />

        {/* Advanced controls — hidden in Focus; the ⌘K palette still reaches them.
            (The old model-tier Segmented was a local-state placebo — the real model
            choice is the provider dropdown in the chat composer.) */}
        {!focus && (
          <>
            <button
              onClick={() => openTab('publishing')}
              className="bg-accent-gradient hover:opacity-90 text-white px-3 py-1 rounded-md text-xs font-bold transition-all shadow-lg shadow-accent/20"
            >
              Publish
            </button>

            <button
              onClick={() => setCommandPalette(true)}
              aria-label="Search (⌘K)"
              className="p-1.5 text-secondary hover:text-primary transition-colors"
            >
              <Search size={16} />
            </button>
          </>
        )}

        {/* Focus / IDE toggle — the always-available bridge (also ⌘⇧M). */}
        <Segmented
          size="sm"
          aria-label="Interface mode"
          value={uiMode}
          onChange={setUiMode}
          options={[
            { value: 'focus', label: 'Focus' },
            { value: 'ide', label: 'IDE' },
          ]}
        />

        {/* Project files — toggles the left file-manager panel; sits right beside the
            account menu so it's reachable from both Focus and IDE modes. */}
        <button
          onClick={toggleFileManager}
          aria-label={fileManagerOpen ? 'Close project files' : 'Open project files'}
          title="Project files"
          className={cn(
            'p-1.5 rounded-md transition-colors',
            fileManagerOpen ? 'text-accent bg-accent-muted' : 'text-secondary hover:text-primary'
          )}
        >
          <FolderTree size={15} />
        </button>

        <AccountMenu size="sm" />
      </div>
    </header>
  );
}
