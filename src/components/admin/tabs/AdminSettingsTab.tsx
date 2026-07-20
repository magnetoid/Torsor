import React, { useEffect, useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import { Settings, AlertTriangle, Save, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Real platform settings backed by `/api/v1/admin/settings` (single-row `platform_settings`):
 * a maintenance-mode flag and an announcement banner text, persisted server-side. Replaces the
 * previous local-only mock toggles. (Feature flags were removed — Torsor has no server-side
 * flag system yet, so a UI for them would be non-functional.)
 */
export function AdminSettingsTab() {
  const { settings, fetchSettings, saveSettings } = useAdminStore();
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchSettings().finally(() => setLoading(false));
  }, [fetchSettings]);
  useEffect(() => {
    setAnnouncement(settings.announcement);
  }, [settings.announcement]);

  const saveAnnouncement = async () => {
    setSaving(true);
    try {
      await saveSettings({ announcement });
      toast.success('Announcement saved');
    } catch {
      toast.error('Could not save');
    } finally {
      setSaving(false);
    }
  };

  const toggleMaintenance = async (v: boolean) => {
    try {
      await saveSettings({ maintenanceMode: v });
      toast.success(v ? 'Maintenance mode on' : 'Maintenance mode off');
    } catch {
      toast.error('Could not update');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-secondary gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <Settings size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">Platform Settings</h2>
      </header>

      <div className="p-6 space-y-6 max-w-2xl">
        {/* Maintenance mode */}
        <div className="bg-surface border border-default rounded-xl p-5 flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <AlertTriangle size={18} className={cn('mt-0.5', settings.maintenanceMode ? 'text-warning' : 'text-tertiary')} />
            <div>
              <h3 className="text-sm font-bold text-primary">Maintenance mode</h3>
              <p className="text-xs text-secondary mt-0.5">Persisted platform-wide. Enforcement (blocking access) is a follow-up.</p>
            </div>
          </div>
          <Switch.Root
            checked={settings.maintenanceMode}
            onCheckedChange={(v) => void toggleMaintenance(v)}
            className={cn('w-9 h-5 rounded-full relative transition-colors outline-none cursor-pointer shrink-0', settings.maintenanceMode ? 'bg-accent' : 'bg-elevated')}
          >
            <Switch.Thumb className="block w-4 h-4 bg-white rounded-full transition-transform translate-x-0.5 data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>

        {/* Announcement banner */}
        <div className="bg-surface border border-default rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-primary">Announcement banner</h3>
          <textarea
            value={announcement}
            onChange={(e) => setAnnouncement(e.target.value)}
            rows={2}
            placeholder="Shown platform-wide when set. Leave empty for none."
            className="w-full bg-page border border-default rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-accent/50 resize-none"
          />
          <button
            onClick={() => void saveAnnouncement()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
