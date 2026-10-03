'use client';

// The query string IS the filter state: there is no mirrored copy to keep in
// sync. Reads come straight from the URL, writes use replaceState so flipping
// filters never fills up the history, and both the back button and links from
// other screens work without any extra plumbing.

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { COLOR_FAMILIES } from './colors';
import {
  DEFAULT_FILTERS,
  FILTER_GROUPS,
  SMART_FILTERS,
  type FilterGroup,
  type FilterState,
  type SmartFilter,
  type SortKey,
  type ViewKey,
  toggleValue,
} from './library';
import { DEVICES, INDUSTRIES, SECTIONS, SOURCES, UNSORTED } from './types';

/** Style and Font are free text from the archive itself, so anything goes. */
const ALLOWED: Partial<Record<FilterGroup, Set<string>>> = {
  section: new Set<string>([...SECTIONS, UNSORTED]),
  industry: new Set<string>(INDUSTRIES),
  source: new Set<string>(SOURCES),
  device: new Set<string>(DEVICES),
  color: new Set<string>(COLOR_FAMILIES),
  // Style, Font and Collection carry values from the archive itself.
};

const CHANGED = 'ia:filters';

export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);
  const view: ViewKey = params.get('view') === 'sites' ? 'sites' : 'sections';
  const rawSort = params.get('sort');
  const sort: SortKey = rawSort === 'old' || rawSort === 'az' ? rawSort : 'new';
  const rawSmart = params.get('smart');
  const smart: SmartFilter = (SMART_FILTERS as readonly string[]).includes(rawSmart ?? '')
    ? (rawSmart as SmartFilter)
    : 'all';
  const state: FilterState = {
    ...DEFAULT_FILTERS,
    view,
    sort,
    smart,
    q: params.get('q') ?? '',
  };
  for (const group of FILTER_GROUPS) {
    const raw = params.get(group);
    if (!raw) continue;
    const allowed = ALLOWED[group];
    const values = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 80)
      .filter((value) => !allowed || allowed.has(value));
    state[group] = [...new Set(values)];
  }
  return state;
}

export function filtersToSearch(state: FilterState): string {
  const parts: string[] = [];
  if (state.view !== DEFAULT_FILTERS.view) parts.push(`view=${state.view}`);
  const q = state.q.trim();
  if (q) parts.push(`q=${encodeURIComponent(q)}`);
  if (state.sort !== DEFAULT_FILTERS.sort) parts.push(`sort=${state.sort}`);
  if (state.smart !== DEFAULT_FILTERS.smart) parts.push(`smart=${state.smart}`);
  for (const group of FILTER_GROUPS) {
    if (state[group].length) {
      parts.push(`${group}=${state[group].map(encodeURIComponent).join(',')}`);
    }
  }
  return parts.join('&');
}

/** Builds a library link that lands with one filter already applied. */
export function libraryHref(group: FilterGroup, value: string): string {
  const search = filtersToSearch({ ...DEFAULT_FILTERS, [group]: [value] });
  return search ? `/?${search}` : '/';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function getSearch(): string {
  return window.location.search;
}

function getServerSearch(): string {
  return '';
}

function commit(next: FilterState): void {
  const search = filtersToSearch(next);
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
  if (url !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', url);
  }
  window.dispatchEvent(new Event(CHANGED));
}

function mutate(change: (previous: FilterState) => FilterState): void {
  commit(change(parseFilters(window.location.search)));
}

export interface FilterActions {
  setView: (view: ViewKey) => void;
  setQuery: (query: string) => void;
  setSort: (sort: SortKey) => void;
  setSmart: (smart: SmartFilter) => void;
  toggle: (group: FilterGroup, value: string) => void;
  only: (group: FilterGroup, value: string) => void;
  remove: (group: FilterGroup, value: string) => void;
  clearAll: () => void;
}

export function useFilterState(): { filters: FilterState; actions: FilterActions } {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const filters = useMemo(() => parseFilters(search), [search]);

  const setView = useCallback((view: ViewKey) => mutate((prev) => ({ ...prev, view })), []);
  const setQuery = useCallback((q: string) => mutate((prev) => ({ ...prev, q })), []);
  const setSort = useCallback((sort: SortKey) => mutate((prev) => ({ ...prev, sort })), []);
  const setSmart = useCallback((smart: SmartFilter) => mutate((prev) => ({ ...prev, smart })), []);

  const toggle = useCallback((group: FilterGroup, value: string) => {
    mutate((prev) => ({ ...prev, [group]: toggleValue(prev[group], value) }));
  }, []);

  const only = useCallback((group: FilterGroup, value: string) => {
    mutate((prev) => ({ ...prev, [group]: [value] }));
  }, []);

  const remove = useCallback((group: FilterGroup, value: string) => {
    mutate((prev) => ({ ...prev, [group]: prev[group].filter((item) => item !== value) }));
  }, []);

  const clearAll = useCallback(() => {
    mutate((prev) => ({ ...DEFAULT_FILTERS, view: prev.view, sort: prev.sort, q: prev.q }));
  }, []);

  return {
    filters,
    actions: { setView, setQuery, setSort, setSmart, toggle, only, remove, clearAll },
  };
}
