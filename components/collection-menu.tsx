'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, PlusIcon } from './icons';
import { useToast } from './toast';
import { Button } from './ui';
import { addToCollection, createCollection, removeFromCollection } from '@/lib/store';
import type { Collection } from '@/lib/types';
import { cn, plural } from '@/lib/utils';

interface AddToCollectionProps {
  shotIds: string[];
  collections: Collection[];
  /** Called once something was added or removed. */
  onDone?: () => void;
  variant?: 'secondary' | 'primary';
  className?: string;
}

export function AddToCollection({
  shotIds,
  collections,
  onDone,
  variant = 'secondary',
  className,
}: AddToCollectionProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const holdsAll = (collection: Collection) =>
    shotIds.length > 0 && shotIds.every((id) => collection.shotIds.includes(id));

  const toggle = async (collection: Collection) => {
    if (busy) return;
    setBusy(true);
    try {
      if (holdsAll(collection)) {
        for (const shotId of shotIds) await removeFromCollection(collection.id, shotId);
        toast(`Removed from ${collection.name}`);
      } else {
        const added = await addToCollection(collection.id, shotIds);
        toast(added ? `Added ${plural(added, 'shot')} to ${collection.name}` : 'Already there');
      }
      onDone?.();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const id = await createCollection(trimmed);
      await addToCollection(id, shotIds);
      toast(`Added ${plural(shotIds.length, 'shot')} to ${trimmed}`);
      setName('');
      onDone?.();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <div ref={holder} className={cn('relative', className)}>
      <Button
        variant={variant}
        aria-expanded={open}
        disabled={!shotIds.length}
        onClick={() => setOpen((previous) => !previous)}
      >
        <PlusIcon />
        Add to collection
      </Button>

      {open ? (
        <div
          role="menu"
          className="ia-rise absolute bottom-full left-0 z-40 mb-1 flex w-60 flex-col rounded-[6px] border border-hairline bg-surface p-1"
        >
          {collections.length ? (
            <div className="max-h-56 overflow-y-auto">
              {collections.map((collection) => {
                const held = holdsAll(collection);
                return (
                  <button
                    key={collection.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={held}
                    onClick={() => void toggle(collection)}
                    className="flex h-9 w-full items-center gap-2 rounded-[4px] px-2 text-left text-13 transition-colors duration-150 motion-ease hover:bg-canvas"
                  >
                    <span
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border',
                        held ? 'border-accent bg-accent text-accent-ink' : 'border-hairline',
                      )}
                    >
                      {held ? <CheckIcon width={11} height={11} /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                    <span className="shrink-0 text-muted">{collection.shotIds.length}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div
            className={cn(
              'flex items-center gap-1.5 p-1',
              collections.length > 0 && 'mt-1 border-t border-hairline pt-2',
            )}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void create();
                }
              }}
              placeholder="New collection"
              aria-label="New collection name"
              className="h-7 min-w-0 flex-1 rounded-[4px] border border-hairline bg-canvas px-2 text-13 outline-none"
            />
            <Button onClick={() => void create()} disabled={!name.trim()} className="h-7 px-2">
              Create
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
