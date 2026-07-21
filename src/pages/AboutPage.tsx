import React, { useEffect } from 'react';
import { Info, Github, Sparkles, Clock, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HomeLayout } from '../components/shell/HomeLayout';
import { usePlatformStore } from '../stores/platformStore';

/** About — real platform identity + build info from /api/v1/about. */
export function AboutPage() {
  const { about, loading, fetchAbout } = usePlatformStore();

  useEffect(() => {
    void fetchAbout();
  }, [fetchAbout]);

  const uptime = (s: number) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <HomeLayout title="About" mainClassName="flex-1 min-w-0 flex flex-col overflow-y-auto animate-in fade-in duration-slow">
      <div className="max-w-2xl w-full mx-auto px-6 py-8 space-y-6">
        <section className="bg-surface border border-default rounded-xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-accent mx-auto flex items-center justify-center text-white shadow-lg shadow-accent/20">
            <Sparkles size={22} />
          </div>
          <h1 className="text-xl font-bold text-primary">{about?.name ?? 'Torsor'}</h1>
          <p className="text-sm text-secondary">{about?.description ?? 'Open-source, self-hostable vibe-coding cloud IDE'}</p>
          {loading && <Loader2 size={14} className="animate-spin mx-auto text-tertiary" />}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="p-4 bg-surface border border-default rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tertiary">
              <Info size={12} /> Build
            </div>
            <p className="text-sm font-mono text-primary mt-1.5">{about?.build ?? '…'}</p>
            {about?.latestUpdate && (
              <p className="text-xs text-secondary mt-1">
                Latest release: <Link to="/updates" className="text-accent hover:underline font-mono">{about.latestUpdate}</Link>
              </p>
            )}
          </div>
          <div className="p-4 bg-surface border border-default rounded-xl">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-tertiary">
              <Clock size={12} /> Server uptime
            </div>
            <p className="text-sm font-mono text-primary mt-1.5">{about ? uptime(about.uptimeSeconds) : '…'}</p>
          </div>
        </section>

        <a
          href={about?.repository ?? 'https://github.com/magnetoid/Torsor'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 p-4 bg-surface border border-default rounded-xl hover:border-accent/30 transition-colors text-sm text-secondary hover:text-primary"
        >
          <Github size={15} /> Torsor is open source — star it on GitHub
        </a>

        <p className="text-center text-xs text-tertiary">
          Free and open by default. Works with local models — no API key required.
        </p>
      </div>
    </HomeLayout>
  );
}
