'use client';

// Reads the archive that earlier phases kept in this browser's IndexedDB, so it
// can be lifted into Supabase. Nothing here writes or deletes: the old data is
// left exactly as it was, as a fallback.
//
// Opened with the raw IndexedDB API rather than Dexie, so the app no longer
// carries a database library just to read the thing it replaced.

const LEGACY_DB = 'inspiration-archive';

export interface LegacySite {
  id: string;
  name: string;
  url?: string;
  sourceUrl?: string;
  caseStudyUrl?: string;
  source?: string;
  designer?: string;
  industry?: string;
  styles?: string[];
  fonts?: Record<string, string>;
  colors?: string[];
  colorRoles?: Record<string, string>;
  notes?: string;
  favorite?: boolean;
  isDemo?: boolean;
  createdAt?: number;
}

export interface LegacyShot {
  id: string;
  siteId: string;
  section?: string | null;
  device?: string;
  hasImage?: boolean;
  width?: number;
  height?: number;
  colors?: string[];
  note?: string;
  createdAt?: number;
}

export interface LegacyCollection {
  id: string;
  name: string;
  shotIds?: string[];
  createdAt?: number;
}

export interface LegacyArchive {
  sites: LegacySite[];
  shots: LegacyShot[];
  collections: LegacyCollection[];
  images: Map<string, Blob>;
}

function openLegacy(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    let created = false;
    const request = indexedDB.open(LEGACY_DB);
    // Opening a name that does not exist creates an empty database. If that
    // happens there was nothing to import, and we tidy it away again.
    request.onupgradeneeded = () => {
      created = true;
    };
    request.onsuccess = () => {
      const database = request.result;
      if (created || !database.objectStoreNames.contains('sites')) {
        database.close();
        if (created) indexedDB.deleteDatabase(LEGACY_DB);
        resolve(null);
        return;
      }
      resolve(database);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readAll<T>(database: IDBDatabase, store: string): Promise<T[]> {
  if (!database.objectStoreNames.contains(store)) return Promise.resolve([]);
  return new Promise((resolve) => {
    const request = database.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve((request.result ?? []) as T[]);
    request.onerror = () => resolve([]);
  });
}

/** How much is sitting in the old browser store, without reading the images. */
export async function countLegacyArchive(): Promise<{
  sites: number;
  shots: number;
  collections: number;
} | null> {
  const database = await openLegacy();
  if (!database) return null;
  try {
    const [sites, shots, collections] = await Promise.all([
      readAll<LegacySite>(database, 'sites'),
      readAll<LegacyShot>(database, 'shots'),
      readAll<LegacyCollection>(database, 'collections'),
    ]);
    return { sites: sites.length, shots: shots.length, collections: collections.length };
  } finally {
    database.close();
  }
}

export async function readLegacyArchive(): Promise<LegacyArchive | null> {
  const database = await openLegacy();
  if (!database) return null;
  try {
    const [sites, shots, collections, imageRows] = await Promise.all([
      readAll<LegacySite>(database, 'sites'),
      readAll<LegacyShot>(database, 'shots'),
      readAll<LegacyCollection>(database, 'collections'),
      readAll<{ shotId: string; blob: Blob }>(database, 'images'),
    ]);
    const images = new Map<string, Blob>();
    for (const row of imageRows) {
      if (row?.shotId && row.blob) images.set(row.shotId, row.blob);
    }
    return { sites, shots, collections, images };
  } finally {
    database.close();
  }
}
