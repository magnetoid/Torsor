// Shared motion vocabulary — one place that defines how overlays enter/exit, so every
// Radix dialog, popover, dropdown, tooltip, and toast feels like the same app instead of
// each re-inventing its own timing. Backed by tw-animate-css (animate-in/out + data-state
// variants) and the motion tokens in index.css (duration-fast/base, ease-standard/spring).
//
// These are className fragments meant to be composed with `cn(...)` alongside the element's
// layout/color classes. Radix flips data-[state] between "open" and "closed", and sets
// data-[side] on popper content, which drives the directional slide.

/** Full-screen dim + blur behind a modal dialog. */
export const overlayMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=open]:fade-in data-[state=closed]:fade-out duration-base';

/** Centered modal dialog panel: fade + gentle spring-scale in, quick fade out. */
export const dialogMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=open]:fade-in data-[state=closed]:fade-out ' +
  'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 ' +
  'data-[state=open]:duration-base data-[state=closed]:duration-fast ease-spring';

/** Popper-anchored surface (dropdown, popover, context menu, select): fade + scale, with a
 *  tiny directional slide away from the trigger based on which side Radix placed it. */
export const popoverMotion =
  'data-[state=open]:animate-in data-[state=closed]:animate-out ' +
  'data-[state=open]:fade-in data-[state=closed]:fade-out ' +
  'data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-fast ' +
  'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1 ' +
  'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1';

/** Tooltip: same directional feel as popovers but lighter/faster (it's a hint, not a panel). */
export const tooltipMotion =
  'data-[state=delayed-open]:animate-in data-[state=instant-open]:animate-in ' +
  'data-[state=closed]:animate-out data-[state=closed]:fade-out fade-in zoom-in-95 duration-fast ' +
  'data-[side=top]:slide-in-from-bottom-1 data-[side=bottom]:slide-in-from-top-1 ' +
  'data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1';
