# Inspiration Archive

A private web app for a freelance web designer: websites worth learning from,
broken into their individual sections, with their fonts, colours and notes. The
point is retrieval — when designing a hotel homepage, "hotel hero sections with
a dark background" should be in hand in under ten seconds.

Two principles decide every trade-off:

1. **Sections, not sites.** The unit is a *shot* (one screenshot of one
   section). A site is only the parent that groups shots.
2. **Saving takes under a minute.** Only a URL or one image is required.
   Everything else can be filled in later.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS v4. Developed on Windows.
- Phases 1–3: everything lives in the browser in IndexedDB via Dexie. Images
  are stored as Blobs, converted to WebP and resized to 1600px wide.
- **All data access lives in `lib/store.ts`**, so Phase 4 can swap it for
  Supabase without touching UI code.

## Data model

```ts
type Section = 'hero'|'navigation'|'about'|'services'|'rooms'|'projects'|'gallery'|'team'|'testimonials'|'pricing'|'booking'|'contact'|'footer'|'loading'|'error-404'|'full-page'|'other';
type Industry = 'hotel'|'restaurant'|'interior-design'|'architecture'|'clinic'|'salon-beauty'|'agency-studio'|'portfolio'|'ecommerce'|'other';
type Source = 'Awwwards'|'Dribbble'|'Godly'|'Land-book'|'Behance'|'Other';
type ColorRole = 'background'|'text'|'accent';

interface Fonts {
  heading?: string;
  body?: string;
  /** A free stand-in to preview with when the real face is served nowhere. */
  headingPreview?: string;
  bodyPreview?: string;
}

interface Site {
  id: string; name: string;
  url?: string;           // the live site
  sourceUrl?: string;     // where it was found
  source: Source; designer?: string; industry: Industry;
  styles: string[];       // free tags: "minimal", "luxury", "horizontal scroll"
  fonts: Fonts;
  colors: string[];       // hex codes, max 8
  colorRoles?: Partial<Record<ColorRole, string>>;
  notes: string;
  caseStudyUrl?: string;
  favorite: boolean; isDemo?: boolean;
  createdAt: number; updatedAt: number;
}

interface Shot {
  id: string; siteId: string;
  section: Section | null;   // null = Unsorted
  device: 'desktop' | 'mobile';
  image?: Blob;              // only on single-shot reads; lists use hasImage
  hasImage: boolean;
  width?: number; height?: number;
  colors: string[];          // extracted from this image
  note: string; createdAt: number;
}

interface Collection { id: string; name: string; shotIds: string[]; createdAt: number; }
```

Two additions to the original model, both optional and both back-compatible:

- **`Shot.hasImage`** — image bytes live in their own table, so a library of
  hundreds of shots never pulls hundreds of blobs into memory. `Shot.image` is
  populated only when a single shot's bytes are asked for.
- **`Site.colorRoles`** — which palette entry is the background, the text and
  the accent. Only roles chosen by hand are stored; the rest are worked out from
  the palette each time (see *Colour roles*).
- **`Fonts.headingPreview` / `Fonts.bodyPreview`** — a substitute family to
  preview with when the named typeface is not served by Google Fonts or
  Fontshare. May be a family name or a generic such as `serif`.

## Screens

### Library (home)

- Masonry grid of shots at their natural aspect ratio. Toggle at the top:
  **Sections** (one tile per shot) / **Sites** (one tile per site, showing the
  shot it leads with).
- Each tile: image, then one line below with section name and site name. Hover
  shows favourite and open-site buttons; a shot with no image shows
  "Add screenshot".
- A shot without an image gets a typographic placeholder: site name set large,
  section below, dashed hairline border. With colours, the first one becomes the
  background and the text picks whichever ink reads on it.
- Search covers name, URL, designer, notes, styles, fonts, industry, **shot
  notes and colour families**, with a 150ms debounce. A query already in the
  address bar on arrival applies at once.
- Left filter rail: Section, Industry, Style, Colour, Font, Source, Device,
  Collection.
  Every option shows a count. Multi-select is OR inside a group, AND across
  groups. Options with no results are hidden; a group with more than six shows
  "Show all"; Style and Font get a find-as-you-type box past eight options.
- Smart filters at the top of the rail: All, Favourites, Unsorted,
  Needs details (a site missing fonts, colours, notes, or any screenshot).
- Active filters appear as removable chips above the grid with "Clear all".
  Sort: Newest, Oldest, A–Z.
- Clicking a font name, style tag, industry, source or device anywhere applies
  that filter. Swatches that show their hex copy it instead.
- **Select** turns the grid into a picker: tiles toggle instead of opening, and
  a bar along the bottom adds everything chosen to a collection.
- On mobile the rail becomes a bottom sheet behind a "Filters" button.

### Shot viewer

Full screen: the image on the left, a details panel on the right. Left and
right arrows move through the **current filtered results**; Esc closes.

The panel, top to bottom:

1. **Site name** in title case, "3 of 47", and a close button.
2. **Style preview card** — the site's own colours and type arranged the way it
   would arrange them: the site name as a heading in the heading font, one short
   line of body copy in the body font and text colour, and a small button in the
   accent colour. With neither fonts nor colours yet, it reads
   "Add fonts and colors to see a preview".
3. **Palette** — up to 8 swatches, hex below each. Clicking a swatch copies the
   hex and shows "Copied #1A1C1E"; hover gives a remove button; the hex line
   opens a small menu for setting its role. A dashed "+" adds a colour, using
   `window.EyeDropper` to click any pixel on screen where that exists and a
   colour input with a hex field where it does not.
4. **Type** — a row each for Heading and Body, each showing a large "Aa" and the
   font name, both set in the actual typeface. The name is editable inline with
   autocomplete from the archive's own fonts; the "Aa" filters the library by
   that font.
5. **Section, Device, Industry, Source** in a compact two-column grid. Section
   is an editable dropdown; the rest apply their filter.
6. **Styles**, as chips that apply their filter.
7. **Note** — this shot's note, editable inline.
8. **Actions** — Favourite, Add to collection, Open site.
9. **Delete shot** — a quiet text button at the very bottom, with a confirm.

### Collection page `/collection/[id]`

The collection's name, editable inline, and its shots in their own order. A tile
can be dragged to a new place, or its handle focused and moved with the arrow
keys. Each tile can be taken out of the collection; deleting the collection
leaves its shots in the archive. A link filters the library by the collection
instead.

Collections are reached from the Collection group in the filter rail, where each
option carries an arrow through to its page.

### Site page `/site/[id]`

Header with name, links, source, designer, industry, palette, fonts, styles and
notes, all editable inline. Shots grouped by section in the order the Section
type lists them. "Add screenshots" opens the add flow for this site.

### Add flow

A modal: URL, then screenshots (drop zone, multiple files, or paste), then
optional details. The name fills in from the URL's domain and stays editable.
Each image gets a row: thumbnail, section dropdown (empty = Unsorted),
desktop/mobile toggle and an optional note. Only a URL **or** one image is
required; a site saved with neither gets one empty shot so it still appears on
the wall.

Typing an address looks the page up through `/api/meta`: the name fills in from
the page's own title, and an `og:image` is offered as a screenshot, fetched back
through the same route so the browser can read its bytes.

### Saving from elsewhere

**Get the bookmarklet** in the overflow menu hands over a bookmark that opens
`/?add=1&url=…&title=…` for whatever page is open. The library reads those
parameters once, opens the add form filled in, and takes them back out of the
address bar so a reload stays quiet.

### `/api/meta`

`GET /api/meta?url=…` returns `{ url, title, description, siteName, image }`
read from the page's `<title>` and Open Graph tags.
`GET /api/meta?image=…` proxies that image so the browser, which cannot read
cross-origin bytes, can turn it into a screenshot.

This route fetches an address its caller chose, which is a request-forgery
shape. It only speaks http and https; it resolves the host and refuses every
loopback, private, link-local and carrier-grade address it answers with;
it follows redirects by hand so each hop is checked rather than only the first;
and it caps both the time it will wait and the number of bytes it will read.

## Colour

Every saved screenshot is sampled and reduced to five colours by median cut.
They are stored on the shot and merged into the site palette, skipping any
colour within a CIE76 distance of 10 of one already there, up to eight.

**Families.** For filtering, a hex falls into one of red, orange, yellow, green,
teal, blue, purple, pink, brown, black, white, grey. Neutrality is judged on
chroma rather than HSL saturation: saturation is a ratio that explodes near
white, so a warm off-white reads as a strong orange by that measure while its
chroma correctly says it is barely coloured. A saturated navy therefore stays
blue instead of collapsing into black.

**Roles.** `Site.colorRoles` stores only what was chosen by hand. Anything unset
is worked out from the palette:

- **Background** — the first entry, which is the most-used colour of the first
  screenshot, since extraction returns colours most-used first.
- **Text** — the best contrast ratio against the background, ties going to the
  darker colour.
- **Accent** — the most chromatic entry that is not already the background or
  text.

Removing a colour from the palette drops any role pointing at it.

## Type

Font names are shown in the typeface they name.

Faces are fetched at runtime, Fontshare first and then Google Fonts
(`:wght@400;600`, falling back to the unweighted request for families that only
ship one weight). Fontshare is asked first because it answers 200 with an empty
body for a family it does not have, while a miss at Google fails CORS and the
browser logs an error nothing can catch; asking the quiet one first keeps the
console clean for the foundry fonts that turn up most on the sites being saved.

The family name declared by the stylesheet is the one applied, not the one that
was typed. Answers, including "nobody has this", are cached for the browser
session. A name nobody serves shows **"Not on Google Fonts"** and offers a free
stand-in to preview with, either a family name or a generic serif or sans-serif.

Looking a name up sends that name to those two services. Nothing else about the
archive leaves the browser.

## Visual design

The app is a gallery wall: the saved designs are the content, so the interface
stays quiet.

- Light: canvas `#EEF0EE`, surface `#FFFFFF`, ink `#16181A`, muted `#5B6066`,
  hairline `#D9DCD8`, accent `#2F45D8`.
- Dark (follows the system, plus a manual toggle): canvas `#121314`, surface
  `#1B1C1E`, ink `#E9EAEB`, muted `#9A9EA3`, hairline `#2C2E31`,
  accent `#8E9BFF`.
- The accent is used only for selected filters, focus rings and the primary
  button. Colours belonging to a saved site are exempt: the style preview card
  and the palette show the site's own colours.
- Schibsted Grotesk via next/font. Sizes 13/15/18/24/32px. Weights 400/500/600.
- Hairline borders, 6px image corner radius, generous whitespace.
- No drop shadows, gradients, glows, emoji, all-caps labels, monospace labels or
  identical floating cards.
- Motion only in response to an action, 150–200ms ease-out. Respects
  `prefers-reduced-motion`. Visible keyboard focus everywhere, WCAG AA contrast,
  works from 360px wide upward.

## Keyboard

| Key | Does |
| --- | --- |
| `N` | Add site |
| `/` | Jump to the search box |
| `←` `→` | Previous and next shot in the viewer |
| `Esc` | Close the viewer or a dialog |

Pasting an image or a link anywhere on the library opens the add flow already
filled in.

## Backup

Export writes the whole archive as one JSON file, screenshots included as data
URLs. Import **adds** what is in the file under fresh ids, so a restore can
never take data away; importing the same file twice gives duplicates.

## Build phases

- **Phase 1 (done)** — project setup; `store.ts` with Dexie; demo data and
  banner; library grid with Sections/Sites toggle; search; Section, Industry,
  Source and Device filters with counts; filter chips; sort; shot viewer with
  arrow navigation; site page; add flow; edit and delete.
- **Phase 2 (done)** — colour extraction merged into the site palette; Colour
  filter by hue family; Font and Style filters with autocomplete; smart filters;
  filter, search, sort and view state in the query string; keyboard shortcuts;
  paste to add; JSON export and import with images.
- **Phase 3 (done)** — Collections (create, add shots from the viewer or by
  multi-selecting tiles, reorder by drag, collection page); a bookmarklet that
  opens the add flow with the current page's URL and title; a `/api/meta` route
  that fetches a URL's title and og:image to fill the add form.
- **Phase 4** — move storage to Supabase (Postgres + Storage) through
  `store.ts`; sign-in; a one-time import from IndexedDB; a read-only share link
  for a single collection.

## Done means

- Adding a site with 3 screenshots takes under 60 seconds.
- "hotel + hero" and "interior-design + projects" return correct results with
  correct counts.
- Viewer arrows stay inside the current filtered results.
- Reloading keeps all data. Nothing breaks with 0 sites or with 500 shots.
- No console errors, and `npm run build` passes.
