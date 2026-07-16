import React, { useEffect, useState } from 'react';
import { TopBar } from './TopBar';
import { Rail } from './Rail';
import { LeftPanel } from './LeftPanel';
import { CenterWorkArea } from './CenterWorkArea';
import { RightPanel } from './RightPanel';
import { useLayoutStore } from '../../stores/layoutStore';
import { useKeyboardShortcut } from '../../hooks/useKeyboardShortcut';
import { CommandPalette } from '../shared/CommandPalette';
import { DisclosureBar } from '../shared/DisclosureBar';
import { ToastProvider, useToast } from '../shared/ToastProvider';
import { cn } from '../../lib/utils';

export function AppShell() {
  const {
    uiMode,
    toggleUiMode,
    toggleLeftPanel,
    toggleRightPanel,
    leftPanelOpen,
    rightPanelOpen,
    centerTabs,
    activeTabId,
    setActiveTab,
    closeTab,
    openTab,
    setRightPanelView,
    setCommandPalette
  } = useLayoutStore();

  // Focus mode: the calm, minimal surface (chat + live preview). Advanced chrome (rail,
  // side files panel, tab bar) is hidden until the user drills in or toggles to the IDE.
  const focus = uiMode === 'focus';

  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useKeyboardShortcut({
    'cmd+b': () => toggleLeftPanel(),
    'cmd+shift+b': () => toggleRightPanel(),
    'cmd+w': () => activeTabId && closeTab(activeTabId),
    'cmd+t': () => openTab('preview'), // Default to preview for now
    'cmd+k': () => setCommandPalette(true),
    'cmd+`': () => openTab('terminal'),
    'cmd+shift+f': () => setRightPanelView('search'),
    'cmd+shift+m': () => toggleUiMode(),
    'cmd+digit': (e) => {
      const index = parseInt(e.key) - 1;
      if (centerTabs[index]) setActiveTab(centerTabs[index].id);
    }
  });

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen bg-page text-primary font-sans overflow-hidden transition-colors duration-300">
        <TopBar />
        <div className="flex flex-1 min-h-0 overflow-hidden relative">
          {/* Rail is IDE-only chrome — hidden in the calm Focus surface. */}
          {!focus && (
            <Rail className={cn(isMobile && "fixed bottom-0 left-0 right-0 h-12 w-full flex-row z-50 bg-surface border-t border-default")} />
          )}

          {/* Left Panel Overlay on Tablet */}
          {isTablet && leftPanelOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-30 transition-opacity"
              onClick={toggleLeftPanel}
            />
          )}

          <div className={cn(
            "transition-all duration-300 flex flex-1 min-w-0 overflow-hidden",
            isTablet && leftPanelOpen ? "translate-x-0" : isTablet ? "-translate-x-0" : ""
          )}>
            <LeftPanel className={cn(
              // Focus: chat gets a bit more room and a centered, roomier feel.
              focus && !isTablet && "flex-1 max-w-[520px] mx-auto",
              isTablet && "fixed top-10 bottom-0 left-9 w-[320px] z-40 shadow-2xl transition-transform duration-300",
              isTablet && !leftPanelOpen && "-translate-x-full"
            )} />

            <CenterWorkArea />

            {/* Files/library/search side panel is IDE-only. */}
            {!isMobile && !focus && (
              <RightPanel className={cn(
                isTablet && "fixed top-10 bottom-0 right-0 w-[260px] z-40 shadow-2xl transition-transform duration-300",
                isTablet && !rightPanelOpen && "translate-x-full"
              )} />
            )}
          </div>

          {/* Calm "advanced on demand" chip — surfaced by real agent/deploy events. */}
          <DisclosureBar />
        </div>
        <CommandPalette />
      </div>
    </ToastProvider>
  );
}
