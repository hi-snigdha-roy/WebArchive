// Turns the raw archive into what the Library screen shows: joined rows, the
// filtered result set, and a result count for every filter option.

import { COLOR_FAMILIES, FAMILY_LABELS, familiesOf, type ColorFamily } from './colors';
import {
  DEVICES,
  INDUSTRIES,
  SECTIONS,
  SOURCES,
  UNSORTED,
  deviceLabel,
  industryLabel,
  sectionLabel,
  sectionOrder,
  type Collection,
  type Shot,
  type Site,
} from './types';

export type ViewKey = 'sections' | 'sites';
export type SortKey = 'new' | 'old' | 'az';
export type SmartFilter = 'all' | 'favorites' | 'unsorted' | 'needs';

export const SMART_FILTERS = ['all', 'favorites', 'unsorted', 'needs'] as const;
export const SMART_LABELS: Record<SmartFilter, string> = {
  all: 'All',
  favorites: 'Favourites',
  unsorted: 'Unsorted',
  needs: 'Needs details',
};

export const FILTER_GROUPS = [
  'section',
  'industry',
  'style',
  'color',
  'font',
  'source',
  'device',
  'collection',
] as const;
export type FilterGroup = (typeof FILTER_GROUPS)[number];

/** Groups that describe a shot; the rest describe its site. */
const SHOT_GROUPS: FilterGroup[] = ['section', 'device', 'color', 'collection'];

export interface FilterState {
  view: ViewKey;
  q: string;
  sort: SortKey;
  smart: SmartFilter;
  section: string[];
  industry: string[];
  style: string[];
  color: string[];
  font: string[];
  source: string[];
  device: string[];
  collection: string[];
}

export const DEFAULT_FILTERS: FilterState = {
  view: 'sections',
  q: '',
  sort: 'new',
  smart: 'all',
  section: [],
  industry: [],
  style: [],
  color: [],
  font: [],
  source: [],
  device: [],
  collection: [],
};

export interface Row {
  shot: Shot;
  site: Site;
  /** Everything searchable about this shot and its site, lower-cased. */
  hay: string;
  /** Hue families of this shot's palette, falling back to the site's. */
  families: ColorFamily[];
  /** Ids of the collections holding this shot. */
  collections: string[];
}

export interface SiteRow {
  site: Site;
  cover: Row | null;
  shotCount: number;
}

export interface GroupOption {
  value: string;
  label: string;
  count: number;
  selected: boolean;
}

export type Counts = Record<FilterGroup, Record<string, number>>;

export interface LibraryResults {
  rows: Row[];
  siteRows: SiteRow[];
  counts: Counts;
  smartCounts: Record<SmartFilter, number>;
  /** Number of tiles shown, in whichever unit the current view uses. */
  total: number;
}

export const GROUP_LABELS: Record<FilterGroup, string> = {
  section: 'Section',
  industry: 'Industry',
  style: 'Style',
  color: 'Colour',
  font: 'Font',
  source: 'Source',
  device: 'Device',
  collection: 'Collection',
};

export function labelFor(group: FilterGroup, value: string, index?: LibraryIndex): string {
  switch (group) {
    case 'collection':
      return index?.collections.find((item) => item.id === value)?.name ?? 'Collection';
    case 'section':
      return value === UNSORTED ? 'Unsorted' : sectionLabel(value as never);
    case 'industry':
      return industryLabel(value);
    case 'device':
      return deviceLabel(value);
    case 'color':
      return FAMILY_LABELS[value as ColorFamily] ?? value;
    default:
      return value;
  }
}

function siteValues(site: Site, group: FilterGroup): string[] {
  switch (group) {
    case 'industry':
      return [site.industry];
    case 'source':
      return [site.source];
    case 'style':
      return site.styles;
    case 'font':
      return [site.fonts.heading, site.fonts.body].filter((font): font is string => Boolean(font));
    default:
      return [];
  }
}

export function groupValues(row: Row, group: FilterGroup): string[] {
  switch (group) {
    case 'section':
      return [row.shot.section ?? UNSORTED];
    case 'device':
      return [row.shot.device];
    case 'color':
      return row.families;
    case 'collection':
      return row.collections;
    default:
      return siteValues(row.site, group);
  }
}

function siteHaystack(site: Site): string {
  return [
    site.name,
    site.url,
    site.sourceUrl,
    site.caseStudyUrl,
    site.designer,
    site.notes,
    ...site.styles,
    site.fonts.heading,
    site.fonts.body,
    site.industry,
    industryLabel(site.industry),
    site.source,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export interface LibraryIndex {
  rows: Row[];
  /**
   * Every site's rows in the order the library lists them (newest first, which
   * within one batch of uploads is the order the files were chosen), so a site
   * tile's cover is the shot that site leads with.
   */
  rowsBySite: Map<string, Row[]>;
  siteHay: Map<string, string>;
  sites: Site[];
  /** Free-text vocabularies, built from what is actually in the archive. */
  styles: string[];
  fonts: string[];
  collections: Collection[];
}

export function buildIndex(
  sites: Site[],
  shots: Shot[],
  collections: Collection[] = [],
): LibraryIndex {
  const siteById = new Map(sites.map((site) => [site.id, site]));
  const siteHay = new Map(sites.map((site) => [site.id, siteHaystack(site)]));

  const heldBy = new Map<string, string[]>();
  for (const collection of collections) {
    for (const shotId of collection.shotIds) {
      const bucket = heldBy.get(shotId);
      if (bucket) bucket.push(collection.id);
      else heldBy.set(shotId, [collection.id]);
    }
  }

  const rows: Row[] = [];
  for (const shot of shots) {
    const site = siteById.get(shot.siteId);
    if (!site) continue;
    const families = familiesOf(shot.colors.length ? shot.colors : site.colors);
    const base = siteHay.get(site.id) ?? '';
    const hay =
      `${base} ${shot.note} ${sectionLabel(shot.section)} ${shot.device} ${families.join(' ')}`.toLowerCase();
    rows.push({ shot, site, hay, families, collections: heldBy.get(shot.id) ?? [] });
  }

  const rowsBySite = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = rowsBySite.get(row.site.id);
    if (bucket) bucket.push(row);
    else rowsBySite.set(row.site.id, [row]);
  }
  for (const bucket of rowsBySite.values()) {
    bucket.sort((a, b) => b.shot.createdAt - a.shot.createdAt);
  }

  const collator = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' });
  const styles = [...new Set(sites.flatMap((site) => site.styles))].sort(collator);
  const fonts = [
    ...new Set(
      sites
        .flatMap((site) => [site.fonts.heading, site.fonts.body])
        .filter((font): font is string => Boolean(font)),
    ),
  ].sort(collator);

  return { rows, rowsBySite, siteHay, sites, styles, fonts, collections };
}

export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/** A site the archive still wants something from. */
export function needsDetails(site: Site, rows: Row[]): boolean {
  if (!site.fonts.heading && !site.fonts.body) return true;
  if (!site.colors.length) return true;
  if (!site.notes.trim()) return true;
  return !rows.some((row) => row.shot.hasImage);
}

/* ------------------------------------------------------------- matching */

function passes(row: Row, state: FilterState, group: FilterGroup): boolean {
  const selected = state[group];
  if (!selected.length) return true;
  const values = groupValues(row, group);
  return selected.some((value) => values.includes(value));
}

function passesSiteGroup(site: Site, state: FilterState, group: FilterGroup): boolean {
  const selected = state[group];
  if (!selected.length) return true;
  const values = siteValues(site, group);
  return selected.some((value) => values.includes(value));
}

function siteGroupsPass(site: Site, state: FilterState, skip: FilterGroup | null): boolean {
  for (const group of FILTER_GROUPS) {
    if (SHOT_GROUPS.includes(group) || group === skip) continue;
    if (!passesSiteGroup(site, state, group)) return false;
  }
  return true;
}

function shotSmartOk(row: Row, smart: SmartFilter): boolean {
  return smart !== 'unsorted' || row.shot.section === null;
}

function siteSmartOk(site: Site, smart: SmartFilter, index: LibraryIndex): boolean {
  if (smart === 'favorites') return site.favorite;
  if (smart === 'needs') return needsDetails(site, index.rowsBySite.get(site.id) ?? []);
  return true;
}

function sortRows(rows: Row[], sort: SortKey): Row[] {
  const out = [...rows];
  if (sort === 'az') {
    out.sort(
      (a, b) =>
        a.site.name.localeCompare(b.site.name, undefined, { sensitivity: 'base' }) ||
        sectionOrder(a.shot.section) - sectionOrder(b.shot.section) ||
        b.shot.createdAt - a.shot.createdAt,
    );
  } else if (sort === 'old') {
    out.sort((a, b) => a.shot.createdAt - b.shot.createdAt);
  } else {
    out.sort((a, b) => b.shot.createdAt - a.shot.createdAt);
  }
  return out;
}

function sortSiteRows(siteRows: SiteRow[], sort: SortKey): SiteRow[] {
  const out = [...siteRows];
  if (sort === 'az') {
    out.sort((a, b) => a.site.name.localeCompare(b.site.name, undefined, { sensitivity: 'base' }));
  } else if (sort === 'old') {
    out.sort((a, b) => a.site.createdAt - b.site.createdAt);
  } else {
    out.sort((a, b) => b.site.createdAt - a.site.createdAt);
  }
  return out;
}

/** Prefers a shot that actually has a screenshot, otherwise the leading one. */
function pickCover(rows: Row[]): Row | null {
  if (!rows.length) return null;
  return rows.find((row) => row.shot.hasImage) ?? rows[0];
}

function emptyCounts(): Counts {
  return {
    section: {},
    industry: {},
    style: {},
    color: {},
    font: {},
    source: {},
    device: {},
    collection: {},
  };
}

function bump(table: Record<string, number>, key: string): void {
  table[key] = (table[key] ?? 0) + 1;
}

function matchedRows(index: LibraryIndex, state: FilterState, tokens: string[]): Row[] {
  return index.rows.filter(
    (row) =>
      tokens.every((token) => row.hay.includes(token)) &&
      shotSmartOk(row, state.smart) &&
      siteSmartOk(row.site, state.smart, index) &&
      FILTER_GROUPS.every((group) => passes(row, state, group)),
  );
}

function matchedSites(index: LibraryIndex, state: FilterState, tokens: string[]): SiteRow[] {
  const shotFiltersActive =
    SHOT_GROUPS.some((group) => state[group].length > 0) || state.smart === 'unsorted';
  const out: SiteRow[] = [];

  for (const site of index.sites) {
    if (!siteGroupsPass(site, state, null)) continue;
    if (!siteSmartOk(site, state.smart, index)) continue;
    const rows = index.rowsBySite.get(site.id) ?? [];
    const eligible = rows.filter(
      (row) =>
        tokens.every((token) => row.hay.includes(token)) &&
        shotSmartOk(row, state.smart) &&
        SHOT_GROUPS.every((group) => passes(row, state, group)),
    );
    if (!eligible.length) {
      // A site with no screenshots yet can still match on its own details.
      const hay = index.siteHay.get(site.id) ?? '';
      if (shotFiltersActive || !tokens.every((token) => hay.includes(token))) continue;
    }
    out.push({ site, cover: pickCover(eligible), shotCount: eligible.length });
  }
  return out;
}

export function computeResults(index: LibraryIndex, state: FilterState): LibraryResults {
  const tokens = tokenize(state.q);
  const counts = emptyCounts();
  const sites = state.view === 'sites';

  // Each option is counted as if it alone were added to the other groups, so
  // the number answers "how many would I get if I ticked this".
  if (sites) {
    for (const group of FILTER_GROUPS) {
      const shotGroup = SHOT_GROUPS.includes(group);
      for (const site of index.sites) {
        if (!siteGroupsPass(site, state, group)) continue;
        if (!siteSmartOk(site, state.smart, index)) continue;
        const rows = index.rowsBySite.get(site.id) ?? [];
        const eligible = rows.filter(
          (row) =>
            tokens.every((token) => row.hay.includes(token)) &&
            shotSmartOk(row, state.smart) &&
            SHOT_GROUPS.every((other) => other === group || passes(row, state, other)),
        );
        if (shotGroup) {
          const seen = new Set<string>();
          for (const row of eligible) for (const value of groupValues(row, group)) seen.add(value);
          for (const value of seen) bump(counts[group], value);
        } else if (eligible.length) {
          for (const value of siteValues(site, group)) bump(counts[group], value);
        } else {
          const hay = index.siteHay.get(site.id) ?? '';
          const otherShotFilters =
            SHOT_GROUPS.some((other) => other !== group && state[other].length > 0) ||
            state.smart === 'unsorted';
          if (!otherShotFilters && tokens.every((token) => hay.includes(token))) {
            for (const value of siteValues(site, group)) bump(counts[group], value);
          }
        }
      }
    }
  } else {
    const searched = index.rows.filter(
      (row) =>
        tokens.every((token) => row.hay.includes(token)) &&
        shotSmartOk(row, state.smart) &&
        siteSmartOk(row.site, state.smart, index),
    );
    for (const group of FILTER_GROUPS) {
      for (const row of searched) {
        if (!FILTER_GROUPS.every((other) => other === group || passes(row, state, other))) continue;
        for (const value of groupValues(row, group)) bump(counts[group], value);
      }
    }
  }

  const smartCounts = {} as Record<SmartFilter, number>;
  for (const smart of SMART_FILTERS) {
    const variant = { ...state, smart };
    smartCounts[smart] = sites
      ? matchedSites(index, variant, tokens).length
      : matchedRows(index, variant, tokens).length;
  }

  if (sites) {
    const siteRows = sortSiteRows(matchedSites(index, state, tokens), state.sort);
    return { rows: [], siteRows, counts, smartCounts, total: siteRows.length };
  }
  const rows = sortRows(matchedRows(index, state, tokens), state.sort);
  return { rows, siteRows: [], counts, smartCounts, total: rows.length };
}

/* -------------------------------------------------------------- options */

export function optionsFor(group: FilterGroup, index: LibraryIndex): string[] {
  switch (group) {
    case 'section':
      return [...SECTIONS, UNSORTED];
    case 'industry':
      return [...INDUSTRIES];
    case 'source':
      return [...SOURCES];
    case 'device':
      return [...DEVICES];
    case 'color':
      return [...COLOR_FAMILIES];
    case 'style':
      return index.styles;
    case 'font':
      return index.fonts;
    case 'collection':
      return index.collections.map((collection) => collection.id);
  }
}

/** Options with no results are hidden, but a selected option always stays. */
export function visibleOptions(
  group: FilterGroup,
  counts: Counts,
  state: FilterState,
  index: LibraryIndex,
): GroupOption[] {
  const selected = state[group];
  return optionsFor(group, index)
    .map((value) => ({
      value,
      label: labelFor(group, value, index),
      count: counts[group][value] ?? 0,
      selected: selected.includes(value),
    }))
    .filter((option) => option.count > 0 || option.selected);
}

export interface Chip {
  group: FilterGroup;
  value: string;
  label: string;
  groupLabel: string;
}

export function activeChips(state: FilterState, index?: LibraryIndex): Chip[] {
  const chips: Chip[] = [];
  for (const group of FILTER_GROUPS) {
    for (const value of state[group]) {
      chips.push({
        group,
        value,
        label: labelFor(group, value, index),
        groupLabel: GROUP_LABELS[group],
      });
    }
  }
  return chips;
}

export function hasActiveFilters(state: FilterState): boolean {
  return FILTER_GROUPS.some((group) => state[group].length > 0) || state.smart !== 'all';
}

export function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** Screenshots keep their own proportions; placeholders get a sensible default. */
export function shotAspect(shot: Shot): number {
  if (shot.width && shot.height) return shot.width / shot.height;
  return shot.device === 'mobile' ? 10 / 16 : 16 / 10;
}
