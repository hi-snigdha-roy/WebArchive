// Screenshots are converted to WebP and downscaled before they are stored, so a
// library of a few hundred shots stays small enough to live in IndexedDB.

export const MAX_WIDTH = 1600;
/** Browsers refuse to rasterise very large canvases; full-page shots can be enormous. */
const MAX_HEIGHT = 12000;
const QUALITY = 0.82;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
}

export function isImageFile(file: File | Blob): boolean {
  return typeof file.type === 'string' && file.type.startsWith('image/');
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path, which handles a few formats bitmaps don't.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That file could not be read as an image.'));
      el.src = url;
    });
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function rasterise(decoded: Decoded, width: number, height: number): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(decoded.source, 0, 0, width, height);
      return canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('This browser cannot process images.'))),
      'image/webp',
      QUALITY,
    );
  });
}

export async function processImage(file: Blob): Promise<ProcessedImage> {
  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error('That file could not be read as an image.');
    }
    const scale = Math.min(1, MAX_WIDTH / decoded.width, MAX_HEIGHT / decoded.height);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));
    const blob = await rasterise(decoded, width, height);
    return { blob, width, height };
  } finally {
    decoded.release();
  }
}
