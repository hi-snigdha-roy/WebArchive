import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// Reads a page's title and og:image so the add form can fill itself in, and
// proxies that image so the browser can turn it into a screenshot.
//
// This route fetches a URL the caller chose, which is a request-forgery shape.
// Everything below exists to keep it from reaching anything but the public web:
// the scheme is checked, the host is resolved and every address it answers with
// is checked against the private ranges, redirects are followed by hand with
// the same checks at each hop, and both the time and the number of bytes read
// are capped.

const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa)$/i;

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (version === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fe80') || value.startsWith('fc') || value.startsWith('fd')) return true;
    // IPv4 written inside IPv6, e.g. ::ffff:127.0.0.1
    const tail = value.split(':').pop() ?? '';
    if (isIP(tail) === 4) return isPrivateAddress(tail);
    return false;
  }
  return false;
}

async function assertReachable(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a web address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https addresses can be read.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTS.test(host)) throw new Error('That address is not reachable from here.');

  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('That address is not reachable from here.');
    return url;
  }

  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error('That address could not be found.');
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('That address is not reachable from here.');
  }
  return url;
}

/** Follows redirects by hand so every hop is checked, not just the first. */
async function safeFetch(raw: string, accept: string): Promise<{ response: Response; url: URL }> {
  let target = await assertReachable(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept, 'user-agent': 'InspirationArchive/1.0' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { response, url: target };
      target = await assertReachable(new URL(location, target).toString());
      continue;
    }
    return { response, url: target };
  }
  throw new Error('That address redirected too many times.');
}

async function readCapped(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size >= limit) {
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk.subarray(0, Math.min(chunk.length, size - at)), at);
    at += chunk.length;
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#x27': "'",
};

function decode(value: string): string {
  return value
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, name: string) => {
      const key = name.toLowerCase();
      if (ENTITIES[key]) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(Number(key.slice(1)));
      return match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, property: string): string | undefined {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*>`,
    'i',
  );
  const tag = pattern.exec(html)?.[0];
  if (!tag) return undefined;
  const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
  return content ? decode(content) : undefined;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const image = params.get('image');
  const page = params.get('url');

  try {
    if (image) {
      const { response } = await safeFetch(image, 'image/*');
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !type.startsWith('image/')) {
        return Response.json({ error: 'That is not an image.' }, { status: 422 });
      }
      const bytes = await readCapped(response, MAX_IMAGE_BYTES);
      return new Response(new Blob([bytes], { type }), {
        headers: { 'content-type': type, 'cache-control': 'no-store' },
      });
    }

    if (!page) {
      return Response.json({ error: 'Pass a url to read.' }, { status: 400 });
    }

    const { response, url } = await safeFetch(page, 'text/html');
    if (!response.ok) {
      return Response.json({ error: `That page answered ${response.status}.` }, { status: 422 });
    }
    const html = new TextDecoder().decode(await readCapped(response, MAX_HTML_BYTES));

    const rawImage = metaContent(html, 'og:image') ?? metaContent(html, 'twitter:image');
    const title =
      metaContent(html, 'og:title') ??
      (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
        ? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)![1])
        : undefined);

    return Response.json(
      {
        url: url.toString(),
        title,
        description: metaContent(html, 'og:description') ?? metaContent(html, 'description'),
        siteName: metaContent(html, 'og:site_name'),
        // Absolute, so the browser can hand it straight back for proxying.
        image: rawImage ? new URL(rawImage, url).toString() : undefined,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (problem) {
    const message = problem instanceof Error ? problem.message : 'That could not be read.';
    return Response.json({ error: message }, { status: 422 });
  }
}
