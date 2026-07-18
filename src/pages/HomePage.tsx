import React from 'react';
import { HomeLayout } from '../components/shell/HomeLayout';
import { HomeContent } from '../components/home/HomeContent';

export function HomePage() {
  // Uses the shared HomeLayout (full-width AccountBar above the sidebar + content row),
  // the same shell shape as the project AppShell — so the left menu never rises over the
  // top bar. HomeContent manages its own scrolling, so main is a plain flex column here.
  return (
    <HomeLayout title="Home" mainClassName="flex-1 min-w-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-slow">
      <HomeContent />
    </HomeLayout>
  );
}
