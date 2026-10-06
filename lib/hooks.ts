'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { getShotImageUrl } from './store';

/** True once the element has come within a screen or so of the viewport. */
export function useNearViewport(
  ref: RefObject<HTMLElement | null>,
  rootMargin = '600px',
): boolean {
  // Without an observer every tile counts as visible straight away.
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near, rootMargin]);

  return near;
}

/**
 * A link to one shot's screenshot. The bucket is private, so this is a signed
 * URL that the store hands out in batches and refreshes before it expires.
 * Pass null to hold off entirely, which is how tiles stay cheap until they
 * scroll into view.
 */
export function useShotImageUrl(shotId: string | null): string | null {
  const [entry, setEntry] = useState<{ id: string | null; url: string | null }>({
    id: null,
    url: null,
  });

  useEffect(() => {
    if (!shotId) return;
    let active = true;
    void getShotImageUrl(shotId).then((url) => {
      if (active) setEntry({ id: shotId, url });
    });
    return () => {
      active = false;
    };
  }, [shotId]);

  // Never show the previous shot's picture against this one's id.
  return entry.id === shotId ? entry.url : null;
}

/** Object URL for a blob we already hold, e.g. a file waiting in the add flow. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    // One extra render for a thumbnail that is about to be discarded anyway;
    // creating the URL during render would leak it under StrictMode.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => {
      setUrl(null);
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}

export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** Column count for the masonry grid, measured rather than guessed. */
export function useColumns(ref: RefObject<HTMLElement | null>): { columns: number; width: number } {
  const [size, setSize] = useState({ columns: 3, width: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = (width: number) => {
      let columns = 2;
      if (width >= 1700) columns = 6;
      else if (width >= 1320) columns = 5;
      else if (width >= 980) columns = 4;
      else if (width >= 640) columns = 3;
      setSize((prev) =>
        prev.columns === columns && prev.width === width ? prev : { columns, width },
      );
    };
    measure(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) measure(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/** Keeps the page behind a modal or the viewer from scrolling. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** Focus trap plus restore, for the viewer and the add modal. */
export function useFocusTrap(active: boolean): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    container?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !container) return;
      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [active]);

  return ref;
}
