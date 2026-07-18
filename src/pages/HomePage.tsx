import React from 'react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { HomeContent } from '../components/home/HomeContent';
import { AccountBar } from '../components/shared/AccountBar';

export function HomePage() {
  // Same shell shape as the project view (AppShell): a full-width top bar spanning the
  // whole window, with the sidebar + content in a row BELOW it — so the left menu no
  // longer rises alongside/over the top bar.
  return (
    <div className="flex flex-col h-screen bg-page">
      <AccountBar title="Home" />
      <div className="flex flex-1 min-h-0">
        <HomeSidebar />
        <div className="flex-1 min-w-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-slow">
          <HomeContent />
        </div>
      </div>
    </div>
  );
}
