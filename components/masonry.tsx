'use client';

import { useRef, type ReactNode } from 'react';
import { useColumns } from '@/lib/hooks';

export interface MasonryEntry {
  key: string;
  /** width / height of the tile's image area. */
  aspect: number;
  /** Floor for the image area, in pixels. Placeholders need room to be read. */
  minHeight?: number;
  node: ReactNode;
}

/** A placeholder needs this much room to stay readable on a narrow screen. */
export const PLACEHOLDER_MIN_HEIGHT = 150;

const GAP = 16;
const ROW = 4;
/** One truncated caption line under each tile. */
const CAPTION = 26;

/**
 * Tiles keep their natural proportions: because every shot stores its own size,
 * each tile's row span can be worked out without waiting for images to load.
 */
export function MasonryGrid({ entries }: { entries: MasonryEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { columns, width } = useColumns(ref);
  const columnWidth = width ? (width - GAP * (columns - 1)) / columns : 0;

  return (
    <div
      ref={ref}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: GAP,
        gridAutoRows: `${ROW}px`,
      }}
    >
      {columnWidth
        ? entries.map((entry) => {
            const media = Math.max(columnWidth / entry.aspect, entry.minHeight ?? 0);
            const height = media + CAPTION;
            const span = Math.max(1, Math.ceil((height + GAP) / ROW));
            return (
              <div key={entry.key} style={{ gridRowEnd: `span ${span}`, paddingBottom: GAP }}>
                {entry.node}
              </div>
            );
          })
        : null}
    </div>
  );
}
