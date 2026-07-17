import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Star, Download, Rocket, BadgeCheck, Box, Loader2 } from 'lucide-react';
import { HomeSidebar } from '../components/shell/HomeSidebar';
import { AccountBar } from '../components/shared/AccountBar';
import { searchRegistryImages, deployImage, type RegistryImage } from '../lib/api';
import { cn } from '../lib/utils';

function formatCount(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

export function MarketplacePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [images, setImages] = useState<RegistryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);

  const runSearch = async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      setImages(await searchRegistryImages(q || 'library'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
      setImages([]);
    } finally {
      setLoading(false);
    }
  };

  // Load a popular default set on first render.
  useEffect(() => {
    void runSearch('');
  }, []);

  const handleDeploy = async (image: string) => {
    setDeploying(image);
    try {
      const projectId = await deployImage(image);
      navigate(`/project/${projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deploy failed');
    } finally {
      setDeploying(null);
    }
  };

  return (
    <div className="flex bg-page min-h-screen">
      <HomeSidebar />
      <main className="flex-1 min-w-0 overflow-y-auto h-screen">
        <AccountBar title="Marketplace" />
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-6">
            <p className="text-sm text-secondary mt-1">
              Browse container images from Docker Hub and deploy one as a new workspace.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
            className="relative mb-6"
          >
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search images (e.g. nginx, postgres, node)…"
              className="w-full bg-surface border border-default rounded-lg pl-9 pr-4 py-2.5 text-sm text-primary placeholder-tertiary outline-none focus:border-accent transition-colors"
            />
          </form>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20 text-secondary gap-2">
              <Loader2 size={18} className="animate-spin" />
              Searching the marketplace…
            </div>
          ) : (
            <div className="grid gap-3">
              {images.map((img) => (
                <div
                  key={img.name}
                  className="flex items-start justify-between gap-4 bg-surface border border-default rounded-lg p-4 hover:border-tertiary transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-primary truncate">{img.name}</span>
                      {img.official && (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-info">
                          <BadgeCheck size={12} /> Official
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-secondary mt-1 line-clamp-2">
                      {img.description || 'No description provided.'}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-tertiary">
                      <span className="flex items-center gap-1">
                        <Star size={12} /> {formatCount(img.stars)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Download size={12} /> {formatCount(img.pulls)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeploy(img.name)}
                    disabled={deploying !== null}
                    className={cn(
                      'shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all',
                      deploying === img.name
                        ? 'bg-elevated text-tertiary'
                        : 'bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20'
                    )}
                  >
                    {deploying === img.name ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Rocket size={14} />
                    )}
                    Deploy
                  </button>
                </div>
              ))}
              {images.length === 0 && (
                <div className="text-center py-20 text-secondary text-sm">
                  No images found. Try a different search.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
