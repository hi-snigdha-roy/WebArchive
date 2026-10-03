// Pulling a palette out of a screenshot, and sorting hex codes into the handful
// of families you would actually search by.

import { COLOR_ROLES, type ColorRole, type ColorRoles } from './types';
import { luminance, normalizeHex } from './utils';

export const COLOR_FAMILIES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
  'brown',
  'black',
  'white',
  'grey',
] as const;
export type ColorFamily = (typeof COLOR_FAMILIES)[number];

export const FAMILY_LABELS: Record<ColorFamily, string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  purple: 'Purple',
  pink: 'Pink',
  brown: 'Brown',
  black: 'Black',
  white: 'White',
  grey: 'Grey',
};

/** One representative colour per family, for the swatch in the filter rail. */
export const FAMILY_SWATCHES: Record<ColorFamily, string> = {
  red: '#D64A3F',
  orange: '#E07C33',
  yellow: '#E2B93B',
  green: '#4F9A52',
  teal: '#3DA39C',
  blue: '#4063D8',
  purple: '#8257C8',
  pink: '#D1569C',
  brown: '#8A5A3B',
  black: '#16181A',
  white: '#FFFFFF',
  grey: '#9A9EA3',
};

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = match[1];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, saturation, lightness];
}

/**
 * The family a colour belongs to. Neutrals are decided first, then dark warm
 * oranges become brown, and everything else falls to its hue.
 *
 * Neutrality is judged on chroma, not HSL saturation: saturation is a ratio
 * that explodes near white, so a warm off-white reads as a strong orange by
 * that measure while its chroma correctly says it is barely coloured at all.
 */
export function colorFamily(hex: string): ColorFamily {
  const rgb = hexToRgb(hex);
  if (!rgb) return 'grey';
  const [hue, , lightness] = rgbToHsl(rgb);
  const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;

  if (chroma < 0.1) {
    if (lightness <= 0.22) return 'black';
    if (lightness >= 0.82) return 'white';
    return 'grey';
  }
  // Coloured, but so dark or so pale that the hue is not what you would call it.
  if (lightness <= 0.1) return 'black';
  if (lightness >= 0.93) return 'white';
  if (hue >= 10 && hue < 50 && lightness < 0.42) return 'brown';

  if (hue < 12 || hue >= 345) return 'red';
  if (hue < 40) return 'orange';
  if (hue < 66) return 'yellow';
  if (hue < 160) return 'green';
  if (hue < 196) return 'teal';
  if (hue < 256) return 'blue';
  if (hue < 290) return 'purple';
  return 'pink';
}

export function familiesOf(colors: string[]): ColorFamily[] {
  return [...new Set(colors.map(colorFamily))];
}

/* ------------------------------------------------- perceptual distance */

function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pivot(value: number): number {
  return value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
}

function rgbToLab([r, g, b]: Rgb): [number, number, number] {
  const red = channelToLinear(r);
  const green = channelToLinear(g);
  const blue = channelToLinear(b);
  const x = pivot((red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047);
  const y = pivot(red * 0.2126 + green * 0.7152 + blue * 0.0722);
  const z = pivot((red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Roughly CIE76: under about 10 two colours read as the same one. */
export function colorDistance(a: string, b: string): number {
  const first = hexToRgb(a);
  const second = hexToRgb(b);
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const [l1, a1, b1] = rgbToLab(first);
  const [l2, a2, b2] = rgbToLab(second);
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

/** Adds the colours that are not already represented, keeping the order. */
export function mergePalette(existing: string[], incoming: string[], max: number): string[] {
  const out = [...existing];
  for (const color of incoming) {
    if (out.length >= max) break;
    if (out.every((kept) => colorDistance(kept, color) > 12)) out.push(color);
  }
  return out;
}

/* ------------------------------------------------------ extraction */

const SAMPLE_WIDTH = 140;
const SAMPLE_HEIGHT = 1400;
const MAX_PIXELS = 24000;

async function pixelsOf(blob: Blob): Promise<Rgb[]> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release = () => {};

  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('unreadable'));
      element.src = url;
    });
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
    release = () => URL.revokeObjectURL(url);
  }

  try {
    const scale = Math.min(1, SAMPLE_WIDTH / width, SAMPLE_HEIGHT / height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(source, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const total = w * h;
    const step = Math.max(1, Math.ceil(total / MAX_PIXELS));
    const pixels: Rgb[] = [];
    for (let i = 0; i < total; i += step) {
      const at = i * 4;
      if (data[at + 3] < 125) continue;
      pixels.push([data[at], data[at + 1], data[at + 2]]);
    }
    return pixels;
  } finally {
    release();
  }
}

function rangeOf(box: Rgb[]): { channel: number; spread: number } {
  let best = { channel: 0, spread: -1 };
  for (let channel = 0; channel < 3; channel += 1) {
    let low = 255;
    let high = 0;
    for (const pixel of box) {
      const value = pixel[channel];
      if (value < low) low = value;
      if (value > high) high = value;
    }
    const spread = high - low;
    if (spread > best.spread) best = { channel, spread };
  }
  return best;
}

/** Median cut: split the busiest box in half until there are enough of them. */
function medianCut(pixels: Rgb[], count: number): Rgb[][] {
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < count) {
    let target = -1;
    let score = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const { spread } = rangeOf(box);
      const weight = spread * Math.log2(box.length + 1);
      if (weight > score) {
        score = weight;
        target = index;
      }
    });
    if (target === -1) break;
    const box = boxes[target];
    const { channel } = rangeOf(box);
    const sorted = [...box].sort((a, b) => a[channel] - b[channel]);
    const middle = Math.floor(sorted.length / 2);
    boxes = [
      ...boxes.slice(0, target),
      sorted.slice(0, middle),
      sorted.slice(middle),
      ...boxes.slice(target + 1),
    ];
  }
  return boxes;
}

function averageOf(box: Rgb[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const pixel of box) {
    r += pixel[0];
    g += pixel[1];
    b += pixel[2];
  }
  return [r / box.length, g / box.length, b / box.length];
}

/**
 * The colours a screenshot is actually made of, most used first. Returns fewer
 * than asked for when the image genuinely has fewer distinct colours.
 */
export async function extractColors(blob: Blob, count = 5): Promise<string[]> {
  try {
    const pixels = await pixelsOf(blob);
    if (pixels.length < count) return [];
    // Cut deeper than needed, then drop the near-duplicates that come back.
    const boxes = medianCut(pixels, count * 2)
      .filter((box) => box.length > 0)
      .sort((a, b) => b.length - a.length);

    const picked: string[] = [];
    for (const box of boxes) {
      if (picked.length >= count) break;
      const hex = rgbToHex(averageOf(box));
      if (picked.every((kept) => colorDistance(kept, hex) > 10)) picked.push(hex);
    }
    return picked;
  } catch {
    // A palette is a nicety; never let it stop a screenshot being saved.
    return [];
  }
}

/* ------------------------------------------------------------- roles */

/** How colourful a hex is, 0 (neutral) to 1 (pure hue). */
export function chromaOf(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  return (Math.max(...rgb) - Math.min(...rgb)) / 255;
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const hi = Math.max(first, second);
  const lo = Math.min(first, second);
  return (hi + 0.05) / (lo + 0.05);
}

function bestText(palette: string[], background: string): string {
  let best = palette[0];
  let bestScore = -1;
  for (const color of palette) {
    const score = contrastRatio(color, background);
    // Ties go to the darker colour, which is what "text" usually means.
    if (score > bestScore || (score === bestScore && luminance(color) < luminance(best))) {
      best = color;
      bestScore = score;
    }
  }
  return best;
}

function mostChromatic(palette: string[], avoid: string[]): string {
  const candidates = palette.filter((color) => !avoid.includes(color));
  const pool = candidates.length ? candidates : palette;
  return pool.reduce((best, color) => (chromaOf(color) > chromaOf(best) ? color : best), pool[0]);
}

/**
 * Works out which swatch plays which part. Anything chosen by hand is kept, as
 * long as it is still in the palette; the rest is inferred. The palette arrives
 * most-used first, which is why the background starts there.
 */
export function resolveRoles(colors: string[], stored: ColorRoles = {}): ColorRoles {
  const palette = colors.filter((color) => Boolean(normalizeHex(color)));
  if (!palette.length) return {};

  const kept: ColorRoles = {};
  for (const role of COLOR_ROLES) {
    const value = stored[role];
    if (value && palette.includes(value)) kept[role] = value;
  }

  const background = kept.background ?? palette[0];
  const text = kept.text ?? bestText(palette, background);
  const accent = kept.accent ?? mostChromatic(palette, [background, text]);
  return { background, text, accent };
}

/** Drops roles pointing at colours that are no longer in the palette. */
export function pruneRoles(colors: string[], stored: ColorRoles = {}): ColorRoles {
  const next: ColorRoles = {};
  for (const role of COLOR_ROLES) {
    const value = stored[role];
    if (value && colors.includes(value)) next[role] = value;
  }
  return next;
}

/** Assigns one role, taking it off whichever swatch held it before. */
export function assignRole(stored: ColorRoles, role: ColorRole, color: string): ColorRoles {
  const next: ColorRoles = { ...stored };
  for (const other of COLOR_ROLES) {
    if (next[other] === color) delete next[other];
  }
  next[role] = color;
  return next;
}

export function clearRole(stored: ColorRoles, color: string): ColorRoles {
  const next: ColorRoles = { ...stored };
  for (const role of COLOR_ROLES) {
    if (next[role] === color) delete next[role];
  }
  return next;
}
