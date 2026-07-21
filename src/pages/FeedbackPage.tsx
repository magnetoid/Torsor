import React, { useState } from 'react';
import { MessageSquareHeart, Bug, Lightbulb, MessageSquare, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { HomeLayout } from '../components/shell/HomeLayout';
import { cn } from '../lib/utils';
import { usePlatformStore } from '../stores/platformStore';

const CATEGORIES = [
  { id: 'bug' as const, label: 'Bug report', icon: Bug, hint: 'Something broke or behaves wrong' },
  { id: 'idea' as const, label: 'Idea', icon: Lightbulb, hint: 'A feature or improvement you want' },
  { id: 'other' as const, label: 'Other', icon: MessageSquare, hint: 'Anything else on your mind' },
];

/** Send Feedback — stores feedback for super-admin triage (/api/v1/feedback). */
export function FeedbackPage() {
  const sendFeedback = usePlatformStore((s) => s.sendFeedback);
  const [category, setCategory] = useState<'bug' | 'idea' | 'other'>('idea');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!message.trim()) { toast.error('Tell us something first'); return; }
    setSending(true);
    try {
      await sendFeedback(category, message.trim(), window.location.pathname);
      setSent(true);
      setMessage('');
      toast.success('Feedback sent — thank you!');
    } catch {
      toast.error('Could not send feedback');
    } finally {
      setSending(false);
    }
  };

  return (
    <HomeLayout title="Send Feedback" mainClassName="flex-1 min-w-0 flex flex-col overflow-y-auto animate-in fade-in duration-slow">
      <div className="max-w-2xl w-full mx-auto px-6 py-8 space-y-5">
        {sent ? (
          <div className="text-center py-16 space-y-3">
            <CheckCircle2 size={32} className="mx-auto text-success" />
            <h2 className="text-base font-semibold text-primary">Thanks — we read every message.</h2>
            <button
              onClick={() => setSent(false)}
              className="text-sm text-accent hover:underline"
            >
              Send another
            </button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-1">
              <MessageSquareHeart size={26} className="mx-auto text-accent" />
              <h1 className="text-lg font-bold text-primary">Help make Torsor better</h1>
              <p className="text-sm text-secondary">Goes straight to the team's inbox.</p>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {CATEGORIES.map(({ id, label, icon: Icon, hint }) => (
                <button
                  key={id}
                  onClick={() => setCategory(id)}
                  aria-pressed={category === id}
                  className={cn(
                    'p-3 rounded-xl border text-left transition-colors',
                    category === id
                      ? 'border-accent bg-accent-muted'
                      : 'border-default bg-surface hover:border-accent/30',
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Icon size={14} className={category === id ? 'text-accent' : 'text-tertiary'} />
                    {label}
                  </div>
                  <p className="text-[11px] text-tertiary mt-1">{hint}</p>
                </button>
              ))}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'bug'
                  ? 'What happened? What did you expect instead? Steps to reproduce help a lot.'
                  : category === 'idea'
                    ? 'What would you like Torsor to do?'
                    : 'What is on your mind?'
              }
              rows={6}
              className="w-full bg-surface border border-default rounded-xl px-4 py-3 text-sm text-primary placeholder:text-tertiary focus-ring resize-none"
            />

            <button
              onClick={() => void submit()}
              disabled={sending}
              className="flex items-center gap-2 bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 mx-auto"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Send feedback
            </button>
          </>
        )}
      </div>
    </HomeLayout>
  );
}
