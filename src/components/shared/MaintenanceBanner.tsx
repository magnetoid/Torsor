import React, { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { apiRequest } from '../../lib/api';

/**
 * Global maintenance banner, driven by the super-admin toggle in platform_settings
 * (surfaced via the public /api/v1/config). The control plane also enforces the mode
 * server-side (503 for non-admins) — this banner is the user-facing explanation.
 */
export function MaintenanceBanner() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<{ maintenance?: { active: boolean; message: string } }>('/api/v1/config')
      .then((cfg) => {
        if (active && cfg.maintenance?.active) {
          setMessage(cfg.maintenance.message || 'Torsor is briefly down for maintenance.');
        }
      })
      .catch(() => {
        // Config being unreachable is not itself a maintenance signal.
      });
    return () => {
      active = false;
    };
  }, []);

  if (!message) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 bg-warning/10 border-b border-warning/20 text-warning text-xs font-medium shrink-0"
    >
      <Wrench size={13} className="shrink-0" />
      <span>{message}</span>
    </div>
  );
}
