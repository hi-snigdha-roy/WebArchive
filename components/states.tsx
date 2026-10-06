'use client';

import { Button } from './ui';

/** Stand-in tiles while the archive is on its way, in the masonry rhythm. */
export function SkeletonGrid() {
  const heights = [220, 150, 310, 190, 260, 170, 230, 290, 160, 240, 200, 280];
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {heights.map((height, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <div
            className="w-full rounded-img border border-hairline bg-surface"
            style={{ height }}
          />
          <div className="h-3 w-2/3 rounded-[2px] bg-surface" />
        </div>
      ))}
    </div>
  );
}

/** Something went wrong fetching. Says what, and offers to go again. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-sm py-24 text-center">
      <h2 className="text-18 font-medium">Your archive could not be loaded</h2>
      <p className="mt-2 text-15 text-muted">{message}</p>
      <Button variant="primary" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
