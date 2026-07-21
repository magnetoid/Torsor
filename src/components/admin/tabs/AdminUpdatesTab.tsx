import React, { useEffect, useState } from 'react';
import { Megaphone, Rocket, Inbox, Trash2, Loader2, Send, CheckCircle2, Bug, Lightbulb, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Central update system (super admin): broadcast announcements to every user's notification
 * feed, publish "What's New" changelog entries (optionally broadcast on publish), and triage
 * user feedback. All real endpoints — /admin/notifications/broadcast, /admin/updates,
 * /admin/feedback.
 */
export function AdminUpdatesTab() {
  const {
    updates, feedback, broadcast, fetchUpdates, publishUpdate, deleteUpdate,
    fetchFeedback, setFeedbackStatus,
  } = useAdminStore();

  // Broadcast composer
  const [bTitle, setBTitle] = useState('');
  const [bMessage, setBMessage] = useState('');
  const [broadcasting, setBroadcasting] = useState(false);

  // Changelog publisher
  const [version, setVersion] = useState('');
  const [uTitle, setUTitle] = useState('');
  const [uBody, setUBody] = useState('');
  const [notifyAll, setNotifyAll] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([fetchUpdates(), fetchFeedback()]).finally(() => setLoading(false));
  }, [fetchUpdates, fetchFeedback]);

  const sendBroadcast = async () => {
    if (!bTitle.trim()) { toast.error('Announcement title is required'); return; }
    setBroadcasting(true);
    try {
      const n = await broadcast(bTitle.trim(), bMessage.trim());
      toast.success(`Announcement sent to ${n} user${n === 1 ? '' : 's'}`);
      setBTitle(''); setBMessage('');
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setBroadcasting(false);
    }
  };

  const publish = async () => {
    if (!version.trim() || !uTitle.trim()) { toast.error('Version and title are required'); return; }
    setPublishing(true);
    try {
      await publishUpdate({ version: version.trim(), title: uTitle.trim(), body: uBody, broadcast: notifyAll });
      toast.success(`Update ${version.trim()} published${notifyAll ? ' + users notified' : ''}`);
      setVersion(''); setUTitle(''); setUBody('');
    } catch {
      toast.error('Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const catIcon = (c: string) =>
    c === 'bug' ? <Bug size={13} className="text-error shrink-0" />
    : c === 'idea' ? <Lightbulb size={13} className="text-warning shrink-0" />
    : <MessageSquare size={13} className="text-tertiary shrink-0" />;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-secondary gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading…
      </div>
    );
  }

  const newFeedback = feedback.filter((f) => f.status === 'new');

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface shrink-0">
        <Megaphone size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">Updates & Announcements</h2>
      </header>

      <div className="p-6 space-y-8 max-w-3xl">
        {/* BROADCAST */}
        <section className="bg-surface border border-default rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone size={14} className="text-accent" />
            <h3 className="text-sm font-bold text-primary">Broadcast announcement</h3>
          </div>
          <p className="text-xs text-secondary">
            Sends a notification to every user's feed immediately.
          </p>
          <input
            value={bTitle}
            onChange={(e) => setBTitle(e.target.value)}
            placeholder="Title (e.g. Scheduled maintenance tonight)"
            className="w-full bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-ring"
          />
          <textarea
            value={bMessage}
            onChange={(e) => setBMessage(e.target.value)}
            placeholder="Message (optional)"
            rows={2}
            className="w-full bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-ring resize-none"
          />
          <button
            onClick={() => void sendBroadcast()}
            disabled={broadcasting}
            className="flex items-center gap-2 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {broadcasting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Send to all users
          </button>
        </section>

        {/* PUBLISH UPDATE */}
        <section className="bg-surface border border-default rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Rocket size={14} className="text-accent" />
            <h3 className="text-sm font-bold text-primary">Publish a platform update</h3>
          </div>
          <p className="text-xs text-secondary">
            Appears on every user's <span className="font-mono">What's New</span> page; optionally notifies everyone.
          </p>
          <div className="flex gap-3">
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="Version (e.g. 1.4.0)"
              className="w-40 bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-ring font-mono"
            />
            <input
              value={uTitle}
              onChange={(e) => setUTitle(e.target.value)}
              placeholder="Title (e.g. Self-verifying agent)"
              className="flex-1 bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-ring"
            />
          </div>
          <textarea
            value={uBody}
            onChange={(e) => setUBody(e.target.value)}
            placeholder={'What changed (markdown-ish, one item per line)\n- The agent now verifies apps in a real browser\n- …'}
            rows={4}
            className="w-full bg-inset border border-default rounded-lg px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-ring resize-none font-mono"
          />
          <label className="flex items-center gap-2 text-xs text-secondary cursor-pointer select-none">
            <input type="checkbox" checked={notifyAll} onChange={(e) => setNotifyAll(e.target.checked)} className="accent-[var(--accent)]" />
            Also notify all users
          </label>
          <button
            onClick={() => void publish()}
            disabled={publishing}
            className="flex items-center gap-2 bg-accent text-white text-sm font-medium px-4 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
            Publish update
          </button>

          {/* Existing changelog */}
          {updates.length > 0 && (
            <div className="pt-2 space-y-2">
              {updates.map((u) => (
                <div key={u.id} className="flex items-start justify-between gap-3 bg-inset border border-default/60 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-accent">{u.version}</span>
                      <span className="text-sm text-primary truncate">{u.title}</span>
                    </div>
                    <p className="text-[11px] text-tertiary">{new Date(u.publishedAt).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => { void deleteUpdate(u.id).then(() => toast.success('Update removed')).catch(() => toast.error('Delete failed')); }}
                    aria-label={`Delete update ${u.version}`}
                    className="p-1 text-tertiary hover:text-error transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FEEDBACK INBOX */}
        <section className="bg-surface border border-default rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Inbox size={14} className="text-accent" />
            <h3 className="text-sm font-bold text-primary">Feedback inbox</h3>
            {newFeedback.length > 0 && (
              <span className="text-[10px] font-bold text-white bg-accent rounded-full px-1.5 py-0.5">{newFeedback.length} new</span>
            )}
          </div>
          {feedback.length === 0 ? (
            <p className="text-xs text-tertiary italic">No feedback yet. Users can send it from the account menu → Send Feedback.</p>
          ) : (
            <div className="space-y-2">
              {feedback.map((f) => (
                <div
                  key={f.id}
                  className={cn(
                    'bg-inset border rounded-lg px-3 py-2',
                    f.status === 'new' ? 'border-accent/40' : 'border-default/60 opacity-70',
                  )}
                >
                  <div className="flex items-center gap-2">
                    {catIcon(f.category)}
                    <span className="text-xs font-medium text-primary truncate">{f.userEmail}</span>
                    {f.page && <span className="text-[10px] font-mono text-tertiary truncate">{f.page}</span>}
                    <span className="text-[10px] text-tertiary ml-auto shrink-0">{new Date(f.createdAt).toLocaleString()}</span>
                    {f.status === 'new' ? (
                      <button
                        onClick={() => { void setFeedbackStatus(f.id, 'reviewed').catch(() => toast.error('Update failed')); }}
                        title="Mark reviewed"
                        aria-label="Mark feedback reviewed"
                        className="p-1 text-tertiary hover:text-success transition-colors shrink-0"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    ) : (
                      <CheckCircle2 size={13} className="text-success shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-secondary mt-1 whitespace-pre-wrap break-words">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
