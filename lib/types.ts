// The vocabulary of the archive. Order matters: SECTIONS is the order shots are
// grouped in on a site page, and the order the Section filter lists options.

export const SECTIONS = [
  'hero',
  'navigation',
  'about',
  'services',
  'rooms',
  'projects',
  'gallery',
  'team',
  'testimonials',
  'pricing',
  'booking',
  'contact',
  'footer',
  'loading',
  'error-404',
  'full-page',
  'other',
] as const;
export type Section = (typeof SECTIONS)[number];

export const INDUSTRIES = [
  'hotel',
  'restaurant',
  'interior-design',
  'architecture',
  'clinic',
  'salon-beauty',
  'agency-studio',
  'portfolio',
  'ecommerce',
  'other',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const SOURCES = ['Awwwards', 'Dribbble', 'Godly', 'Land-book', 'Behance', 'Other'] as const;
export type Source = (typeof SOURCES)[number];

export const DEVICES = ['desktop', 'mobile'] as const;
export type Device = (typeof DEVICES)[number];

export const MAX_COLORS = 8;

export const COLOR_ROLES = ['background', 'text', 'accent'] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];

export const ROLE_LABELS: Record<ColorRole, string> = {
  background: 'Background',
  text: 'Text',
  accent: 'Accent',
};

/** Short forms, for the caption under a swatch. */
export const ROLE_SHORT: Record<ColorRole, string> = {
  background: 'Bg',
  text: 'Text',
  accent: 'Accent',
};

export interface Fonts {
  heading?: string;
  body?: string;
  /**
   * A free stand-in to preview with when the real typeface is not served
   * anywhere. May be a family name or a generic like "serif".
   */
  headingPreview?: string;
  bodyPreview?: string;
}

export type ColorRoles = Partial<Record<ColorRole, string>>;

export interface Site {
  id: string;
  name: string;
  url?: string;
  sourceUrl?: string;
  source: Source;
  designer?: string;
  industry: Industry;
  styles: string[];
  fonts: Fonts;
  colors: string[];
  /** Which palette entry plays which part. Unset roles are worked out. */
  colorRoles?: ColorRoles;
  notes: string;
  caseStudyUrl?: string;
  favorite: boolean;
  isDemo?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Shot {
  id: string;
  siteId: string;
  /** null = Unsorted */
  section: Section | null;
  device: Device;
  /**
   * Only populated when a single shot's bytes are asked for. List reads leave it
   * undefined and use `hasImage` instead, so a library of 500 shots never pulls
   * 500 blobs into memory at once.
   */
  image?: Blob;
  hasImage: boolean;
  width?: number;
  height?: number;
  colors: string[];
  note: string;
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  shotIds: string[];
  createdAt: number;
}

const SECTION_LABELS: Record<Section, string> = {
  hero: 'Hero',
  navigation: 'Navigation',
  about: 'About',
  services: 'Services',
  rooms: 'Rooms',
  projects: 'Projects',
  gallery: 'Gallery',
  team: 'Team',
  testimonials: 'Testimonials',
  pricing: 'Pricing',
  booking: 'Booking',
  contact: 'Contact',
  footer: 'Footer',
  loading: 'Loading',
  'error-404': '404 page',
  'full-page': 'Full page',
  other: 'Other',
};

const INDUSTRY_LABELS: Record<Industry, string> = {
  hotel: 'Hotel',
  restaurant: 'Restaurant',
  'interior-design': 'Interior design',
  architecture: 'Architecture',
  clinic: 'Clinic',
  'salon-beauty': 'Salon & beauty',
  'agency-studio': 'Agency & studio',
  portfolio: 'Portfolio',
  ecommerce: 'E-commerce',
  other: 'Other',
};

export const UNSORTED = '__unsorted';

export function sectionLabel(section: Section | null | undefined): string {
  if (!section) return 'Unsorted';
  return SECTION_LABELS[section] ?? section;
}

export function industryLabel(industry: Industry | string): string {
  return INDUSTRY_LABELS[industry as Industry] ?? industry;
}

export function deviceLabel(device: Device | string): string {
  return device === 'mobile' ? 'Mobile' : 'Desktop';
}

/**
 * Capitalises each word that starts lower-case, leaving deliberate casing such
 * as "THE WALL." or "Le:mma" alone.
 */
export function titleCase(name: string): string {
  return name.replace(/(^|\s)(\p{Ll})/gu, (match, lead: string, letter: string) =>
    `${lead}${letter.toUpperCase()}`,
  );
}

export function sectionOrder(section: Section | null): number {
  if (!section) return SECTIONS.length;
  const i = SECTIONS.indexOf(section);
  return i === -1 ? SECTIONS.length : i;
}
