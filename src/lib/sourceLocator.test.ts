import { describe, it, expect } from 'vitest';
import { isCandidatePath, htmlEscapeVariant, findMatches, replaceAt } from './sourceLocator';

describe('isCandidatePath', () => {
  it('accepts source files and rejects vendored/build output', () => {
    expect(isCandidatePath('src/App.tsx')).toBe(true);
    expect(isCandidatePath('index.html')).toBe(true);
    expect(isCandidatePath('node_modules/react/index.js')).toBe(false);
    expect(isCandidatePath('dist/bundle.js')).toBe(false);
    expect(isCandidatePath('vendor.min.js')).toBe(false);
    expect(isCandidatePath('logo.png')).toBe(false);
  });
});

describe('findMatches', () => {
  const contents = new Map([
    ['src/App.tsx', '<h1>Welcome to Torsor</h1><p>Welcome to Torsor</p>'],
    ['src/About.tsx', '<h2>About us</h2>'],
  ]);

  it('finds a unique match with its index', () => {
    const m = findMatches(new Map([['a.tsx', 'x <span>Hello world</span> y']]), 'Hello world');
    expect(m).toHaveLength(1);
    expect(m[0].path).toBe('a.tsx');
    expect(m[0].index).toBe(8);
  });

  it('reports every occurrence so ambiguity is detectable', () => {
    expect(findMatches(contents, 'Welcome to Torsor')).toHaveLength(2);
  });

  it('falls back to the HTML-escaped variant', () => {
    const src = new Map([['a.tsx', '<p>Tom &amp; Jerry</p>']]);
    const m = findMatches(src, 'Tom & Jerry');
    expect(m).toHaveLength(1);
    expect(m[0].needle).toBe('Tom &amp; Jerry');
  });

  it('ignores needles that are too short to be safe', () => {
    expect(findMatches(contents, 'us')).toHaveLength(0);
  });
});

describe('replaceAt', () => {
  it('splices by index, leaving identical surrounding text alone', () => {
    const content = 'aaa TITLE bbb TITLE ccc';
    const m = findMatches(new Map([['f', content]]), 'TITLE');
    expect(m).toHaveLength(2);
    expect(replaceAt(content, m[1].index, m[1].needle, 'NEW')).toBe('aaa TITLE bbb NEW ccc');
  });
});
