'use client';

// EVERY read and write of archive data goes through this file. Nothing else in
// the app knows where the data lives, which is what made moving from IndexedDB
// to Supabase a change to this one module rather than to every screen.
//
// Rows come back from Postgres in snake_case with ISO timestamps; the app works
// in camelCase with epoch milliseconds. The mapping happens here and nowhere
// else. Row level security means every query is already narrowed to the signed
// in owner, so no query below filters by user_id by hand.

import type { PostgrestError } from '@supabase/supabase-js';
import { useCallback, useSyncExternalStore } from 'react';
import { extractColors, mergePalette, pruneRoles } from './colors';
import { DEMO_SITES } from './demo-data';
import { processImage } from './image';
import { readLegacyArchive } from './legacy-browser';
import { supabaseBrowser } from './supabase/client';
import {
  SCREENSHOT_BUCKET,
  forgetAllSignedUrls,
  forgetSignedUrl,
  signedUrlFor,
} from './supabase/images';
import {
  MAX_COLORS,
  type ColorRoles,
  type Collection,
  type Device,
  type Fonts,
  type Industry,
  type Section,
  type Shot,
  type Site,
  type Source,
} from './types';
import { blobToDataUrl, dataUrlToBlob, uid } from './utils';

/* --------------------------------------------------------------- row shapes */

interface SiteRow {
  id: string;
  name: string;
  url: string | null;
  source_url: string | null;
  case_study_url: string | null;
  source: string;
  designer: string | null;
  industry: string;
  styles: string[] | null;
  fonts: Fonts | null;
  colors: string[] | null;
  color_roles: ColorRoles | null;
  notes: string | null;
  favorite: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

interface ShotRow {
  id: string;
  site_id: string;
  section: string | null;
  device: string;
  image_path: string | null;
  width: number | null;
  height: number | null;
  colors: string[] | null;
  note: string | null;
  created_at: string;
}

interface CollectionRow {
  id: string;
  name: string;
  created_at: string;
}

interface CollectionShotRow {
  collection_id: string;
  shot_id: string;
  position: number;
}

const ms = (iso: string): number => new Date(iso).getTime();
const iso = (value: number): string => new Date(value).toISOString();

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    name: row.name,
    url: row.url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    caseStudyUrl: row.case_study_url ?? undefined,
    source: row.source as Source,
    designer: row.designer ?? undefined,
    industry: row.industry as Industry,
    styles: row.styles ?? [],
    fonts: row.fonts ?? {},
    colors: row.colors ?? [],
    colorRoles: row.color_roles ?? {},
    notes: row.notes ?? '',
    favorite: row.favorite,
    isDemo: row.is_demo || undefined,
    createdAt: ms(row.created_at),
    updatedAt: ms(row.updated_at),
  };
}

function toShot(row: ShotRow): Shot {
  return {
    id: row.id,
    siteId: row.site_id,
    section: (row.section as Section | null) ?? null,
    device: row.device as Device,
    hasImage: Boolean(row.image_path),
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    colors: row.colors ?? [],
    note: row.note ?? '',
    createdAt: ms(row.created_at),
  };
}

/* ------------------------------------------------------------------ plumbing */

const db = supabaseBrowser;

function fail(error: PostgrestError | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

let cachedUserId: string | null = null;

async function currentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const { data, error } = await db().auth.getUser();
  if (error || !data.user) throw new Error('You are not signed in.');
  cachedUserId = data.user.id;
  return cachedUserId;
}

export function forgetCachedUser(): void {
  cachedUserId = null;
  forgetAllSignedUrls();
}

/** Postgres returns at most 1000 rows per request, so ask until it runs dry. */
const PAGE = 1000;

async function paged<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    fail(error, 'Could not read your archive');
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function storagePath(userId: string, shotId: string): string {
  return `${userId}/${shotId}.webp`;
}

/* ---------------------------------------------------------- the live cache */

// One copy of the archive in memory, handed to every screen through
// useSyncExternalStore. Mutations patch it directly where they can, so a
// favourite or a note takes one round trip rather than a write and a reread.

export interface LibrarySnapshot {
  sites: Site[];
  shots: Shot[];
  collections: Collection[];
  /** False until the first read has come back, so the UI can hold its breath. */
  ready: boolean;
  /** Plain language, safe to show. Null when the last read succeeded. */
  error: string | null;
  /** Try the read again after a failure. */
  retry: () => void;
}

const NO_SITES: Site[] = [];
const NO_SHOTS: Shot[] = [];
const NO_COLLECTIONS: Collection[] = [];

/** shot id -> its object path in the bucket. */
const imagePaths = new Map<string, string>();
/** collection id -> shot ids, in their stored order. */
let membership = new Map<string, string[]>();

const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
/**
 * Seeding and retrying both start a fresh read while an older one may still be
 * in flight. Only the newest read is allowed to publish, or a slow early read
 * could land after a newer one and put stale rows back on screen.
 */
let generation = 0;

function retry(): void {
  loading = null;
  void load(true);
}

let state: LibrarySnapshot = {
  sites: NO_SITES,
  shots: NO_SHOTS,
  collections: NO_COLLECTIONS,
  ready: false,
  error: null,
  retry,
};

const SERVER_STATE: LibrarySnapshot = state;

function publish(next: Partial<LibrarySnapshot>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function withMembership(collections: CollectionRow[], links: CollectionShotRow[]): Collection[] {
  const next = new Map<string, string[]>();
  const ordered = [...links].sort((a, b) => a.position - b.position);
  for (const link of ordered) {
    const bucket = next.get(link.collection_id);
    if (bucket) bucket.push(link.shot_id);
    else next.set(link.collection_id, [link.shot_id]);
  }
  membership = next;
  return collections.map((row) => ({
    id: row.id,
    name: row.name,
    shotIds: next.get(row.id) ?? [],
    createdAt: ms(row.created_at),
  }));
}

async function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  const mine = ++generation;
  loading = (async () => {
    try {
      const [siteRows, shotRows, collectionRows, linkRows] = await Promise.all([
        paged<SiteRow>((from, to) =>
          db().from('sites').select('*').order('created_at', { ascending: false }).range(from, to),
        ),
        paged<ShotRow>((from, to) =>
          db().from('shots').select('*').order('created_at', { ascending: false }).range(from, to),
        ),
        paged<CollectionRow>((from, to) =>
          db()
            .from('collections')
            .select('*')
            .order('created_at', { ascending: false })
            .range(from, to),
        ),
        paged<CollectionShotRow>((from, to) =>
          db()
            .from('collection_shots')
            .select('collection_id, shot_id, position')
            .order('position', { ascending: true })
            .range(from, to),
        ),
      ]);

      if (mine !== generation) return;

      imagePaths.clear();
      for (const row of shotRows) {
        if (row.image_path) imagePaths.set(row.id, row.image_path);
      }

      publish({
        sites: siteRows.map(toSite),
        shots: shotRows.map(toShot),
        collections: withMembership(collectionRows, linkRows),
        ready: true,
        error: null,
      });
    } catch (problem) {
      if (mine !== generation) return;
      publish({
        ready: true,
        error:
          problem instanceof Error && problem.message
            ? problem.message
            : 'Your archive could not be loaded.',
      });
    }
  })();
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!loading) void load();
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): LibrarySnapshot {
  return state;
}

function serverSnapshot(): LibrarySnapshot {
  return SERVER_STATE;
}

export function useLibrary(): LibrarySnapshot {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** Pulls everything again. Used after writes that touch more than one row. */
async function reload(): Promise<void> {
  loading = null;
  await load(true);
}

/* --------------------------------------------------------- derived readers */

export interface SiteSnapshot {
  site: Site | null;
  shots: Shot[];
  ready: boolean;
  error: string | null;
  retry: () => void;
}

export function useSite(siteId: string): SiteSnapshot {
  const library = useLibrary();
  return {
    site: library.sites.find((site) => site.id === siteId) ?? null,
    shots: library.shots.filter((shot) => shot.siteId === siteId),
    ready: library.ready,
    error: library.error,
    retry: library.retry,
  };
}

/** A short-lived link to one screenshot, or null when there is no image. */
export async function getShotImageUrl(shotId: string): Promise<string | null> {
  const path = imagePaths.get(shotId);
  if (!path) return null;
  return signedUrlFor(path);
}

/** The bytes themselves. Only the backup needs these. */
export async function getShotImage(shotId: string): Promise<Blob | undefined> {
  const path = imagePaths.get(shotId);
  if (!path) return undefined;
  const { data, error } = await db().storage.from(SCREENSHOT_BUCKET).download(path);
  if (error || !data) return undefined;
  return data;
}

export async function getShot(shotId: string): Promise<Shot | undefined> {
  const shot = state.shots.find((item) => item.id === shotId);
  if (!shot) return undefined;
  const image = await getShotImage(shotId);
  return { ...shot, image };
}

/* --------------------------------------------------------------- small flags */

// The demo banner being dismissed is a per-browser preference, not archive
// data, so it stays in localStorage rather than taking up a table.

export const DEMO_BANNER_DISMISSED = 'demoBannerDismissed';

const FLAG_PREFIX = 'ia-flag-';
const flagListeners = new Set<() => void>();

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(FLAG_PREFIX + key) === 'true';
  } catch {
    return false;
  }
}

export async function setFlag(key: string, value: boolean): Promise<void> {
  try {
    localStorage.setItem(FLAG_PREFIX + key, value ? 'true' : 'false');
  } catch {
    // A private window simply forgets between visits.
  }
  for (const listener of flagListeners) listener();
}

function subscribeFlags(listener: () => void): () => void {
  flagListeners.add(listener);
  return () => {
    flagListeners.delete(listener);
  };
}

export function useFlag(key: string): [boolean, (value: boolean) => void] {
  const get = useCallback(() => readFlag(key), [key]);
  const value = useSyncExternalStore(subscribeFlags, get, () => false);
  const set = useCallback(
    (next: boolean) => {
      void setFlag(key, next);
    },
    [key],
  );
  return [value, set];
}

/* ------------------------------------------------------------------- writing */

export interface SiteInput {
  name: string;
  url?: string;
  sourceUrl?: string;
  source: Source;
  designer?: string;
  industry: Industry;
  styles: string[];
  fonts: Fonts;
  colors: string[];
  notes: string;
  caseStudyUrl?: string;
}

export interface ShotInput {
  section: Section | null;
  device: Device;
  note?: string;
  /** Converted to WebP and downscaled before it is uploaded. */
  file?: Blob;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function list(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

function fonts(value: Fonts | undefined): Fonts {
  const out: Fonts = {};
  const heading = text(value?.heading);
  const body = text(value?.body);
  const headingPreview = text(value?.headingPreview);
  const bodyPreview = text(value?.bodyPreview);
  if (heading) out.heading = heading;
  if (body) out.body = body;
  if (headingPreview) out.headingPreview = headingPreview;
  if (bodyPreview) out.bodyPreview = bodyPreview;
  return out;
}

function patchSiteInCache(site: Site): void {
  publish({ sites: state.sites.map((item) => (item.id === site.id ? site : item)) });
}

export async function addSite(
  input: SiteInput,
  shots: ShotInput[] = [],
): Promise<{ siteId: string; shotIds: string[] }> {
  const { data, error } = await db()
    .from('sites')
    .insert({
      name: input.name.trim() || 'Untitled',
      url: text(input.url),
      source_url: text(input.sourceUrl),
      case_study_url: text(input.caseStudyUrl),
      source: input.source,
      designer: text(input.designer),
      industry: input.industry,
      styles: list(input.styles),
      fonts: fonts(input.fonts),
      colors: list(input.colors).slice(0, MAX_COLORS),
      color_roles: {},
      notes: input.notes?.trim() ?? '',
      favorite: false,
    })
    .select('*')
    .single();
  fail(error, 'Could not save that site');

  const site = toSite(data as SiteRow);
  publish({ sites: [site, ...state.sites] });
  const shotIds = await addShots(site.id, shots);
  return { siteId: site.id, shotIds };
}

/** Colours found in new screenshots join the site's palette, up to the cap. */
async function mergeIntoSitePalette(siteId: string, colors: string[]): Promise<void> {
  if (!colors.length) return;
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) return;
  const merged = mergePalette(site.colors, colors, MAX_COLORS);
  if (merged.length === site.colors.length) return;
  await updateSite(siteId, { colors: merged });
}

export async function addShots(siteId: string, inputs: ShotInput[]): Promise<string[]> {
  if (!inputs.length) return [];
  const userId = await currentUserId();
  const base = Date.now();
  const rows: Record<string, unknown>[] = [];
  const ids: string[] = [];
  const found: string[] = [];

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    const id = uid();
    let path: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let colors: string[] = [];

    if (input.file) {
      const processed = await processImage(input.file);
      colors = await extractColors(processed.blob);
      found.push(...colors);
      width = processed.width;
      height = processed.height;
      path = storagePath(userId, id);
      const { error } = await db()
        .storage.from(SCREENSHOT_BUCKET)
        .upload(path, processed.blob, { contentType: 'image/webp', upsert: true });
      if (error) throw new Error(`Could not upload that screenshot: ${error.message}`);
    }

    rows.push({
      id,
      site_id: siteId,
      section: input.section ?? null,
      device: input.device,
      image_path: path,
      width,
      height,
      colors,
      note: input.note?.trim() ?? '',
      // Newest-first then shows the files in the order they were chosen.
      created_at: iso(base + (inputs.length - 1 - i)),
    });
    ids.push(id);
  }

  const { error } = await db().from('shots').insert(rows);
  fail(error, 'Could not save those shots');

  await mergeIntoSitePalette(siteId, found);
  await reload();
  return ids;
}

export type SitePatch = Partial<Omit<Site, 'id' | 'createdAt' | 'updatedAt'>>;

export async function updateSite(siteId: string, patch: SitePatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name.trim() || 'Untitled';
  if (patch.url !== undefined) row.url = text(patch.url);
  if (patch.sourceUrl !== undefined) row.source_url = text(patch.sourceUrl);
  if (patch.caseStudyUrl !== undefined) row.case_study_url = text(patch.caseStudyUrl);
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.designer !== undefined) row.designer = text(patch.designer);
  if (patch.industry !== undefined) row.industry = patch.industry;
  if (patch.styles !== undefined) row.styles = list(patch.styles);
  if (patch.fonts !== undefined) row.fonts = fonts(patch.fonts);
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.favorite !== undefined) row.favorite = patch.favorite;
  if (patch.colors !== undefined) row.colors = list(patch.colors).slice(0, MAX_COLORS);

  // A role may only point at a colour the palette still holds.
  if (patch.colors !== undefined || patch.colorRoles !== undefined) {
    const current = state.sites.find((item) => item.id === siteId);
    const colors = (row.colors as string[] | undefined) ?? current?.colors ?? [];
    const roles: ColorRoles = patch.colorRoles ?? current?.colorRoles ?? {};
    row.color_roles = pruneRoles(colors, roles);
  }

  if (!Object.keys(row).length) return;

  const { data, error } = await db()
    .from('sites')
    .update(row)
    .eq('id', siteId)
    .select('*')
    .single();
  fail(error, 'Could not save that change');
  patchSiteInCache(toSite(data as SiteRow));
}

export async function toggleFavorite(siteId: string): Promise<boolean> {
  const site = state.sites.find((item) => item.id === siteId);
  if (!site) return false;
  const favorite = !site.favorite;
  await updateSite(siteId, { favorite });
  return favorite;
}

export type ShotPatch = Partial<Pick<Shot, 'section' | 'device' | 'note' | 'colors'>>;

export async function updateShot(shotId: string, patch: ShotPatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.section !== undefined) row.section = patch.section;
  if (patch.device !== undefined) row.device = patch.device;
  if (patch.note !== undefined) row.note = patch.note.trim();
  if (patch.colors !== undefined) row.colors = list(patch.colors).slice(0, MAX_COLORS);
  if (!Object.keys(row).length) return;

  const { data, error } = await db()
    .from('shots')
    .update(row)
    .eq('id', shotId)
    .select('*')
    .single();
  fail(error, 'Could not save that change');

  const shot = toShot(data as ShotRow);
  publish({ shots: state.shots.map((item) => (item.id === shotId ? shot : item)) });
}

export async function setShotImage(shotId: string, file: Blob): Promise<void> {
  const userId = await currentUserId();
  const processed = await processImage(file);
  const colors = await extractColors(processed.blob);
  const path = storagePath(userId, shotId);

  const { error: uploadError } = await db()
    .storage.from(SCREENSHOT_BUCKET)
    .upload(path, processed.blob, { contentType: 'image/webp', upsert: true });
  if (uploadError) throw new Error(`Could not upload that screenshot: ${uploadError.message}`);
  // The bytes behind that path just changed, so any link to it is stale.
  forgetSignedUrl(path);

  const { data, error } = await db()
    .from('shots')
    .update({
      image_path: path,
      width: processed.width,
      height: processed.height,
      colors,
    })
    .eq('id', shotId)
    .select('*')
    .single();
  fail(error, 'Could not save that screenshot');

  const shot = toShot(data as ShotRow);
  imagePaths.set(shotId, path);
  publish({ shots: state.shots.map((item) => (item.id === shotId ? shot : item)) });
  await mergeIntoSitePalette(shot.siteId, colors);
}

/** Takes the files out of the bucket as well as the rows out of the table. */
async function removeStoredImages(shotIds: string[]): Promise<void> {
  const paths = shotIds
    .map((shotId) => imagePaths.get(shotId))
    .filter((path): path is string => Boolean(path));
  if (!paths.length) return;
  await db().storage.from(SCREENSHOT_BUCKET).remove(paths);
  for (const path of paths) forgetSignedUrl(path);
  for (const shotId of shotIds) imagePaths.delete(shotId);
}

export async function deleteShot(shotId: string): Promise<void> {
  await removeStoredImages([shotId]);
  const { error } = await db().from('shots').delete().eq('id', shotId);
  fail(error, 'Could not delete that shot');

  // The database removes the collection links for us; mirror that in memory.
  publish({
    shots: state.shots.filter((shot) => shot.id !== shotId),
    collections: state.collections.map((collection) =>
      collection.shotIds.includes(shotId)
        ? { ...collection, shotIds: collection.shotIds.filter((id) => id !== shotId) }
        : collection,
    ),
  });
}

export async function deleteSite(siteId: string): Promise<void> {
  const shotIds = state.shots.filter((shot) => shot.siteId === siteId).map((shot) => shot.id);
  await removeStoredImages(shotIds);
  // Shots and collection links go with it: the foreign keys cascade.
  const { error } = await db().from('sites').delete().eq('id', siteId);
  fail(error, 'Could not delete that site');

  const gone = new Set(shotIds);
  publish({
    sites: state.sites.filter((site) => site.id !== siteId),
    shots: state.shots.filter((shot) => shot.siteId !== siteId),
    collections: state.collections.map((collection) => ({
      ...collection,
      shotIds: collection.shotIds.filter((id) => !gone.has(id)),
    })),
  });
}

/* ---------------------------------------------------------------- demo data */

let seeding: Promise<void> | null = null;

/** Loads the demo sites the first time the archive is opened, and only then. */
export function ensureSeeded(): Promise<void> {
  if (!seeding) seeding = seed();
  return seeding;
}

async function seed(): Promise<void> {
  const { count, error } = await db().from('sites').select('id', { count: 'exact', head: true });
  if (error || (count ?? 0) > 0) return;

  const base = Date.now();
  const siteRows: Record<string, unknown>[] = [];
  const shotRows: Record<string, unknown>[] = [];

  DEMO_SITES.forEach((entry, index) => {
    const createdAt = base - index * 100_000;
    const siteId = uid();
    siteRows.push({
      id: siteId,
      name: entry.name,
      url: entry.url ?? null,
      source_url: entry.sourceUrl ?? null,
      source: entry.source,
      designer: entry.designer ?? null,
      industry: entry.industry,
      styles: entry.styles,
      fonts: {},
      colors: [],
      color_roles: {},
      notes: '',
      favorite: false,
      is_demo: true,
      created_at: iso(createdAt),
      updated_at: iso(createdAt),
    });
    entry.shots.forEach((shot, order) => {
      shotRows.push({
        id: uid(),
        site_id: siteId,
        section: shot.section,
        device: shot.device ?? 'desktop',
        image_path: null,
        colors: [],
        note: shot.note ?? '',
        created_at: iso(createdAt - order * 1000),
      });
    });
  });

  const { error: siteError } = await db().from('sites').insert(siteRows);
  if (siteError) return;
  await db().from('shots').insert(shotRows);
  await reload();
}

export async function removeDemoData(): Promise<void> {
  const demoIds = state.sites.filter((site) => site.isDemo).map((site) => site.id);
  if (!demoIds.length) {
    await setFlag(DEMO_BANNER_DISMISSED, true);
    return;
  }
  const shotIds = state.shots.filter((shot) => demoIds.includes(shot.siteId)).map((shot) => shot.id);
  await removeStoredImages(shotIds);
  const { error } = await db().from('sites').delete().in('id', demoIds);
  fail(error, 'Could not remove the demo data');
  await setFlag(DEMO_BANNER_DISMISSED, true);
  await reload();
}

/* -------------------------------------------------------------- collections */

export async function createCollection(name: string): Promise<string> {
  const { data, error } = await db()
    .from('collections')
    .insert({ name: name.trim() || 'Untitled collection' })
    .select('*')
    .single();
  fail(error, 'Could not make that collection');
  const row = data as CollectionRow;
  publish({
    collections: [
      { id: row.id, name: row.name, shotIds: [], createdAt: ms(row.created_at) },
      ...state.collections,
    ],
  });
  return row.id;
}

export async function renameCollection(collectionId: string, name: string): Promise<void> {
  const next = name.trim() || 'Untitled collection';
  const { error } = await db().from('collections').update({ name: next }).eq('id', collectionId);
  fail(error, 'Could not rename that collection');
  publish({
    collections: state.collections.map((collection) =>
      collection.id === collectionId ? { ...collection, name: next } : collection,
    ),
  });
}

export async function deleteCollection(collectionId: string): Promise<void> {
  const { error } = await db().from('collections').delete().eq('id', collectionId);
  fail(error, 'Could not delete that collection');
  membership.delete(collectionId);
  publish({
    collections: state.collections.filter((collection) => collection.id !== collectionId),
  });
}

function patchMembership(collectionId: string, shotIds: string[]): void {
  membership.set(collectionId, shotIds);
  publish({
    collections: state.collections.map((collection) =>
      collection.id === collectionId ? { ...collection, shotIds } : collection,
    ),
  });
}

/** Adds only the shots that are not in the collection already. */
export async function addToCollection(collectionId: string, shotIds: string[]): Promise<number> {
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection) return 0;
  const held = new Set(collection.shotIds);
  const added = shotIds.filter((shotId) => !held.has(shotId));
  if (!added.length) return 0;

  const start = collection.shotIds.length;
  const { error } = await db()
    .from('collection_shots')
    .insert(
      added.map((shotId, index) => ({
        collection_id: collectionId,
        shot_id: shotId,
        position: start + index,
      })),
    );
  fail(error, 'Could not add to that collection');
  patchMembership(collectionId, [...collection.shotIds, ...added]);
  return added.length;
}

export async function removeFromCollection(collectionId: string, shotId: string): Promise<void> {
  const { error } = await db()
    .from('collection_shots')
    .delete()
    .eq('collection_id', collectionId)
    .eq('shot_id', shotId);
  fail(error, 'Could not remove that shot');
  const collection = state.collections.find((item) => item.id === collectionId);
  if (collection) {
    patchMembership(
      collectionId,
      collection.shotIds.filter((id) => id !== shotId),
    );
  }
}

/** Writes a whole new order, dropping any id the collection no longer holds. */
export async function setCollectionOrder(collectionId: string, shotIds: string[]): Promise<void> {
  const collection = state.collections.find((item) => item.id === collectionId);
  if (!collection) return;
  const held = new Set(collection.shotIds);
  const next = shotIds.filter((shotId) => held.has(shotId));
  for (const shotId of collection.shotIds) {
    if (!next.includes(shotId)) next.push(shotId);
  }

  // Show the new order at once; the write only confirms it.
  patchMembership(collectionId, next);
  const { error } = await db()
    .from('collection_shots')
    .upsert(
      next.map((shotId, index) => ({
        collection_id: collectionId,
        shot_id: shotId,
        position: index,
      })),
      { onConflict: 'collection_id,shot_id' },
    );
  fail(error, 'Could not save that order');
}

/* ------------------------------------------------------------------ backup */

const FORMAT = 'inspiration-archive';

export interface ImportSummary {
  sites: number;
  shots: number;
  images: number;
}

/**
 * The whole archive as one JSON file, images included as data URLs. Built in
 * pieces rather than one string so a few hundred screenshots do not have to sit
 * in memory twice.
 */
export async function exportArchive(): Promise<Blob> {
  const sites = state.sites;
  const shots = state.shots;
  const collections = state.collections;

  const parts: BlobPart[] = [
    `{"format":"${FORMAT}","version":1,"exportedAt":${Date.now()},`,
    `"sites":${JSON.stringify(sites)},`,
    `"collections":${JSON.stringify(collections)},`,
    '"shots":[',
  ];

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    const blob = shot.hasImage ? await getShotImage(shot.id) : undefined;
    const image = blob ? await blobToDataUrl(blob) : undefined;
    parts.push(JSON.stringify(image ? { ...shot, image } : shot));
    if (i < shots.length - 1) parts.push(',');
  }

  parts.push(']}');
  return new Blob(parts, { type: 'application/json' });
}

interface ExportedShot extends Omit<Shot, 'image'> {
  image?: string;
}

/**
 * Adds everything in the file to the archive under fresh ids. Nothing already
 * saved is touched, so a restore can never take data away.
 */
export async function importArchive(file: Blob): Promise<ImportSummary> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not readable JSON.');
  }

  const payload = parsed as {
    format?: string;
    sites?: Site[];
    shots?: ExportedShot[];
    collections?: Collection[];
  };
  if (payload?.format !== FORMAT || !Array.isArray(payload.sites)) {
    throw new Error('That is not an Inspiration Archive backup.');
  }

  const userId = await currentUserId();
  const siteIds = new Map<string, string>();
  const shotIds = new Map<string, string>();

  const siteRows = payload.sites
    .filter((site) => site?.id)
    .map((site) => {
      const id = uid();
      siteIds.set(site.id, id);
      return {
        id,
        name: site.name ?? 'Untitled',
        url: text(site.url),
        source_url: text(site.sourceUrl),
        case_study_url: text(site.caseStudyUrl),
        source: site.source ?? 'Other',
        designer: text(site.designer),
        industry: site.industry ?? 'other',
        styles: list(site.styles),
        fonts: fonts(site.fonts),
        colors: list(site.colors).slice(0, MAX_COLORS),
        color_roles: pruneRoles(list(site.colors).slice(0, MAX_COLORS), site.colorRoles),
        notes: site.notes ?? '',
        favorite: Boolean(site.favorite),
        // Imported work is yours, not demo data the banner may offer to delete.
        is_demo: false,
        created_at: iso(site.createdAt ?? Date.now()),
      };
    });

  if (siteRows.length) {
    const { error } = await db().from('sites').insert(siteRows);
    fail(error, 'Could not add those sites');
  }

  const shotRows: Record<string, unknown>[] = [];
  let images = 0;

  for (const shot of payload.shots ?? []) {
    const siteId = siteIds.get(shot?.siteId ?? '');
    if (!siteId) continue;
    const id = uid();
    shotIds.set(shot.id, id);

    let path: string | null = null;
    const blob = shot.image ? dataUrlToBlob(shot.image) : null;
    if (blob) {
      path = storagePath(userId, id);
      const { error } = await db()
        .storage.from(SCREENSHOT_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/webp', upsert: true });
      if (error) path = null;
      else images += 1;
    }

    shotRows.push({
      id,
      site_id: siteId,
      section: shot.section ?? null,
      device: shot.device === 'mobile' ? 'mobile' : 'desktop',
      image_path: path,
      width: shot.width ?? null,
      height: shot.height ?? null,
      colors: list(shot.colors).slice(0, MAX_COLORS),
      note: shot.note ?? '',
      created_at: iso(shot.createdAt ?? Date.now()),
    });
  }

  if (shotRows.length) {
    const { error } = await db().from('shots').insert(shotRows);
    fail(error, 'Could not add those shots');
  }

  for (const collection of payload.collections ?? []) {
    if (!collection?.id) continue;
    const members = (collection.shotIds ?? [])
      .map((shotId) => shotIds.get(shotId))
      .filter((shotId): shotId is string => Boolean(shotId));
    const { data, error } = await db()
      .from('collections')
      .insert({
        name: collection.name ?? 'Collection',
        created_at: iso(collection.createdAt ?? Date.now()),
      })
      .select('id')
      .single();
    if (error || !data) continue;
    if (members.length) {
      await db()
        .from('collection_shots')
        .insert(
          members.map((shotId, index) => ({
            collection_id: (data as { id: string }).id,
            shot_id: shotId,
            position: index,
          })),
        );
    }
  }

  await reload();
  return { sites: siteRows.length, shots: shotRows.length, images };
}

/* ------------------------------------------------------------ share links */

/** 32 random bytes as base64url: 43 characters, no padding. */
function shareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The live token for a collection, or null when it is not being shared. */
export async function getShare(collectionId: string): Promise<string | null> {
  const { data, error } = await db()
    .from('collection_shares')
    .select('token')
    .eq('collection_id', collectionId)
    .eq('revoked', false)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not check sharing: ${error.message}`);
  return (data?.[0] as { token: string } | undefined)?.token ?? null;
}

/** Reuses the existing link if there is one, so the URL stays stable. */
export async function createShare(collectionId: string): Promise<string> {
  const existing = await getShare(collectionId);
  if (existing) return existing;

  const token = shareToken();
  const { error } = await db()
    .from('collection_shares')
    .insert({ token, collection_id: collectionId });
  fail(error, 'Could not create a share link');
  return token;
}

export async function revokeShare(collectionId: string): Promise<void> {
  const { error } = await db()
    .from('collection_shares')
    .update({ revoked: true })
    .eq('collection_id', collectionId)
    .eq('revoked', false);
  fail(error, 'Could not stop sharing');
}

/* --------------------------------------------- one-time import from this browser */

// Lifts the archive that earlier phases kept in this browser into Supabase.
// A record of which old id became which new one is kept in localStorage, so
// running it a second time adds nothing twice. The old data is never touched.

const MIGRATION_KEY = 'ia-migrated-ids';

export interface ImportProgress {
  done: number;
  total: number;
  label: string;
}

export interface BrowserImportSummary {
  sites: number;
  shots: number;
  images: number;
  collections: number;
  alreadyThere: number;
}

function readMigrated(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MIGRATION_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMigrated(map: Record<string, string>): void {
  try {
    localStorage.setItem(MIGRATION_KEY, JSON.stringify(map));
  } catch {
    // Without this the next run would add second copies, so say so loudly.
    throw new Error('This browser will not let the app remember what it imported.');
  }
}

export async function importFromBrowser(
  onProgress: (progress: ImportProgress) => void,
): Promise<BrowserImportSummary> {
  const archive = await readLegacyArchive();
  if (!archive) throw new Error('There is no earlier archive in this browser.');

  const userId = await currentUserId();
  const migrated = readMigrated();
  const summary: BrowserImportSummary = {
    sites: 0,
    shots: 0,
    images: 0,
    collections: 0,
    alreadyThere: 0,
  };

  const pendingSites = archive.sites.filter((site) => !migrated[`site:${site.id}`]);
  const pendingShots = archive.shots.filter((shot) => !migrated[`shot:${shot.id}`]);
  const pendingCollections = archive.collections.filter(
    (collection) => !migrated[`collection:${collection.id}`],
  );
  summary.alreadyThere =
    archive.sites.length -
    pendingSites.length +
    (archive.shots.length - pendingShots.length);

  const total = pendingSites.length + pendingShots.length + pendingCollections.length;
  let done = 0;
  const step = (label: string) => {
    done += 1;
    onProgress({ done, total, label });
  };

  onProgress({ done: 0, total, label: 'Reading this browser' });

  for (const site of pendingSites) {
    const colors = list(site.colors).slice(0, MAX_COLORS);
    const { data, error } = await db()
      .from('sites')
      .insert({
        name: site.name || 'Untitled',
        url: text(site.url),
        source_url: text(site.sourceUrl),
        case_study_url: text(site.caseStudyUrl),
        source: site.source ?? 'Other',
        designer: text(site.designer),
        industry: site.industry ?? 'other',
        styles: list(site.styles),
        fonts: fonts(site.fonts as Fonts | undefined),
        colors,
        color_roles: pruneRoles(colors, site.colorRoles as ColorRoles | undefined),
        notes: site.notes ?? '',
        favorite: Boolean(site.favorite),
        is_demo: Boolean(site.isDemo),
        created_at: iso(site.createdAt ?? Date.now()),
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`Could not add "${site.name}": ${error?.message ?? ''}`);
    migrated[`site:${site.id}`] = (data as { id: string }).id;
    summary.sites += 1;
    writeMigrated(migrated);
    step(`Uploading ${site.name}`);
  }

  for (let i = 0; i < pendingShots.length; i += 1) {
    const shot = pendingShots[i];
    const siteId = migrated[`site:${shot.siteId}`];
    if (!siteId) {
      step('Skipping an orphaned shot');
      continue;
    }

    const id = uid();
    let path: string | null = null;
    const blob = archive.images.get(shot.id);
    if (blob) {
      path = storagePath(userId, id);
      const { error } = await db()
        .storage.from(SCREENSHOT_BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/webp', upsert: true });
      if (error) path = null;
      else summary.images += 1;
    }

    const { error } = await db()
      .from('shots')
      .insert({
        id,
        site_id: siteId,
        section: shot.section ?? null,
        device: shot.device === 'mobile' ? 'mobile' : 'desktop',
        image_path: path,
        width: shot.width ?? null,
        height: shot.height ?? null,
        colors: list(shot.colors).slice(0, MAX_COLORS),
        note: shot.note ?? '',
        created_at: iso(shot.createdAt ?? Date.now()),
      });
    if (error) throw new Error(`Could not add a screenshot: ${error.message}`);

    migrated[`shot:${shot.id}`] = id;
    summary.shots += 1;
    writeMigrated(migrated);
    step(`Uploading ${i + 1} of ${pendingShots.length} shots`);
  }

  for (const collection of pendingCollections) {
    const { data, error } = await db()
      .from('collections')
      .insert({
        name: collection.name || 'Untitled collection',
        created_at: iso(collection.createdAt ?? Date.now()),
      })
      .select('id')
      .single();
    if (error || !data) continue;
    const newId = (data as { id: string }).id;

    const members = (collection.shotIds ?? [])
      .map((shotId) => migrated[`shot:${shotId}`])
      .filter((shotId): shotId is string => Boolean(shotId));
    if (members.length) {
      await db()
        .from('collection_shots')
        .insert(
          members.map((shotId, index) => ({
            collection_id: newId,
            shot_id: shotId,
            position: index,
          })),
        );
    }
    migrated[`collection:${collection.id}`] = newId;
    summary.collections += 1;
    writeMigrated(migrated);
    step(`Uploading ${collection.name}`);
  }

  await reload();
  return summary;
}
