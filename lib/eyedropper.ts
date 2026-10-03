'use client';

import { normalizeHex } from './utils';

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}

declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperInstance;
  }
}

export function hasEyeDropper(): boolean {
  return typeof window !== 'undefined' && typeof window.EyeDropper === 'function';
}

/** Lets you click any pixel on screen. Null when cancelled or unsupported. */
export async function pickFromScreen(): Promise<string | null> {
  if (!hasEyeDropper()) return null;
  try {
    const dropper = new window.EyeDropper!();
    const { sRGBHex } = await dropper.open();
    return normalizeHex(sRGBHex);
  } catch {
    // Escape, or the picker was dismissed.
    return null;
  }
}
