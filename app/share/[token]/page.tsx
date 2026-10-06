import type { Metadata } from 'next';
import { readSharedCollection } from '@/lib/share';

// A read-only window onto one collection. No navigation into the rest of the
// archive, and nothing on this page can change anything.

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SharePage(props: PageProps<'/share/[token]'>) {
  const { token } = await props.params;
  const collection = await readSharedCollection(token);

  if (!collection) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="text-15 text-muted">This link is no longer available</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="border-b border-hairline pb-4">
        <h1 className="text-32 font-medium">{collection.name}</h1>
        <p className="mt-1 text-13 text-muted">
          {collection.shots.length === 1 ? '1 shot' : `${collection.shots.length} shots`} · shared
          from Inspiration Archive
        </p>
      </header>

      {collection.shots.length ? (
        <div className="mt-6 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {collection.shots.map((shot) => (
            <figure key={shot.id} className="mb-4 break-inside-avoid">
              {shot.imageUrl ? (
                <img
                  src={shot.imageUrl}
                  alt={shot.section}
                  width={shot.width ?? undefined}
                  height={shot.height ?? undefined}
                  className="block w-full rounded-img border border-hairline"
                />
              ) : (
                <div className="flex aspect-[16/10] w-full items-end rounded-img border border-dashed border-hairline p-3">
                  <span className="text-18 font-medium">{shot.section}</span>
                </div>
              )}
              <figcaption className="mt-1.5 truncate text-13 text-muted">{shot.section}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="py-16 text-center text-15 text-muted">Nothing in this collection yet.</p>
      )}
    </main>
  );
}
