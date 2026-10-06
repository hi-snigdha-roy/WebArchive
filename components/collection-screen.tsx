'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { ChevronLeftIcon, CloseIcon, GripIcon, TrashIcon } from './icons';
import { InlineText } from './inline';
import { MasonryGrid, PLACEHOLDER_MIN_HEIGHT } from './masonry';
import { Confirm } from './modal';
import { ShareControls } from './share-controls';
import { ShotViewer } from './shot-viewer';
import { ThemeToggle } from './theme';
import { LoadError } from './states';
import { ShotTile } from './tiles';
import { useToast } from './toast';
import { Button, IconButton } from './ui';
import { familiesOf } from '@/lib/colors';
import { libraryHref } from '@/lib/filter-url';
import { shotAspect, type Row } from '@/lib/library';
import {
  deleteCollection,
  removeFromCollection,
  renameCollection,
  setCollectionOrder,
  useLibrary,
} from '@/lib/store';
import { cn, plural } from '@/lib/utils';

export function CollectionScreen({ collectionId }: { collectionId: string }) {
  const { sites, shots, collections, ready, error, retry } = useLibrary();
  const router = useRouter();
  const toast = useToast();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const collection = collections.find((item) => item.id === collectionId) ?? null;

  const rows: Row[] = useMemo(() => {
    if (!collection) return [];
    const shotById = new Map(shots.map((shot) => [shot.id, shot]));
    const siteById = new Map(sites.map((site) => [site.id, site]));
    return collection.shotIds.flatMap((shotId) => {
      const shot = shotById.get(shotId);
      const site = shot ? siteById.get(shot.siteId) : undefined;
      if (!shot || !site) return [];
      return [
        {
          shot,
          site,
          hay: '',
          families: familiesOf(shot.colors.length ? shot.colors : site.colors),
          collections: [collection.id],
        },
      ];
    });
  }, [collection, shots, sites]);

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

  if (error) return <LoadError message={error} onRetry={retry} />;
  if (!ready) return null;

  if (!collection) {
    return (
      <div className="mx-auto max-w-sm py-24 text-center">
        <h1 className="text-24 font-medium">That collection is gone</h1>
        <p className="mt-2 text-15 text-muted">It may have been deleted.</p>
        <Link href="/" className="mt-4 inline-block text-15 underline">
          Back to the library
        </Link>
      </div>
    );
  }

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= rows.length) return;
    const order = rows.map((row) => row.shot.id);
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    void setCollectionOrder(collection.id, order);
  };

  const onDragStart = (event: DragEvent<HTMLDivElement>, position: number) => {
    setDragging(position);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(position));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>, position: number) => {
    event.preventDefault();
    if (dragging !== null) move(dragging, position);
    setDragging(null);
    setOver(null);
  };

  const onHandleKey = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(position, position - 1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(position, position + 1);
    }
  };

  const remove = async () => {
    setConfirming(false);
    await deleteCollection(collection.id);
    toast('Collection deleted');
    router.push('/');
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
          <Link
            href={libraryHref('collection', collection.id)}
            className="inline-flex h-9 items-center rounded-[4px] border border-hairline bg-surface px-3 text-13 font-medium transition-colors duration-150 motion-ease hover:border-muted"
          >
            Filter the library by this
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-start gap-3">
          <h1 className="min-w-0 flex-1">
            <InlineText
              value={collection.name}
              label="Collection name"
              onSave={(name) => void renameCollection(collection.id, name)}
              className="text-32 font-medium"
            />
          </h1>
          <IconButton
            label="Delete collection"
            variant="secondary"
            onClick={() => setConfirming(true)}
          >
            <TrashIcon />
          </IconButton>
        </div>
        <p className="mt-1 text-13 text-muted">
          {plural(rows.length, 'shot')} · drag a tile, or focus its handle and use the arrow keys,
          to reorder
        </p>

        <div className="mt-4">
          <ShareControls collectionId={collection.id} />
        </div>

        <section className="mt-6">
          {rows.length ? (
            <MasonryGrid
              entries={rows.map((row, position) => ({
                key: row.shot.id,
                aspect: shotAspect(row.shot),
                minHeight: row.shot.hasImage ? undefined : PLACEHOLDER_MIN_HEIGHT,
                node: (
                  <div
                    draggable
                    onDragStart={(event) => onDragStart(event, position)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (over !== position) setOver(position);
                    }}
                    onDrop={(event) => onDrop(event, position)}
                    className={cn(
                      'h-full rounded-img',
                      dragging === position && 'opacity-40',
                      over === position &&
                        dragging !== null &&
                        dragging !== position &&
                        'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
                    )}
                  >
                    <ShotTile
                      row={row}
                      onOpen={() => setViewerIndex(position)}
                      actions={
                        <div className="hover-actions absolute right-2 top-2 flex gap-1">
                          <button
                            type="button"
                            aria-label={`Reorder, position ${position + 1} of ${rows.length}`}
                            title="Drag, or use the arrow keys"
                            onKeyDown={(event) => onHandleKey(event, position)}
                            className="inline-flex size-8 cursor-grab items-center justify-center rounded-[4px] border border-hairline bg-surface text-ink"
                          >
                            <GripIcon />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove from this collection"
                            title="Remove from this collection"
                            onClick={() => void removeFromCollection(collection.id, row.shot.id)}
                            className="inline-flex size-8 items-center justify-center rounded-[4px] border border-hairline bg-surface text-ink"
                          >
                            <CloseIcon />
                          </button>
                        </div>
                      }
                    />
                  </div>
                ),
              }))}
            />
          ) : (
            <div className="py-16 text-center">
              <p className="text-15 text-muted">Nothing in this collection yet.</p>
              <Button className="mt-3" onClick={() => router.push('/')}>
                Go and pick some shots
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

      <Confirm
        open={confirming}
        title={`Delete ${collection.name}?`}
        message="The collection is removed. The shots inside it stay in your archive."
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
