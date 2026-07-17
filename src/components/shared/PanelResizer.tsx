import React, { useRef } from 'react';
import { cn } from '../../lib/utils';

/**
 * A vertical drag handle between two shell panels. Pointer-based (works for mouse + touch,
 * no deps): on drag it reports the panel's new width via `onWidth`, computed from the
 * width at drag start ± the horizontal delta. `sign` is +1 when dragging right should grow
 * the panel (panel is left of the handle) and -1 when the panel sits right of the handle.
 */
export function PanelResizer({
  width,
  onWidth,
  sign = 1,
  ariaLabel = 'Resize panel',
}: {
  width: number;
  onWidth: (w: number) => void;
  sign?: 1 | -1;
  ariaLabel?: string;
}) {
  // Refs so the move handler always sees the latest width without re-binding listeners.
  const widthRef = useRef(width);
  widthRef.current = width;
  const drag = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startW: widthRef.current };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onWidth(drag.current.startW + sign * (e.clientX - drag.current.startX));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        'w-[3px] shrink-0 cursor-col-resize select-none touch-none z-10 transition-colors',
        'bg-transparent hover:bg-accent/50 active:bg-accent'
      )}
    />
  );
}
