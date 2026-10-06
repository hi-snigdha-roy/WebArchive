import 'server-only';

import { headers } from 'next/headers';
import { supabaseAdmin } from './supabase/admin';
import { SCREENSHOT_BUCKET } from './supabase/images';
import { sectionLabel, type Section } from './types';

// Reading a shared collection. This is the only public surface in the app, so
// it hands back the collection's name and its pictures and nothing else: no
// site names, addresses, designers, palettes, fonts or notes, and no way to
// reach any other collection.

/** Base64url, 43 characters for 32 bytes. Anything else never touches the database. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,64}$/;

const SIGNED_URL_SECONDS = 600;

export interface SharedShot {
  id: string;
  section: string;
  device: string;
  width: number | null;
  height: number | null;
  imageUrl: string | null;
}

export interface SharedCollection {
  name: string;
  shots: SharedShot[];
}

/* ------------------------------------------------------- failed-lookup brake */

// A token is 32 random bytes, so guessing one is hopeless; this is here so that
// trying costs something anyway. The counter lives in memory, which is enough
// for a single-user app on one server. Behind several instances each would keep
// its own tally, so treat it as a brake rather than a lock.

const ATTEMPT_WINDOW_MS = 60_000;
const MAX_FAILURES = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function caller(): Promise<string> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || store.get('x-real-ip') || 'local';
}

function tooManyFailures(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) return false;
  return entry.count >= MAX_FAILURES;
}

function noteFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  entry.count += 1;
}

/* ------------------------------------------------------------------ lookup */

export async function readSharedCollection(token: string): Promise<SharedCollection | null> {
  const ip = await caller();

  if (!TOKEN_SHAPE.test(token) || tooManyFailures(ip)) {
    await sleep(500);
    return null;
  }

  const admin = supabaseAdmin();

  const { data: share } = await admin
    .from('collection_shares')
    .select('collection_id, revoked')
    .eq('token', token)
    .maybeSingle();

  if (!share || share.revoked) {
    noteFailure(ip);
    // Every miss costs the same wait, so timing gives nothing away either.
    await sleep(500);
    return null;
  }

  const collectionId = share.collection_id as string;

  const { data: collection } = await admin
    .from('collections')
    .select('name')
    .eq('id', collectionId)
    .maybeSingle();
  if (!collection) {
    await sleep(500);
    return null;
  }

  const { data: links } = await admin
    .from('collection_shots')
    .select('shot_id, position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: true });

  const shotIds = (links ?? []).map((link) => link.shot_id as string);
  if (!shotIds.length) {
    return { name: collection.name as string, shots: [] };
  }

  // Only the columns a viewer needs. Notes and everything about the site stay
  // behind: a share link is for looking at the pictures.
  const { data: shots } = await admin
    .from('shots')
    .select('id, section, device, width, height, image_path')
    .in('id', shotIds);

  const byId = new Map((shots ?? []).map((shot) => [shot.id as string, shot]));
  const paths = (shots ?? [])
    .map((shot) => shot.image_path as string | null)
    .filter((path): path is string => Boolean(path));

  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await admin.storage
      .from(SCREENSHOT_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const row of urls ?? []) {
      if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
    }
  }

  const ordered: SharedShot[] = [];
  for (const shotId of shotIds) {
    const shot = byId.get(shotId);
    if (!shot) continue;
    const path = shot.image_path as string | null;
    ordered.push({
      id: shot.id as string,
      section: sectionLabel((shot.section as Section | null) ?? null),
      device: (shot.device as string) ?? 'desktop',
      width: (shot.width as number | null) ?? null,
      height: (shot.height as number | null) ?? null,
      imageUrl: path ? (signed.get(path) ?? null) : null,
    });
  }

  return { name: collection.name as string, shots: ordered };
}
