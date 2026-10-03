'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddSiteModal } from './add-site-modal';
import { ChevronLeftIcon, ExternalIcon, HeartIcon, ImageIcon, TrashIcon } from './icons';
import { InlineText, InlineTextArea } from './inline';
import { MasonryGrid, PLACEHOLDER_MIN_HEIGHT } from './masonry';
import { Confirm } from './modal';
import { ShotViewer } from './shot-viewer';
import { TagInput } from './tag-input';
import { ThemeToggle } from './theme';
import { ShotTile } from './tiles';
import { useToast } from './toast';
import { Button, ColorChip, IconButton, Select } from './ui';
import { familiesOf } from '@/lib/colors';
import { libraryHref } from '@/lib/filter-url';
import { previewStyle, useFont } from '@/lib/fonts';
import { shotAspect, type Row } from '@/lib/library';
import { deleteSite, toggleFavorite, updateSite, useLibrary, useSite } from '@/lib/store';
import {
  INDUSTRIES,
  MAX_COLORS,
  SOURCES,
  UNSORTED,
  industryLabel,
  sectionLabel,
  sectionOrder,
  type Industry,
  type Source,
} from '@/lib/types';
import { copyText, normalizeHex, plural } from '@/lib/utils';

export function SiteScreen({ siteId }: { siteId: string }) {
  const { site, shots, ready } = useSite(siteId);
  const { sites, collections } = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const rows: Row[] = useMemo(() => {
    if (!site) return [];
    return [...shots]
      .sort(
        (a, b) =>
          sectionOrder(a.section) - sectionOrder(b.section) || a.createdAt - b.createdAt,
      )
      .map((shot) => ({
        shot,
        site,
        hay: '',
        families: familiesOf(shot.colors.length ? shot.colors : site.colors),
        collections: collections
          .filter((collection) => collection.shotIds.includes(shot.id))
          .map((collection) => collection.id),
      }));
  }, [site, shots, collections]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; rows: Row[] }[] = [];
    for (const row of rows) {
      const key = row.shot.section ?? UNSORTED;
      const last = out[out.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else out.push({ key, label: sectionLabel(row.shot.section), rows: [row] });
    }
    return out;
  }, [rows]);

  const fontSuggestions = useMemo(
    () =>
      [
        ...new Set(
          sites
            .flatMap((entry) => [entry.fonts.heading, entry.fonts.body])
            .filter((font): font is string => Boolean(font)),
        ),
      ].sort(),
    [sites],
  );
  const styleSuggestions = useMemo(
    () => [...new Set(sites.flatMap((entry) => entry.styles))].sort(),
    [sites],
  );

  if (!ready) return null;

  if (!site) {
    return (
      <div className="mx-auto max-w-sm py-24 text-center">
        <h1 className="text-24 font-medium">That site is gone</h1>
        <p className="mt-2 text-15 text-muted">It may have been deleted.</p>
        <Link href="/" className="mt-4 inline-block text-15 underline">
          Back to the library
        </Link>
      </div>
    );
  }

  const patch = (change: Parameters<typeof updateSite>[1]) => void updateSite(site.id, change);
  const remove = async () => {
    setConfirming(false);
    await deleteSite(site.id);
    toast('Site deleted');
    router.push('/');
  };
  const copy = async (hex: string) => {
    toast((await copyText(hex)) ? `Copied ${hex}` : 'Could not copy');
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-hairline bg-canvas px-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
        >
          <ChevronLeftIcon />
          Library
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button onClick={() => setAdding(true)}>
            <ImageIcon />
            Add screenshots
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1">
            <InlineText
              value={site.name}
              label="Site name"
              onSave={(name) => patch({ name })}
              className="text-32 font-medium"
            />
          </h1>
          <IconButton
            label={site.favorite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={site.favorite}
            onClick={() => void toggleFavorite(site.id)}
            variant="secondary"
          >
            <HeartIcon filled={site.favorite} />
          </IconButton>
          <IconButton label="Delete site" variant="secondary" onClick={() => setConfirming(true)}>
            <TrashIcon />
          </IconButton>
        </div>

        <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Line label="Notes">
              <InlineTextArea
                value={site.notes}
                label="Notes"
                placeholder="Why you saved it, what you would reuse"
                onSave={(notes) => patch({ notes })}
              />
            </Line>

            <Line label="Styles">
              <TagInput
                values={site.styles}
                onChange={(styles) => patch({ styles })}
                suggestions={styleSuggestions.filter((style) => !site.styles.includes(style))}
                hrefFor={(style) => libraryHref('style', style)}
              />
            </Line>

            <Line label={`Palette (${site.colors.length} of ${MAX_COLORS})`}>
              <Palette
                colors={site.colors}
                onChange={(colors) => patch({ colors })}
                onCopy={(hex) => void copy(hex)}
              />
            </Line>
          </div>

          <dl className="flex flex-col gap-5">
            <Line label="Industry">
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Industry"
                  value={site.industry}
                  onChange={(event) => patch({ industry: event.target.value as Industry })}
                >
                  {INDUSTRIES.map((value) => (
                    <option key={value} value={value}>
                      {industryLabel(value)}
                    </option>
                  ))}
                </Select>
                <Link
                  href={libraryHref('industry', site.industry)}
                  className="shrink-0 text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
                >
                  See all
                </Link>
              </div>
            </Line>

            <Line label="Source">
              <div className="flex items-center gap-2">
                <Select
                  aria-label="Source"
                  value={site.source}
                  onChange={(event) => patch({ source: event.target.value as Source })}
                >
                  {SOURCES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
                <Link
                  href={libraryHref('source', site.source)}
                  className="shrink-0 text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
                >
                  See all
                </Link>
              </div>
            </Line>

            <Line label="Designer">
              <InlineText
                value={site.designer ?? ''}
                label="Designer"
                placeholder="Studio or person"
                onSave={(designer) => patch({ designer })}
              />
            </Line>

            <Line label="Fonts">
              <div className="flex flex-col gap-2">
                <FontField
                  role="Heading"
                  value={site.fonts.heading ?? ''}
                  onSave={(heading) => patch({ fonts: { ...site.fonts, heading } })}
                />
                <FontField
                  role="Body"
                  value={site.fonts.body ?? ''}
                  onSave={(body) => patch({ fonts: { ...site.fonts, body } })}
                />
              </div>
              <datalist id="ia-fonts">
                {fontSuggestions.map((font) => (
                  <option key={font} value={font} />
                ))}
              </datalist>
            </Line>

            <Line label="Live site">
              <LinkField
                value={site.url ?? ''}
                label="Live site address"
                onSave={(url) => patch({ url })}
              />
            </Line>

            <Line label="Found at">
              <LinkField
                value={site.sourceUrl ?? ''}
                label="Where you found it"
                onSave={(sourceUrl) => patch({ sourceUrl })}
              />
            </Line>

            <Line label="Case study">
              <LinkField
                value={site.caseStudyUrl ?? ''}
                label="Case study address"
                onSave={(caseStudyUrl) => patch({ caseStudyUrl })}
              />
            </Line>
          </dl>
        </div>

        <section className="mt-10 flex flex-col gap-8">
          {groups.length ? (
            groups.map((group) => (
              <div key={group.key}>
                <h2 className="mb-3 flex items-baseline gap-2 border-b border-hairline pb-2 text-15 font-medium">
                  {group.label}
                  <span className="text-13 text-muted">{plural(group.rows.length, 'shot')}</span>
                </h2>
                <MasonryGrid
                  entries={group.rows.map((row) => ({
                    key: row.shot.id,
                    aspect: shotAspect(row.shot),
                    minHeight: row.shot.hasImage ? undefined : PLACEHOLDER_MIN_HEIGHT,
                    node: (
                      <ShotTile
                        row={row}
                        onOpen={() => setViewerIndex(rows.indexOf(row))}
                      />
                    ),
                  }))}
                />
              </div>
            ))
          ) : (
            <div className="py-16 text-center">
              <p className="text-15 text-muted">No screenshots yet.</p>
              <Button variant="primary" className="mt-3" onClick={() => setAdding(true)}>
                <ImageIcon />
                Add screenshots
              </Button>
            </div>
          )}
        </section>
      </div>

      {viewerIndex !== null ? (
        <ShotViewer
          rows={rows}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          fontSuggestions={fontSuggestions}
          collections={collections}
          onFilter={(group, value) => router.push(libraryHref(group, value))}
        />
      ) : null}

      <AddSiteModal
        open={adding}
        onClose={() => setAdding(false)}
        site={site}
        fontSuggestions={fontSuggestions}
        styleSuggestions={styleSuggestions}
      />

      <Confirm
        open={confirming}
        title={`Delete ${site.name}?`}
        message="The site and all of its shots are removed. This cannot be undone."
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-13 text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** The typeface name, shown in that typeface, with a way into its filter. */
function FontField({
  role,
  value,
  onSave,
}: {
  role: string;
  value: string;
  onSave: (value: string) => void;
}) {
  const { family } = useFont(value);
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-13 text-muted">{role}</span>
      <InlineText
        value={value}
        label={`${role} font`}
        placeholder="Not set"
        list="ia-fonts"
        onSave={onSave}
        className="min-w-0 flex-1 text-18"
        style={previewStyle(family)}
      />
      {value ? (
        <Link
          href={libraryHref('font', value)}
          className="shrink-0 text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
        >
          See all
        </Link>
      ) : null}
    </div>
  );
}

/** An editable address with a shortcut to open it. */
function LinkField({
  value,
  label,
  onSave,
}: {
  value: string;
  label: string;
  onSave: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <InlineText
        value={value}
        label={label}
        placeholder="Not set"
        onSave={onSave}
        className="min-w-0 flex-1 truncate"
      />
      {value ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Open ${label}`}
          title="Open in a new tab"
          className="shrink-0 rounded-[4px] p-1.5 text-muted transition-colors duration-150 motion-ease hover:text-ink"
        >
          <ExternalIcon />
        </a>
      ) : null}
    </div>
  );
}

function Palette({
  colors,
  onChange,
  onCopy,
}: {
  colors: string[];
  onChange: (colors: string[]) => void;
  onCopy: (hex: string) => void;
}) {
  const [draft, setDraft] = useState('#');

  const add = () => {
    const hex = normalizeHex(draft);
    if (!hex || colors.includes(hex) || colors.length >= MAX_COLORS) return;
    onChange([...colors, hex]);
    setDraft('#');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {colors.map((color) => (
        <span key={color} className="inline-flex items-center gap-1">
          <ColorChip color={color} onClick={() => onCopy(color)} />
          <button
            type="button"
            onClick={() => onChange(colors.filter((item) => item !== color))}
            aria-label={`Remove ${color}`}
            className="text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
          >
            &times;
          </button>
        </span>
      ))}
      {colors.length < MAX_COLORS ? (
        <span className="inline-flex items-center gap-1">
          <input
            type="color"
            aria-label="Pick a colour"
            value={normalizeHex(draft) ?? '#888888'}
            onChange={(event) => setDraft(event.target.value)}
            className="size-7 cursor-pointer rounded-[4px] border border-hairline bg-surface p-0.5"
          />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder="#1A1C1E"
            aria-label="Hex code"
            className="h-7 w-24 rounded-[4px] border border-hairline bg-surface px-2 text-13 outline-none"
          />
          <Button onClick={add} disabled={!normalizeHex(draft)} className="h-7">
            Add
          </Button>
        </span>
      ) : null}
    </div>
  );
}
