'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AddSiteModal } from './add-site-modal';
import { BookmarkletModal } from './bookmarklet-modal';
import { AddToCollection } from './collection-menu';
import { DemoBanner } from './demo-banner';
import { FilterRail } from './filter-rail';
import {
  BookmarkIcon,
  CloseIcon,
  DownloadIcon,
  FiltersIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  SectionsIcon,
  SitesIcon,
  UploadIcon,
} from './icons';
import { MasonryGrid, PLACEHOLDER_MIN_HEIGHT, type MasonryEntry } from './masonry';
import { ShotViewer } from './shot-viewer';
import { ThemeToggle } from './theme';
import { ShotTile, SiteTile } from './tiles';
import { Button, IconButton, Menu, MenuItem, Segmented, Select } from './ui';
import { useDebounced, useScrollLock } from '@/lib/hooks';
import { parseFilters, useFilterState } from '@/lib/filter-url';
import {
  SMART_LABELS,
  activeChips,
  buildIndex,
  computeResults,
  hasActiveFilters,
  shotAspect,
  type SortKey,
  type ViewKey,
} from '@/lib/library';
import { ensureSeeded, exportArchive, importArchive, useLibrary } from '@/lib/store';
import { downloadBlob, plural } from '@/lib/utils';
import { isImageFile } from '@/lib/image';
import { useToast } from './toast';

const HEADER = 104;

/** True when the keystroke or paste belongs to a field rather than the page. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/** The search term the page was opened with, read once. */
function useArrivalQuery(): string {
  const [arrival] = useState(() =>
    typeof window === 'undefined' ? '' : parseFilters(window.location.search).q,
  );
  return arrival;
}

export function LibraryScreen() {
  const { sites, shots, collections, ready } = useLibrary();
  const { filters, actions } = useFilterState();
  const [adding, setAdding] = useState<{ url?: string; name?: string; files?: File[] } | null>(
    null,
  );
  const [bookmarklet, setBookmarklet] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const searchField = useRef<HTMLInputElement>(null);
  const importField = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    void ensureSeeded();
  }, []);

  // The bookmarklet lands on /?add=1&url=…&title=… . Read it once, then take
  // those parameters back out of the address bar so a reload stays quiet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') !== '1') return;
    const url = params.get('url') ?? undefined;
    const name = params.get('title') ?? undefined;
    for (const key of ['add', 'url', 'title']) params.delete(key);
    const search = params.toString();
    window.history.replaceState(
      null,
      '',
      search ? `${window.location.pathname}?${search}` : window.location.pathname,
    );
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdding({ url, name });
  }, []);

  const typed = useDebounced(filters.q, 150);
  // Typing is debounced, but a query already in the address bar on arrival
  // applies at once, so a reload never flashes the unfiltered library.
  const arrived = useArrivalQuery();
  const query = filters.q === arrived && typed !== filters.q ? filters.q : typed;

  const index = useMemo(() => buildIndex(sites, shots, collections), [sites, shots, collections]);
  const results = useMemo(
    () => computeResults(index, { ...filters, q: query }),
    [index, filters, query],
  );

  const fontSuggestions = useMemo(
    () =>
      [
        ...new Set(
          sites
            .flatMap((site) => [site.fonts.heading, site.fonts.body])
            .filter((font): font is string => Boolean(font)),
        ),
      ].sort(),
    [sites],
  );
  const styleSuggestions = useMemo(
    () => [...new Set(sites.flatMap((site) => site.styles))].sort(),
    [sites],
  );
  const hasDemo = useMemo(() => sites.some((site) => site.isDemo), [sites]);
  const chips = activeChips(filters, index);
  const filtered = hasActiveFilters(filters) || filters.q.trim().length > 0;

  useScrollLock(sheetOpen);

  const leaveSelection = () => {
    setSelecting(false);
    setSelected([]);
  };

  const busy = adding !== null || viewerIndex !== null;

  useEffect(() => {
    if (busy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        setAdding({});
      } else if (event.key === '/') {
        event.preventDefault();
        searchField.current?.focus();
        searchField.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy]);

  // Pasting an image or a link anywhere starts the add flow already filled in.
  useEffect(() => {
    if (busy) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isTyping(event.target)) return;
      const data = event.clipboardData;
      if (!data) return;
      const files = [...data.files].filter(isImageFile);
      if (files.length) {
        event.preventDefault();
        setAdding({ files });
        return;
      }
      const text = data.getData('text/plain').trim();
      if (/^(https?:\/\/|www\.)\S+$/i.test(text)) {
        event.preventDefault();
        setAdding({ url: text });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [busy]);

  const exportBackup = useCallback(async () => {
    toast('Preparing backup');
    try {
      const blob = await exportArchive();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `inspiration-archive-${stamp}.json`);
      toast('Backup saved');
    } catch {
      toast('That backup could not be built');
    }
  }, [toast]);

  const importBackup = useCallback(
    async (file: File) => {
      toast('Reading backup');
      try {
        const summary = await importArchive(file);
        toast(`Added ${plural(summary.sites, 'site')} and ${plural(summary.shots, 'shot')}`);
      } catch (problem) {
        toast(problem instanceof Error ? problem.message : 'That backup could not be read');
      }
    },
    [toast],
  );

  const entries: MasonryEntry[] =
    filters.view === 'sites'
      ? results.siteRows.map((siteRow) => ({
          key: siteRow.site.id,
          aspect: siteRow.cover ? shotAspect(siteRow.cover.shot) : 16 / 10,
          minHeight: siteRow.cover?.shot.hasImage ? undefined : PLACEHOLDER_MIN_HEIGHT,
          node: <SiteTile siteRow={siteRow} />,
        }))
      : results.rows.map((row, position) => ({
          key: row.shot.id,
          aspect: shotAspect(row.shot),
          minHeight: row.shot.hasImage ? undefined : PLACEHOLDER_MIN_HEIGHT,
          node: (
            <ShotTile
              row={row}
              onOpen={() => setViewerIndex(position)}
              selecting={selecting}
              selected={selected.includes(row.shot.id)}
              onToggleSelect={() =>
                setSelected((previous) =>
                  previous.includes(row.shot.id)
                    ? previous.filter((id) => id !== row.shot.id)
                    : [...previous, row.shot.id],
                )
              }
            />
          ),
        }));

  const sortSelect = (
    <Select
      aria-label="Sort"
      value={filters.sort}
      wrapperClassName="w-[132px]"
      onChange={(event) => actions.setSort(event.target.value as SortKey)}
    >
      <option value="new">Newest</option>
      <option value="old">Oldest</option>
      <option value="az">A–Z</option>
    </Select>
  );

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-canvas">
        <div className="flex h-14 items-center gap-2 border-b border-hairline px-4">
          <Link href="/" className="min-w-0 truncate text-15 font-medium">
            Inspiration Archive
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Menu label="More" icon={<MoreIcon />}>
              {(close) => (
                <>
                  <MenuItem
                    onClick={() => {
                      close();
                      void exportBackup();
                    }}
                  >
                    <DownloadIcon />
                    Export backup
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      importField.current?.click();
                    }}
                  >
                    <UploadIcon />
                    Import backup
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      setBookmarklet(true);
                    }}
                  >
                    <BookmarkIcon />
                    Get the bookmarklet
                  </MenuItem>
                </>
              )}
            </Menu>
            <ThemeToggle />
            <Button variant="primary" onClick={() => setAdding({})}>
              <PlusIcon />
              Add site
            </Button>
          </div>
        </div>
        <div className="flex h-12 items-center gap-2 border-b border-hairline px-4">
          <div className="relative flex min-w-0 flex-1 items-center">
            <SearchIcon className="pointer-events-none absolute left-2.5 text-muted" />
            <input
              ref={searchField}
              type="search"
              value={filters.q}
              onChange={(event) => actions.setQuery(event.target.value)}
              placeholder="Search notes, fonts, styles, designers"
              aria-label="Search the archive"
              title="Press / to search"
              className="h-9 w-full rounded-[4px] border border-hairline bg-surface pl-8 pr-2.5 text-15 outline-none transition-colors duration-150 motion-ease hover:border-muted"
            />
          </div>
          <Segmented
            label="View"
            compact
            value={filters.view}
            onChange={(view: ViewKey) => {
              leaveSelection();
              actions.setView(view);
            }}
            options={[
              { value: 'sections', label: 'Sections', icon: <SectionsIcon /> },
              { value: 'sites', label: 'Sites', icon: <SitesIcon /> },
            ]}
          />
          <Button
            className="lg:hidden"
            aria-label="Filters"
            onClick={() => setSheetOpen(true)}
          >
            <FiltersIcon />
            <span className="hidden sm:inline">Filters</span>
            {chips.length ? chips.length : ''}
          </Button>
        </div>
      </header>

      <DemoBanner present={hasDemo} />

      <div className="flex items-start">
        {sites.length ? (
          <aside
            className="hidden w-56 shrink-0 self-stretch overflow-y-auto border-r border-hairline p-4 lg:sticky lg:block"
            style={{ top: HEADER, maxHeight: `calc(100dvh - ${HEADER}px)` }}
          >
            <FilterRail
            filters={filters}
            counts={results.counts}
            smartCounts={results.smartCounts}
            index={index}
            actions={actions}
          />
          </aside>
        ) : null}

        <main className="min-w-0 flex-1 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {filters.smart !== 'all' ? (
              <button
                type="button"
                onClick={() => actions.setSmart('all')}
                className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-hairline bg-surface px-2 text-13 transition-colors duration-150 motion-ease hover:border-muted"
              >
                {SMART_LABELS[filters.smart]}
                <CloseIcon width={12} height={12} className="text-muted" />
              </button>
            ) : null}
            {chips.map((chip) => (
              <button
                key={`${chip.group}:${chip.value}`}
                type="button"
                onClick={() => actions.remove(chip.group, chip.value)}
                className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-hairline bg-surface px-2 text-13 transition-colors duration-150 motion-ease hover:border-muted"
              >
                <span className="text-muted">{chip.groupLabel}</span>
                {chip.label}
                <CloseIcon width={12} height={12} className="text-muted" />
              </button>
            ))}
            {chips.length || filters.smart !== 'all' ? (
              <button
                type="button"
                onClick={actions.clearAll}
                className="text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
              >
                Clear all
              </button>
            ) : null}
            <div className="ml-auto flex items-center gap-3 text-13 text-muted">
              {ready ? (
                <span className="whitespace-nowrap">
                  {filters.view === 'sites'
                    ? plural(results.total, 'site')
                    : plural(results.total, 'shot')}
                </span>
              ) : null}
              {filters.view === 'sections' && results.total > 0 ? (
                <Button
                  onClick={() => {
                    setSelecting((previous) => !previous);
                    setSelected([]);
                  }}
                  aria-pressed={selecting}
                >
                  {selecting ? 'Cancel' : 'Select'}
                </Button>
              ) : null}
              {sortSelect}
            </div>
          </div>

          {!ready ? null : entries.length ? (
            <MasonryGrid entries={entries} />
          ) : sites.length === 0 ? (
            <div className="mx-auto max-w-sm py-24 text-center">
              <h2 className="text-24 font-medium">Nothing saved yet</h2>
              <p className="mt-2 text-15 text-muted">
                Add the first site you want to learn from. An address or one screenshot is enough.
              </p>
              <Button variant="primary" className="mt-4" onClick={() => setAdding({})}>
                <PlusIcon />
                Add site
              </Button>
            </div>
          ) : (
            <div className="py-24 text-center">
              <p className="text-15 text-muted">No shots match these filters.</p>
              {filtered ? (
                <Button
                  className="mt-3"
                  onClick={() => {
                    actions.clearAll();
                    actions.setQuery('');
                  }}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {sheetOpen ? (
        <div className="fixed inset-0 z-[45] lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 cursor-default bg-overlay"
          />
          <div className="ia-sheet-up absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[8px] border-t border-hairline bg-canvas">
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hairline px-4">
              <h2 className="text-15 font-medium">Filters</h2>
              <div className="flex items-center gap-2">
                {sortSelect}
                <IconButton label="Close filters" onClick={() => setSheetOpen(false)}>
                  <CloseIcon />
                </IconButton>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <FilterRail
            filters={filters}
            counts={results.counts}
            smartCounts={results.smartCounts}
            index={index}
            actions={actions}
          />
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-hairline px-4 py-3">
              <Button onClick={actions.clearAll} disabled={!chips.length}>
                Clear all
              </Button>
              <Button variant="primary" className="ml-auto" onClick={() => setSheetOpen(false)}>
                Show {filters.view === 'sites' ? plural(results.total, 'site') : plural(results.total, 'shot')}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {selecting ? (
        <div className="fixed inset-x-0 bottom-0 z-[35] flex items-center gap-2 border-t border-hairline bg-surface px-4 py-3">
          <p className="text-13 text-muted">
            {selected.length ? plural(selected.length, 'shot') : 'None'} selected
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => setSelected([])} disabled={!selected.length}>
              Clear
            </Button>
            <AddToCollection
              shotIds={selected}
              collections={collections}
              variant="primary"
              onDone={leaveSelection}
            />
          </div>
        </div>
      ) : null}

      {viewerIndex !== null ? (
        <ShotViewer
          rows={results.rows}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          fontSuggestions={fontSuggestions}
          collections={collections}
          onFilter={(group, value) => {
            actions.only(group, value);
            setViewerIndex(null);
          }}
        />
      ) : null}

      <input
        ref={importField}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importBackup(file);
        }}
      />

      <BookmarkletModal open={bookmarklet} onClose={() => setBookmarklet(false)} />

      <AddSiteModal
        open={adding !== null}
        onClose={() => setAdding(null)}
        initialUrl={adding?.url}
        initialName={adding?.name}
        initialFiles={adding?.files}
        fontSuggestions={fontSuggestions}
        styleSuggestions={styleSuggestions}
      />
    </div>
  );
}
