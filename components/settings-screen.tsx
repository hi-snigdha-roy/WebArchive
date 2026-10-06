'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeftIcon } from './icons';
import { ThemeToggle } from './theme';
import { Button } from './ui';
import { countLegacyArchive } from '@/lib/legacy-browser';
import { importFromBrowser, type BrowserImportSummary, type ImportProgress } from '@/lib/store';
import { plural } from '@/lib/utils';

export function SettingsScreen() {
  const [found, setFound] = useState<{ sites: number; shots: number; collections: number } | null>(
    null,
  );
  const [looked, setLooked] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [summary, setSummary] = useState<BrowserImportSummary | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void countLegacyArchive()
      .catch(() => null)
      .then((counts) => {
        if (!active) return;
        setFound(counts);
        setLooked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const run = async () => {
    setBusy(true);
    setProblem(null);
    setSummary(null);
    try {
      const result = await importFromBrowser(setProgress);
      setSummary(result);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'That import could not be finished.');
    } finally {
      setBusy(false);
      setProgress(null);
    }
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
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-32 font-medium">Settings</h1>

        <section className="mt-8">
          <h2 className="text-18 font-medium">Import from this browser</h2>
          <p className="mt-2 text-15 text-muted">
            Earlier versions of the archive kept everything in this browser. This copies it into
            your account. Your browser&rsquo;s copy is left alone, so nothing is lost either way,
            and running this twice will not make duplicates.
          </p>

          {!looked ? null : found ? (
            <>
              <p className="mt-4 text-15">
                Found {plural(found.sites, 'site')}, {plural(found.shots, 'shot')} and{' '}
                {plural(found.collections, 'collection')} in this browser.
              </p>
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => void run()}
                disabled={busy}
              >
                {busy ? 'Importing' : 'Import from this browser'}
              </Button>
            </>
          ) : (
            <p className="mt-4 text-15 text-muted">
              Nothing from an earlier version is stored in this browser.
            </p>
          )}

          {progress ? (
            <div className="mt-4" aria-live="polite">
              <p className="text-13 text-muted">
                {progress.label}
                {progress.total ? ` — ${progress.done} of ${progress.total}` : ''}
              </p>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full bg-accent transition-[width] duration-150 motion-ease"
                  style={{
                    width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {summary ? (
            <p className="mt-4 text-15" aria-live="polite">
              Added {plural(summary.sites, 'site')}, {plural(summary.shots, 'shot')},{' '}
              {plural(summary.images, 'screenshot')} and{' '}
              {plural(summary.collections, 'collection')}.
              {summary.alreadyThere
                ? ` ${summary.alreadyThere} were imported before and were left alone.`
                : ''}
            </p>
          ) : null}

          {problem ? (
            <p className="mt-4 text-15" role="alert">
              {problem}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
