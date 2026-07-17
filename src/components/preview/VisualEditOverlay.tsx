import React from 'react';
import type { OverlayRect } from './useVisualEdit';

/** Parent-rendered highlight rects over the preview iframe — zero DOM pollution inside
 *  the user's app (no hydration/HMR interference). pointer-events pass through. */
export function VisualEditOverlay({
  hoverRect,
  selectionRect,
}: {
  hoverRect: OverlayRect | null;
  selectionRect: OverlayRect | null;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20" aria-hidden>
      {hoverRect && (
        <div
          className="absolute border border-accent/60 rounded-[2px] transition-none"
          style={{ top: hoverRect.top, left: hoverRect.left, width: hoverRect.width, height: hoverRect.height }}
        />
      )}
      {selectionRect && (
        <div
          className="absolute border-2 border-accent bg-accent-muted rounded-[2px]"
          style={{
            top: selectionRect.top,
            left: selectionRect.left,
            width: selectionRect.width,
            height: selectionRect.height,
          }}
        />
      )}
    </div>
  );
}
