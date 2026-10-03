'use client';

import { useSyncExternalStore } from 'react';
import { MoonIcon, SunIcon } from './icons';
import { IconButton } from './ui';

const KEY = 'ia-theme';
const CHANGED = 'ia:theme';

/** Runs before first paint so the archive never flashes the wrong palette. */
export const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('${KEY}');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // A private window just loses the preference; the palette still works.
    return null;
  }
}

/** A manual choice wins; otherwise the system setting stays in charge. */
function resolve(): boolean {
  const choice = stored();
  if (choice === 'dark') return true;
  if (choice === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function apply(dark: boolean): void {
  document.documentElement.classList.toggle('dark', dark);
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => {
    apply(resolve());
    onChange();
  };
  media.addEventListener('change', onSystemChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    media.removeEventListener('change', onSystemChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function serverSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, serverSnapshot);

  const toggle = () => {
    const next = !dark;
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      // Ignored: the class below still switches the palette for this visit.
    }
    apply(next);
    window.dispatchEvent(new Event(CHANGED));
  };

  return (
    <IconButton label={dark ? 'Light theme' : 'Dark theme'} onClick={toggle}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </IconButton>
  );
}
