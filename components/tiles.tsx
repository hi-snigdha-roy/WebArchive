'use client';

import Link from 'next/link';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Placeholder } from './placeholder';
import { CheckIcon, ExternalIcon, HeartIcon, ImageIcon } from './icons';
import { useToast } from './toast';
import { IconButton } from './ui';
import { useNearViewport, useShotImageUrl } from '@/lib/hooks';
import { shotAspect, type Row, type SiteRow } from '@/lib/library';
import { setShotImage, toggleFavorite } from '@/lib/store';
import { sectionLabel, type Site } from '@/lib/types';
import { cn, plural } from '@/lib/utils';

const ACTION = 'size-8 border border-hairline bg-surface text-ink hover:border-muted';

function liveHref(site: Site): string | undefined {
  return site.url ?? site.sourceUrl;
}

function TileActions({ site }: { site: Site }) {
  const href = liveHref(site);
  return (
    <div className="hover-actions absolute right-2 top-2 flex gap-1">
      <IconButton
        label={site.favorite ? `Remove ${site.name} from favourites` : `Favourite ${site.name}`}
        aria-pressed={site.favorite}
        onClick={() => void toggleFavorite(site.id)}
        className={ACTION}
      >
        <HeartIcon filled={site.favorite} />
      </IconButton>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open ${site.name} in a new tab`}
          title="Open site"
          className={`inline-flex items-center justify-center rounded-[4px] transition-colors duration-150 motion-ease ${ACTION}`}
        >
          <ExternalIcon />
        </a>
      ) : null}
    </div>
  );
}

function AddScreenshot({ shotId }: { shotId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await setShotImage(shotId, file);
      toast('Screenshot added');
    } catch {
      toast('That image could not be read');
    }
  };

  return (
    <div className="hover-actions absolute left-2 top-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label="Add screenshot"
        className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-hairline bg-surface px-2 text-13 font-medium transition-colors duration-150 motion-ease hover:border-muted"
      >
        <ImageIcon />
        <span className="hidden sm:inline">Add screenshot</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void onPick(event)}
      />
    </div>
  );
}

function Frame({ row, alt }: { row: Row; alt: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder);
  const url = useShotImageUrl(row.shot.hasImage && near ? row.shot.id : null);

  return (
    <div ref={holder} className="h-full w-full">
      {row.shot.hasImage ? (
        url ? (
          <img
            src={url}
            alt={alt}
            className="block w-full rounded-img border border-hairline"
            draggable={false}
          />
        ) : (
          <div
            className="w-full rounded-img border border-hairline bg-surface"
            style={{ aspectRatio: shotAspect(row.shot) }}
          />
        )
      ) : (
        <Placeholder
          siteName={row.site.name}
          section={row.shot.section}
          color={row.site.colors[0]}
        />
      )}
    </div>
  );
}

interface ShotTileProps {
  row: Row;
  onOpen: () => void;
  /** While picking shots, a tile toggles instead of opening. */
  selecting?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Replaces the usual favourite and open-site buttons. */
  actions?: ReactNode;
}

export function ShotTile({ row, onOpen, selecting, selected, onToggleSelect, actions }: ShotTileProps) {
  const alt = `${sectionLabel(row.shot.section)} from ${row.site.name}`;
  return (
    <div className="group flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <button
          type="button"
          onClick={selecting ? onToggleSelect : onOpen}
          aria-label={selecting ? `Select ${alt}` : `Open ${alt}`}
          aria-pressed={selecting ? Boolean(selected) : undefined}
          className={cn(
            'block h-full w-full rounded-img text-left',
            selected && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
          )}
        >
          <Frame row={row} alt={alt} />
        </button>
        {selecting ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-2 top-2 flex size-5 items-center justify-center rounded-[4px] border',
              selected ? 'border-accent bg-accent text-accent-ink' : 'border-hairline bg-surface',
            )}
          >
            {selected ? <CheckIcon width={13} height={13} /> : null}
          </span>
        ) : (
          <>
            {actions ?? <TileActions site={row.site} />}
            {row.shot.hasImage ? null : <AddScreenshot shotId={row.shot.id} />}
          </>
        )}
      </div>
      <p className="mt-1.5 truncate text-13">
        {sectionLabel(row.shot.section)}
        <span className="text-muted"> · </span>
        <Link
          href={`/site/${row.site.id}`}
          className="text-muted transition-colors duration-150 motion-ease hover:text-ink"
        >
          {row.site.name}
        </Link>
      </p>
    </div>
  );
}

export function SiteTile({ siteRow }: { siteRow: SiteRow }) {
  const { site, cover, shotCount } = siteRow;
  return (
    <div className="group flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <Link
          href={`/site/${site.id}`}
          aria-label={`Open ${site.name}`}
          className="block h-full w-full rounded-img"
        >
          {cover ? (
            <Frame row={cover} alt={`${site.name}, ${sectionLabel(cover.shot.section)}`} />
          ) : (
            <Placeholder siteName={site.name} section={null} color={site.colors[0]} />
          )}
        </Link>
        <TileActions site={site} />
      </div>
      <p className="mt-1.5 truncate text-13">
        {site.name}
        <span className="text-muted"> · {shotCount ? plural(shotCount, 'shot') : 'No shots yet'}</span>
      </p>
    </div>
  );
}
