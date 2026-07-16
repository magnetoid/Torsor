import { FlaskConical } from 'lucide-react';

/**
 * Honest "this is a mockup" banner. Rendered at the top of tabs whose UI is built but not
 * yet wired to a real backend, so nothing on screen fabricates real success. Remove the
 * banner from a tab once its actions hit real endpoints.
 */
export function PreviewBanner({ feature }: { feature: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-elevated border-b border-default text-xs text-secondary shrink-0">
      <FlaskConical size={14} className="text-accent-hover shrink-0" />
      <span>
        <span className="font-semibold text-primary">Preview</span> — {feature} is a UI mockup.
        Actions here don&apos;t affect a real backend yet.
      </span>
    </div>
  );
}
