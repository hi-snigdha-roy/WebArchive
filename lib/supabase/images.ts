'use client';

// Screenshots live in a private bucket, so every <img> needs a signed URL.
//
// Asking for them one at a time would mean one request per tile, so requests
// that arrive close together are gathered up and sent as a single
// createSignedUrls call. Answers are kept in memory and reused until they are
// close to expiring.

import { supabaseBrowser } from './client';

export const SCREENSHOT_BUCKET = 'screenshots';

const TTL_SECONDS = 60 * 60;
/** Hand back a fresh URL once the cached one has less than this much life. */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const BATCH_WINDOW_MS = 40;
const MAX_PER_CALL = 100;

interface Cached {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, Cached>();
const waiting = new Map<string, Array<(url: string | null) => void>>();
let timer: number | null = null;

/** Called when a file is replaced or removed, so nobody reuses a stale link. */
export function forgetSignedUrl(path: string): void {
  cache.delete(path);
}

export function forgetAllSignedUrls(): void {
  cache.clear();
}

export function signedUrlFor(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - Date.now() > EXPIRY_MARGIN_MS) {
    return Promise.resolve(hit.url);
  }
  return new Promise((resolve) => {
    const queue = waiting.get(path);
    if (queue) {
      queue.push(resolve);
      return;
    }
    waiting.set(path, [resolve]);
    schedule();
  });
}

function schedule(): void {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    void flush();
  }, BATCH_WINDOW_MS);
}

async function flush(): Promise<void> {
  const batch = [...waiting.keys()].slice(0, MAX_PER_CALL);
  if (!batch.length) return;

  const found = new Map<string, string>();
  try {
    const { data, error } = await supabaseBrowser()
      .storage.from(SCREENSHOT_BUCKET)
      .createSignedUrls(batch, TTL_SECONDS);
    if (!error && data) {
      for (const row of data) {
        if (row.path && row.signedUrl) found.set(row.path, row.signedUrl);
      }
    }
  } catch {
    // Offline, or the session lapsed. Everyone waiting gets null and the tile
    // shows its placeholder rather than a broken image.
  }

  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  for (const path of batch) {
    const url = found.get(path) ?? null;
    if (url) cache.set(path, { url, expiresAt });
    const queue = waiting.get(path) ?? [];
    waiting.delete(path);
    for (const resolve of queue) resolve(url);
  }

  if (waiting.size) schedule();
}
