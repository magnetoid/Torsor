import React from 'react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { HomeContent } from '../components/home/HomeContent';

export function HomePage() {
  // HomeSidebar is a sticky, in-flow flex child, so the content is just flex-1 — no
  // margin offset (a margin would double-count the sidebar's width). HomeContent renders
  // its own scrolling <main> with the shared AccountBar pinned top-right.
  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />
      <div className="flex-1 min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-slow">
        <HomeContent />
      </div>
    </div>
  );
}
