'use client';

// EVERY read and write of archive data goes through this file. Nothing else in
// the app imports Dexie or knows that storage is IndexedDB, so Phase 4 can
// replace the body of these functions with Supabase without touching the UI.

import Dexie, { type Table } from 'dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback } from 'react';
import { extractColors, mergePalette, pruneRoles } from './colors';
import { DEMO_SITES } from './demo-data';
import { processImage } from './image';
import {
  MAX_COLORS,
  type ColorRoles,
  type Collection,
  type Device,
  type Industry,
  type Section,
  type Fonts,
  type Shot,
  type Site,
  type Source,
} from './types';
import { blobToDataUrl, dataUrlToBlob, uid } from './utils';

/** Stored shape of a shot: the bytes live in their own table (see images). */
type ShotRow = Omit<Shot, 'image'>;

interface ImageRow {
  shotId: string;
  blob: Blob;
}

interface MetaRow {
  key: string;
  value: unknown;
}

class ArchiveDatabase extends Dexie {
  sites!: Table<Site, string>;
  shots!: Table<ShotRow, string>;
  images!: Table<ImageRow, string>;
  collections!: Table<Collection, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('inspiration-archive');
    this.version(1).stores({
      sites: 'id, createdAt, updatedAt, name',
      shots: 'id, siteId, createdAt',
      images: 'shotId',
      collections: 'id, createdAt',
      meta: 'key',
    });
  }
}

let instance: ArchiveDatabase | null = null;

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Created lazily so importing this module during server rendering is harmless. */
function db(): ArchiveDatabase {
  if (!instance) instance = new ArchiveDatabase();
  return instance;
}

function requireDb(): ArchiveDatabase {
  if (!available()) throw new Error('This browser has no local storage available.');
  return db();
}

const NO_SITES: Site[] = [];
const NO_SHOTS: Shot[] = [];
const NO_COLLECTIONS: Collection[] = [];

/* ------------------------------------------------------------------ reading */

export interface LibrarySnapshot {
  sites: Site[];
  shots: Shot[];
  collections: Collection[];
  /** False until the first read has come back, so the UI can hold its breath. */
  ready: boolean;
}

export function useLibrary(): LibrarySnapshot {
  const data = useLiveQuery(async () => {
    if (!available()) return null;
    const [sites, shots, collections] = await Promise.all([
      db().sites.toArray(),
      db().shots.toArray(),
      db().collections.toArray(),
    ]);
    return { sites, shots, collections };
  }, []);

  return {
    sites: data?.sites ?? NO_SITES,
    shots: data?.shots ?? NO_SHOTS,
    collections: data?.collections ?? NO_COLLECTIONS,
    ready: data !== undefined,
  };
}

export interface SiteSnapshot {
  site: Site | null;
  shots: Shot[];
  ready: boolean;
}

export function useSite(siteId: string): SiteSnapshot {
  const data = useLiveQuery(async () => {
    if (!available()) return null;
    const site = (await db().sites.get(siteId)) ?? null;
    if (!site) return { site: null, shots: [] as ShotRow[] };
    const shots = await db().shots.where('siteId').equals(siteId).toArray();
    return { site, shots };
  }, [siteId]);

  return {
    site: data?.site ?? null,
    shots: data?.shots ?? NO_SHOTS,
    ready: data !== undefined,
  };
}

/** The bytes for one shot. Tiles ask for these only once they scroll into view. */
export async function getShotImage(shotId: string): Promise<Blob | undefined> {
  if (!available()) return undefined;
  const row = await db().images.get(shotId);
  return row?.blob;
}

export async function getShot(shotId: string): Promise<Shot | undefined> {
  if (!available()) return undefined;
  const row = await db().shots.get(shotId);
  if (!row) return undefined;
  const image = await getShotImage(shotId);
  return { ...row, image };
}

/* --------------------------------------------------------------- small flags */

export async function setFlag(key: string, value: boolean): Promise<void> {
  if (!available()) return;
  await db().meta.put({ key, value });
}

export function useFlag(key: string): [boolean, (value: boolean) => void] {
  const value = useLiveQuery(
    async () => {
      if (!available()) return false;
      const row = await db().meta.get(key);
      return row?.value === true;
    },
    [key],
    false,
  );
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
  fonts: { heading?: string; body?: string };
  colors: string[];
  notes: string;
  caseStudyUrl?: string;
}

export interface ShotInput {
  section: Section | null;
  device: Device;
  note?: string;
  /** Converted to WebP and downscaled on the way in. */
  file?: Blob;
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

async function touchSite(siteId: string): Promise<void> {
  await db().sites.update(siteId, { updatedAt: Date.now() });
}

/** Colours found in new screenshots join the site's palette, up to the cap. */
async function mergeIntoSitePalette(siteId: string, colors: string[]): Promise<void> {
  if (!colors.length) return;
  const site = await db().sites.get(siteId);
  if (!site) return;
  const merged = mergePalette(site.colors, colors, MAX_COLORS);
  if (merged.length !== site.colors.length) {
    await db().sites.update(siteId, { colors: merged, updatedAt: Date.now() });
  }
}

export async function addSite(
  input: SiteInput,
  shots: ShotInput[] = [],
): Promise<{ siteId: string; shotIds: string[] }> {
  requireDb();
  const now = Date.now();
  const site: Site = {
    id: uid(),
    name: input.name.trim() || 'Untitled',
    url: text(input.url),
    sourceUrl: text(input.sourceUrl),
    source: input.source,
    designer: text(input.designer),
    industry: input.industry,
    styles: list(input.styles),
    fonts: fonts(input.fonts),
    colors: list(input.colors).slice(0, MAX_COLORS),
    notes: input.notes?.trim() ?? '',
    caseStudyUrl: text(input.caseStudyUrl),
    favorite: false,
    createdAt: now,
    updatedAt: now,
  };
  await db().sites.add(site);
  const shotIds = await addShots(site.id, shots);
  return { siteId: site.id, shotIds };
}

export async function addShots(siteId: string, inputs: ShotInput[]): Promise<string[]> {
  requireDb();
  if (!inputs.length) return [];
  const base = Date.now();
  const ids: string[] = [];
  const found: string[] = [];

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    // Images are processed outside the transaction: awaiting anything that is
    // not a Dexie promise inside one would abort it.
    const processed = input.file ? await processImage(input.file) : null;
    const colors = processed ? await extractColors(processed.blob) : [];
    found.push(...colors);
    const id = uid();
    const row: ShotRow = {
      id,
      siteId,
      section: input.section ?? null,
      device: input.device,
      hasImage: processed !== null,
      width: processed?.width,
      height: processed?.height,
      colors,
      note: input.note?.trim() ?? '',
      // Newest-first then shows the files in the order they were chosen.
      createdAt: base + (inputs.length - 1 - i),
    };
    await db().transaction('rw', db().shots, db().images, async () => {
      await db().shots.add(row);
      if (processed) await db().images.put({ shotId: id, blob: processed.blob });
    });
    ids.push(id);
  }

  await mergeIntoSitePalette(siteId, found);
  await touchSite(siteId);
  return ids;
}

export type SitePatch = Partial<Omit<Site, 'id' | 'createdAt' | 'updatedAt'>>;

export async function updateSite(siteId: string, patch: SitePatch): Promise<void> {
  requireDb();
  const next: SitePatch & { updatedAt: number } = { ...patch, updatedAt: Date.now() };
  if (patch.name !== undefined) next.name = patch.name.trim() || 'Untitled';
  if (patch.styles) next.styles = list(patch.styles);
  if (patch.colors) next.colors = list(patch.colors).slice(0, MAX_COLORS);
  if (patch.fonts) next.fonts = fonts(patch.fonts);

  // A role may only point at a colour the palette still holds.
  if (patch.colors || patch.colorRoles) {
    const current = await db().sites.get(siteId);
    const colors = next.colors ?? current?.colors ?? [];
    const roles: ColorRoles = next.colorRoles ?? current?.colorRoles ?? {};
    next.colorRoles = pruneRoles(colors, roles);
  }

  await db().sites.update(siteId, next);
}

export async function toggleFavorite(siteId: string): Promise<boolean> {
  requireDb();
  const site = await db().sites.get(siteId);
  if (!site) return false;
  const favorite = !site.favorite;
  await db().sites.update(siteId, { favorite, updatedAt: Date.now() });
  return favorite;
}

export type ShotPatch = Partial<Pick<Shot, 'section' | 'device' | 'note' | 'colors'>>;

export async function updateShot(shotId: string, patch: ShotPatch): Promise<void> {
  requireDb();
  const next: ShotPatch = { ...patch };
  if (patch.colors) next.colors = list(patch.colors).slice(0, MAX_COLORS);
  if (patch.note !== undefined) next.note = patch.note.trim();
  await db().shots.update(shotId, next);
  const shot = await db().shots.get(shotId);
  if (shot) await touchSite(shot.siteId);
}

export async function setShotImage(shotId: string, file: Blob): Promise<void> {
  requireDb();
  const processed = await processImage(file);
  const colors = await extractColors(processed.blob);
  await db().transaction('rw', db().shots, db().images, async () => {
    await db().images.put({ shotId, blob: processed.blob });
    await db().shots.update(shotId, {
      hasImage: true,
      width: processed.width,
      height: processed.height,
      colors,
    });
  });
  const shot = await db().shots.get(shotId);
  if (shot) {
    await mergeIntoSitePalette(shot.siteId, colors);
    await touchSite(shot.siteId);
  }
}

async function detachFromCollections(shotIds: string[]): Promise<void> {
  if (!shotIds.length) return;
  const gone = new Set(shotIds);
  const collections = await db().collections.toArray();
  for (const collection of collections) {
    const kept = collection.shotIds.filter((id) => !gone.has(id));
    if (kept.length !== collection.shotIds.length) {
      await db().collections.update(collection.id, { shotIds: kept });
    }
  }
}

export async function deleteShot(shotId: string): Promise<void> {
  requireDb();
  const shot = await db().shots.get(shotId);
  await db().transaction('rw', db().shots, db().images, db().collections, async () => {
    await db().images.delete(shotId);
    await db().shots.delete(shotId);
    await detachFromCollections([shotId]);
  });
  if (shot) await touchSite(shot.siteId);
}

export async function deleteSite(siteId: string): Promise<void> {
  requireDb();
  const shotIds = (await db().shots.where('siteId').equals(siteId).primaryKeys()) as string[];
  await db().transaction('rw', db().sites, db().shots, db().images, db().collections, async () => {
    await db().images.bulkDelete(shotIds);
    await db().shots.bulkDelete(shotIds);
    await db().sites.delete(siteId);
    await detachFromCollections(shotIds);
  });
}

/* ---------------------------------------------------------------- demo data */

export const DEMO_BANNER_DISMISSED = 'demoBannerDismissed';

let seeding: Promise<void> | null = null;

/** Loads the demo sites the first time the archive is opened, and only then. */
export function ensureSeeded(): Promise<void> {
  if (!available()) return Promise.resolve();
  if (!seeding) seeding = seed();
  return seeding;
}

async function seed(): Promise<void> {
  const flag = await db().meta.get('seeded');
  if (flag?.value === true) return;

  if ((await db().sites.count()) > 0) {
    await db().meta.put({ key: 'seeded', value: true });
    return;
  }

  const base = Date.now();
  const sites: Site[] = [];
  const shots: ShotRow[] = [];

  DEMO_SITES.forEach((entry, index) => {
    const createdAt = base - index * 100_000;
    const siteId = uid();
    sites.push({
      id: siteId,
      name: entry.name,
      url: entry.url,
      sourceUrl: entry.sourceUrl,
      source: entry.source,
      designer: entry.designer,
      industry: entry.industry,
      styles: entry.styles,
      fonts: {},
      colors: [],
      notes: '',
      favorite: false,
      isDemo: true,
      createdAt,
      updatedAt: createdAt,
    });
    entry.shots.forEach((shot, order) => {
      shots.push({
        id: uid(),
        siteId,
        section: shot.section,
        device: shot.device ?? 'desktop',
        hasImage: false,
        colors: [],
        note: shot.note ?? '',
        createdAt: createdAt - order * 1000,
      });
    });
  });

  await db().transaction('rw', db().sites, db().shots, db().meta, async () => {
    await db().sites.bulkAdd(sites);
    await db().shots.bulkAdd(shots);
    await db().meta.put({ key: 'seeded', value: true });
  });
}

export async function removeDemoData(): Promise<void> {
  requireDb();
  const demoSites = await db().sites.filter((site) => site.isDemo === true).toArray();
  const demoIds = demoSites.map((site) => site.id);
  if (!demoIds.length) {
    await setFlag(DEMO_BANNER_DISMISSED, true);
    return;
  }
  const wanted = new Set(demoIds);
  const shotIds = (await db()
    .shots.filter((shot) => wanted.has(shot.siteId))
    .primaryKeys()) as string[];

  await db().transaction(
    'rw',
    db().sites,
    db().shots,
    db().images,
    db().collections,
    db().meta,
    async () => {
      await db().images.bulkDelete(shotIds);
      await db().shots.bulkDelete(shotIds);
      await db().sites.bulkDelete(demoIds);
      await detachFromCollections(shotIds);
      await db().meta.put({ key: DEMO_BANNER_DISMISSED, value: true });
    },
  );
}

/* ------------------------------------------------------------ backup */

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
  requireDb();
  const [sites, shots, collections] = await Promise.all([
    db().sites.toArray(),
    db().shots.toArray(),
    db().collections.toArray(),
  ]);

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

interface ExportedShot extends Omit<ShotRow, 'id' | 'siteId'> {
  id: string;
  siteId: string;
  image?: string;
}

/**
 * Adds everything in the file to the archive under fresh ids. Nothing already
 * saved is touched, so a restore can never take data away.
 */
export async function importArchive(file: Blob): Promise<ImportSummary> {
  requireDb();
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

  const siteIds = new Map<string, string>();
  const shotIds = new Map<string, string>();
  const sites: Site[] = [];

  for (const site of payload.sites) {
    if (!site?.id) continue;
    const id = uid();
    siteIds.set(site.id, id);
    sites.push({
      ...site,
      id,
      // Imported work is yours, not demo data the banner may offer to delete.
      isDemo: undefined,
      styles: list(site.styles),
      colors: list(site.colors).slice(0, MAX_COLORS),
      colorRoles: pruneRoles(list(site.colors).slice(0, MAX_COLORS), site.colorRoles),
      fonts: fonts(site.fonts),
      notes: site.notes ?? '',
      favorite: Boolean(site.favorite),
      createdAt: site.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  }

  const rows: ShotRow[] = [];
  const images: ImageRow[] = [];

  for (const shot of payload.shots ?? []) {
    const siteId = siteIds.get(shot?.siteId ?? '');
    if (!siteId) continue;
    const id = uid();
    shotIds.set(shot.id, id);
    const blob = shot.image ? dataUrlToBlob(shot.image) : null;
    if (blob) images.push({ shotId: id, blob });
    rows.push({
      id,
      siteId,
      section: shot.section ?? null,
      device: shot.device === 'mobile' ? 'mobile' : 'desktop',
      hasImage: Boolean(blob),
      width: shot.width,
      height: shot.height,
      colors: list(shot.colors).slice(0, MAX_COLORS),
      note: shot.note ?? '',
      createdAt: shot.createdAt ?? Date.now(),
    });
  }

  const collections: Collection[] = (payload.collections ?? [])
    .filter((collection) => collection?.id)
    .map((collection) => ({
      id: uid(),
      name: collection.name ?? 'Collection',
      shotIds: (collection.shotIds ?? [])
        .map((shotId) => shotIds.get(shotId))
        .filter((shotId): shotId is string => Boolean(shotId)),
      createdAt: collection.createdAt ?? Date.now(),
    }));

  await db().transaction(
    'rw',
    db().sites,
    db().shots,
    db().images,
    db().collections,
    async () => {
      await db().sites.bulkAdd(sites);
      await db().shots.bulkAdd(rows);
      if (images.length) await db().images.bulkAdd(images);
      if (collections.length) await db().collections.bulkAdd(collections);
    },
  );

  return { sites: sites.length, shots: rows.length, images: images.length };
}

/* ------------------------------------------------------------ collections */

export async function createCollection(name: string): Promise<string> {
  requireDb();
  const id = uid();
  await db().collections.add({
    id,
    name: name.trim() || 'Untitled collection',
    shotIds: [],
    createdAt: Date.now(),
  });
  return id;
}

export async function renameCollection(collectionId: string, name: string): Promise<void> {
  requireDb();
  await db().collections.update(collectionId, {
    name: name.trim() || 'Untitled collection',
  });
}

export async function deleteCollection(collectionId: string): Promise<void> {
  requireDb();
  await db().collections.delete(collectionId);
}

/** Adds only the shots that are not in the collection already. */
export async function addToCollection(
  collectionId: string,
  shotIds: string[],
): Promise<number> {
  requireDb();
  const collection = await db().collections.get(collectionId);
  if (!collection) return 0;
  const held = new Set(collection.shotIds);
  const added = shotIds.filter((shotId) => !held.has(shotId));
  if (!added.length) return 0;
  await db().collections.update(collectionId, { shotIds: [...collection.shotIds, ...added] });
  return added.length;
}

export async function removeFromCollection(
  collectionId: string,
  shotId: string,
): Promise<void> {
  requireDb();
  const collection = await db().collections.get(collectionId);
  if (!collection) return;
  await db().collections.update(collectionId, {
    shotIds: collection.shotIds.filter((id) => id !== shotId),
  });
}

/** Writes a whole new order, dropping any id the collection no longer holds. */
export async function setCollectionOrder(
  collectionId: string,
  shotIds: string[],
): Promise<void> {
  requireDb();
  const collection = await db().collections.get(collectionId);
  if (!collection) return;
  const held = new Set(collection.shotIds);
  const next = shotIds.filter((shotId) => held.has(shotId));
  for (const shotId of collection.shotIds) {
    if (!next.includes(shotId)) next.push(shotId);
  }
  await db().collections.update(collectionId, { shotIds: next });
}
