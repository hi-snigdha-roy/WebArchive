import { SECTIONS, type Section } from './types';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Adds a scheme so bare input like "parklanecph.com" still parses and opens. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return trimmed;
  }
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "https://www.studio-iro.com/work" -> "Studio Iro" */
export function siteNameFromUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  let host = '';
  try {
    host = new URL(normalizeUrl(trimmed)).hostname;
  } catch {
    return '';
  }
  host = host.replace(/^www\./i, '');
  const label = host.split('.')[0] ?? '';
  if (!label) return '';
  return label.split(/[-_]+/).filter(Boolean).map(titleCase).join(' ');
}

export function hostLabel(raw: string): string {
  try {
    return new URL(normalizeUrl(raw)).hostname.replace(/^www\./i, '');
  } catch {
    return raw;
  }
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeHex(input: string): string | null {
  const value = input.trim();
  if (!HEX.test(value)) return null;
  let body = value.replace('#', '');
  if (body.length === 3) {
    body = body
      .split('')
      .map((c) => c + c)
      .join('');
  }
  return `#${body.toUpperCase()}`;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!normalized) return 1;
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** Picks whichever of our two ink colours reads better on the given background. */
export function readableInk(hex: string): string {
  const bg = luminance(hex);
  const dark = contrast(bg, luminance('#16181A'));
  const light = contrast(bg, luminance('#FFFFFF'));
  return dark >= light ? '#16181A' : '#FFFFFF';
}

export function sortSections(a: Section | null, b: Section | null): number {
  const ia = a ? SECTIONS.indexOf(a) : SECTIONS.length;
  const ib = b ? SECTIONS.indexOf(b) : SECTIONS.length;
  return ia - ib;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('That image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  const [, type, base64, payload] = match;
  if (!base64) return new Blob([decodeURIComponent(payload)], { type });
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  } catch {
    return null;
  }
}

/** Hands the browser a file to save. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the download a moment to start before the URL goes away.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
