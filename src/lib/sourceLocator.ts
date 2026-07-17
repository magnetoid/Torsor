// Pure text-location helpers for Visual Edits: given the exact text of a selected DOM
// element, find where it lives in the workspace source so an edit can be applied as a
// precise string splice. Kept pure (no store/API access) so it's trivially unit-tested.

/** Source files worth scanning for UI text. */
const SOURCE_EXTENSIONS = new Set(['tsx', 'jsx', 'ts', 'js', 'html', 'vue', 'svelte', 'astro', 'mdx', 'md']);
const EXCLUDED_PATH = /(^|\/)(node_modules|dist|build|\.next|\.git)(\/|$)|\.min\./;

/** True when a workspace path is a plausible source-text candidate. */
export function isCandidatePath(path: string): boolean {
  if (EXCLUDED_PATH.test(path)) return false;
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return SOURCE_EXTENSIONS.has(ext);
}

/** The HTML-entity-escaped variant of a snippet — JSX/HTML sources often store
 *  `Tom &amp; Jerry` for text the DOM reports as `Tom & Jerry`. */
export function htmlEscapeVariant(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface SourceMatch {
  path: string;
  /** Byte index of the needle within the file content. */
  index: number;
  /** The exact needle that matched (original or escaped variant). */
  needle: string;
}

/** Exact-substring scan across file contents. Collects every occurrence (a file can hold
 *  several). Tries the raw needle first; if NOTHING matches anywhere, retries once with
 *  the HTML-escaped variant. */
export function findMatches(contents: Map<string, string>, rawNeedle: string): SourceMatch[] {
  const needle = rawNeedle.trim();
  if (needle.length < 3) return [];

  const scan = (n: string): SourceMatch[] => {
    const out: SourceMatch[] = [];
    for (const [path, content] of contents) {
      let from = 0;
      for (;;) {
        const i = content.indexOf(n, from);
        if (i === -1) break;
        out.push({ path, index: i, needle: n });
        from = i + n.length;
      }
    }
    return out;
  };

  const direct = scan(needle);
  if (direct.length > 0) return direct;
  const escaped = htmlEscapeVariant(needle);
  if (escaped !== needle) return scan(escaped);
  return [];
}

/** Index-based splice (never regex): replace `needle` at `index` with `replacement`. */
export function replaceAt(content: string, index: number, needle: string, replacement: string): string {
  return content.slice(0, index) + replacement + content.slice(index + needle.length);
}
