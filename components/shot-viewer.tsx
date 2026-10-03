'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ExternalIcon,
  HeartIcon,
} from './icons';
import { AddToCollection } from './collection-menu';
import { InlineTextArea } from './inline';
import { Confirm } from './modal';
import { PalettePanel } from './palette-panel';
import { Placeholder } from './placeholder';
import { StylePreview } from './style-preview';
import { TypePanel } from './type-panel';
import { useToast } from './toast';
import { Button, IconButton, Select } from './ui';
import { useFocusTrap, useScrollLock, useShotImageUrl } from '@/lib/hooks';
import type { FilterGroup, Row } from '@/lib/library';
import { deleteShot, toggleFavorite, updateShot } from '@/lib/store';
import {
  SECTIONS,
  deviceLabel,
  industryLabel,
  sectionLabel,
  titleCase,
  type Collection,
  type Section,
} from '@/lib/types';

interface ViewerProps {
  rows: Row[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onFilter: (group: FilterGroup, value: string) => void;
  /** Typefaces already named in the archive, for the Type rows' autocomplete. */
  fontSuggestions: string[];
  collections: Collection[];
}

export function ShotViewer({
  rows,
  index,
  onIndexChange,
  onClose,
  onFilter,
  fontSuggestions,
  collections,
}: ViewerProps) {
  const row = rows[index];
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const panel = useFocusTrap(true);
  useScrollLock(true);

  useEffect(() => {
    if (!rows.length) onClose();
    else if (index > rows.length - 1) onIndexChange(rows.length - 1);
  }, [rows.length, index, onClose, onIndexChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (confirming) return;
      const target = event.target as HTMLElement | null;
      // While a field has focus, the field owns the keyboard.
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        onIndexChange(index - 1);
      } else if (event.key === 'ArrowRight' && index < rows.length - 1) {
        event.preventDefault();
        onIndexChange(index + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirming, index, rows.length, onClose, onIndexChange]);

  const url = useShotImageUrl(row?.shot.hasImage ? row.shot.id : null);
  if (!row) return null;

  const { shot, site } = row;
  const live = site.url ?? site.sourceUrl;
  const title = `${sectionLabel(shot.section)} from ${site.name}`;

  const remove = async () => {
    setConfirming(false);
    const last = rows.length <= 1;
    await deleteShot(shot.id);
    toast('Shot deleted');
    if (last) onClose();
    else onIndexChange(Math.min(index, rows.length - 2));
  };

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="ia-fade-in fixed inset-0 z-40 flex flex-col overflow-y-auto bg-canvas outline-none lg:flex-row lg:overflow-hidden"
    >
      <div className="relative flex min-h-[50dvh] flex-1 items-center justify-center p-4 lg:min-h-0 lg:p-8">
        {shot.hasImage ? (
          url ? (
            <img
              src={url}
              alt={title}
              className="max-h-full w-auto max-w-full rounded-img border border-hairline object-contain"
            />
          ) : null
        ) : (
          <div className="w-full max-w-md">
            <Placeholder
              siteName={site.name}
              section={shot.section}
              color={site.colors[0]}
              size="large"
              className="aspect-[16/10]"
            />
          </div>
        )}

        <IconButton
          label="Previous shot"
          onClick={() => onIndexChange(index - 1)}
          disabled={index === 0}
          className="absolute left-2 top-1/2 -translate-y-1/2 border border-hairline bg-surface"
        >
          <ChevronLeftIcon />
        </IconButton>
        <IconButton
          label="Next shot"
          onClick={() => onIndexChange(index + 1)}
          disabled={index >= rows.length - 1}
          className="absolute right-2 top-1/2 -translate-y-1/2 border border-hairline bg-surface"
        >
          <ChevronRightIcon />
        </IconButton>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t border-hairline bg-surface lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="flex flex-1 flex-col gap-5 p-4">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/site/${site.id}`}
                className="block truncate text-24 font-medium hover:underline"
              >
                {titleCase(site.name)}
              </Link>
              <p className="mt-0.5 text-13 text-muted">
                {index + 1} of {rows.length}
              </p>
            </div>
            <IconButton label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </header>

          <StylePreview site={site} />

          <Block label="Palette">
            <PalettePanel site={site} />
          </Block>

          <Block label="Type">
            <TypePanel
              site={site}
              suggestions={fontSuggestions}
              onFilter={(font) => onFilter('font', font)}
            />
          </Block>

          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Block label="Section">
              <Select
                aria-label="Section"
                value={shot.section ?? ''}
                onChange={(event) =>
                  void updateShot(shot.id, {
                    section: (event.target.value || null) as Section | null,
                  })
                }
              >
                <option value="">Unsorted</option>
                {SECTIONS.map((section) => (
                  <option key={section} value={section}>
                    {sectionLabel(section)}
                  </option>
                ))}
              </Select>
            </Block>
            <Block label="Device">
              <FilterLink onClick={() => onFilter('device', shot.device)}>
                {deviceLabel(shot.device)}
              </FilterLink>
            </Block>
            <Block label="Industry">
              <FilterLink onClick={() => onFilter('industry', site.industry)}>
                {industryLabel(site.industry)}
              </FilterLink>
            </Block>
            <Block label="Source">
              <FilterLink onClick={() => onFilter('source', site.source)}>{site.source}</FilterLink>
              {site.designer ? <p className="mt-1 text-13 text-muted">{site.designer}</p> : null}
            </Block>
          </div>

          {site.styles.length ? (
            <Block label="Styles">
              <div className="flex flex-wrap gap-1.5">
                {site.styles.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => onFilter('style', style)}
                    className="inline-flex h-7 items-center rounded-[4px] border border-hairline px-2 text-13 transition-colors duration-150 motion-ease hover:border-muted"
                  >
                    {style}
                  </button>
                ))}
              </div>
            </Block>
          ) : null}

          <Block label="Note">
            <InlineTextArea
              value={shot.note}
              label="Shot note"
              placeholder="What would you reuse here?"
              onSave={(note) => void updateShot(shot.id, { note })}
            />
          </Block>

          <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
            <Button onClick={() => void toggleFavorite(site.id)} aria-pressed={site.favorite}>
              <HeartIcon filled={site.favorite} />
              {site.favorite ? 'Favourited' : 'Favourite'}
            </Button>
            <AddToCollection shotIds={[shot.id]} collections={collections} />
            {live ? (
              <a
                href={live}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-9 items-center gap-1.5 rounded-[4px] border border-hairline bg-surface px-3 text-13 font-medium transition-colors duration-150 motion-ease hover:border-muted"
              >
                <ExternalIcon />
                Open site
              </a>
            ) : null}
          </div>
        </div>

        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
          >
            Delete shot
          </button>
        </div>
      </aside>

      <Confirm
        open={confirming}
        title="Delete this shot?"
        message="The screenshot and its note are removed. This cannot be undone."
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-13 text-muted">{label}</p>
      {children}
    </div>
  );
}

function FilterLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-left text-15 hover:underline">
      {children}
    </button>
  );
}
