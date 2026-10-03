'use client';

// Typeface names are shown in the typeface they name.
//
// Faces come from Google Fonts, with Fontshare asked first because it answers
// 200 with an empty body for a family it does not have, while a miss at Google
// fails CORS and the browser logs that as an error nothing can catch. Asking
// the quiet one first keeps the console clean for the foundry fonts that turn
// up most often on the sites being saved.
//
// Looking a name up sends it to those two services. Answers, including "nobody
// has this", are cached for the browser session.

import { useEffect, useState } from 'react';

export type FontStatus = 'idle' | 'loading' | 'ready' | 'missing';

export interface FontState {
  status: FontStatus;
  /** The CSS family to apply, once something is willing to serve it. */
  family: string | null;
}

const IDLE: FontState = { status: 'idle', family: null };
const LOADING: FontState = { status: 'loading', family: null };
const MISSING: FontState = { status: 'missing', family: null };

/** Generic families need no fetching: the browser already has them. */
const GENERICS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
]);

const MISS_KEY = 'ia-font-misses';

const settled = new Map<string, FontState>();
const inFlight = new Map<string, Promise<FontState>>();
const injected = new Set<string>();

function keyOf(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}

function readMisses(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(MISS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function rememberMiss(key: string): void {
  try {
    const misses = readMisses();
    misses.add(key);
    sessionStorage.setItem(MISS_KEY, JSON.stringify([...misses]));
  } catch {
    // Private windows just look the name up again next session.
  }
}

/** Google needs the family capitalised the way it publishes it. */
function forGoogle(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => (/[A-Z]/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sourcesFor(name: string): string[] {
  const slug = slugify(name);
  const family = encodeURIComponent(forGoogle(name)).replace(/%20/g, '+');
  const sources: string[] = [];
  if (slug) sources.push(`https://api.fontshare.com/v2/css?f[]=${slug}@400&display=swap`);
  // The weighted request is first so headings can be set at 600; families that
  // only ship 400 fall through to the plain one.
  sources.push(`https://fonts.googleapis.com/css2?family=${family}:wght@400;600&display=swap`);
  sources.push(`https://fonts.googleapis.com/css2?family=${family}&display=swap`);
  return sources;
}

type Fetched = { css: string } | 'absent' | 'unreachable';

async function cssFrom(url: string): Promise<Fetched> {
  try {
    const response = await fetch(url);
    if (!response.ok) return 'absent';
    const css = await response.text();
    return css.includes('@font-face') ? { css } : 'absent';
  } catch {
    // A missing Google family fails CORS, which is indistinguishable here from
    // being offline. The caller decides which it was.
    return 'unreachable';
  }
}

async function resolve(key: string, name: string): Promise<FontState> {
  if (typeof document === 'undefined') return MISSING;

  let reachedSomething = false;
  let found: string | null = null;

  for (const url of sourcesFor(name)) {
    const result = await cssFrom(url);
    if (result === 'unreachable') continue;
    reachedSomething = true;
    if (result === 'absent') continue;

    // Use the family name the stylesheet declares, not the one that was typed.
    const family = /font-family:\s*['"]?([^;'"]+)/i.exec(result.css)?.[1]?.trim();
    if (!family) continue;

    if (!injected.has(url)) {
      injected.add(url);
      const style = document.createElement('style');
      style.dataset.fontPreview = family;
      style.textContent = result.css;
      document.head.append(style);
    }

    try {
      await Promise.all([
        document.fonts.load(`400 16px "${family}"`),
        document.fonts.load(`600 16px "${family}"`),
      ]);
    } catch {
      // No Font Loading API: trust the stylesheet.
    }
    found = family;
    // Keep going: a later source may add the heavier weight for the same name.
    if (url.includes('wght@')) break;
  }

  if (found) {
    const state: FontState = { status: 'ready', family: found };
    settled.set(key, state);
    return state;
  }
  // Only remember a miss when the network answered; otherwise this was offline.
  if (reachedSomething) {
    settled.set(key, MISSING);
    rememberMiss(key);
    return MISSING;
  }
  return MISSING;
}

export function loadFont(name: string): Promise<FontState> {
  const key = keyOf(name);
  if (!key) return Promise.resolve(IDLE);
  if (GENERICS.has(key)) return Promise.resolve({ status: 'ready', family: key });

  const known = settled.get(key);
  if (known) return Promise.resolve(known);

  let pending = inFlight.get(key);
  if (!pending) {
    pending = resolve(key, name.trim());
    inFlight.set(key, pending);
  }
  return pending;
}

/** What is already known about a name, without going to the network. */
function snapshot(key: string): FontState {
  if (!key) return IDLE;
  if (GENERICS.has(key)) return { status: 'ready', family: key };
  const known = settled.get(key);
  if (known) return known;
  if (typeof sessionStorage !== 'undefined' && readMisses().has(key)) {
    settled.set(key, MISSING);
    return MISSING;
  }
  return LOADING;
}

/**
 * The state of one typeface. Pass nothing to stand down; the result always
 * belongs to the name that was asked for, never to the previous one.
 */
export function useFont(name: string | null | undefined): FontState {
  const key = keyOf(name);
  const [entry, setEntry] = useState<{ key: string; state: FontState }>(() => ({
    key,
    state: snapshot(key),
  }));

  useEffect(() => {
    if (!key || !name) return;
    let active = true;
    void loadFont(name).then((state) => {
      if (active) setEntry({ key, state });
    });
    return () => {
      active = false;
    };
  }, [key, name]);

  return entry.key === key ? entry.state : snapshot(key);
}

/**
 * The real typeface when something serves it, otherwise the stand-in chosen for
 * it. `missing` says the name itself could not be found anywhere.
 */
export function useTypeface(
  name: string | null | undefined,
  substitute?: string | null,
): { family: string | null; missing: boolean; loading: boolean; usingSubstitute: boolean } {
  const primary = useFont(name);
  const fallback = useFont(primary.status === 'missing' ? substitute : null);
  const missing = primary.status === 'missing';
  return {
    family: primary.family ?? fallback.family,
    missing,
    loading: primary.status === 'loading' || (missing && fallback.status === 'loading'),
    usingSubstitute: missing && fallback.status === 'ready',
  };
}

export function previewStyle(
  family: string | null,
  weight = 400,
): { fontFamily: string; fontWeight: number } | undefined {
  if (!family) return undefined;
  const quoted = GENERICS.has(family) ? family : `"${family}"`;
  return { fontFamily: `${quoted}, var(--font-sans)`, fontWeight: weight };
}
