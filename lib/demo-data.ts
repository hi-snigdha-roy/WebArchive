import type { Device, Industry, Section, Source } from './types';

interface DemoShot {
  section: Section | null;
  device?: Device;
  note?: string;
}

interface DemoSite {
  name: string;
  url?: string;
  source: Source;
  designer?: string;
  industry: Industry;
  sourceUrl?: string;
  styles: string[];
  shots: DemoShot[];
}

// Loaded on first run so the library is never empty on arrival. Fonts, colours
// and notes are deliberately left blank so "Needs details" has something to show.
export const DEMO_SITES: DemoSite[] = [
  {
    name: 'Røroshotellene',
    source: 'Awwwards',
    designer: 'Spoon',
    industry: 'hotel',
    sourceUrl: 'https://www.awwwards.com/inspiration/hotel-frontpage-top-section-roroshotellene',
    styles: [],
    shots: [
      { section: 'hero', note: 'Top sections' },
      { section: 'navigation', note: 'Navigation with booking bar' },
      { section: 'rooms', note: 'Room pages' },
      { section: 'services', note: 'Guided tours and experiences' },
      { section: 'full-page', device: 'mobile', note: 'Mobile' },
    ],
  },
  {
    name: 'Laghetto',
    source: 'Awwwards',
    designer: 'Duck Design Studio',
    industry: 'hotel',
    sourceUrl: 'https://www.awwwards.com/inspiration/hotel-cards-navigation-laghetto',
    styles: [],
    shots: [
      { section: 'navigation', note: 'Hotel cards navigation' },
      { section: 'navigation', note: 'Main menu' },
      { section: 'about', note: 'About us section' },
    ],
  },
  {
    name: 'Parklanecph',
    url: 'https://parklanecph.com',
    source: 'Awwwards',
    designer: 'Brand by Hand',
    industry: 'hotel',
    sourceUrl: 'https://www.awwwards.com/inspiration/sections-parklanecph-com',
    styles: [],
    shots: [
      { section: 'full-page', note: 'Homepage' },
      { section: 'navigation', note: 'Burger menu' },
      { section: 'rooms', note: 'Rooms and suites' },
      { section: 'rooms', note: 'Room details' },
      { section: 'gallery', note: 'Gallery' },
    ],
  },
  {
    name: 'Sir Albert Hotel',
    source: 'Awwwards',
    designer: 'Joanna Chabowska',
    industry: 'hotel',
    sourceUrl:
      'https://www.awwwards.com/inspiration/official-website-sir-albert-hotel-amsterdam-de-pijp-sir-hotels-1',
    styles: [],
    shots: [{ section: 'full-page', note: 'Homepage' }],
  },
  {
    name: 'Tom Mark Henry: Vibe Hotel',
    source: 'Awwwards',
    designer: 'Chris Biron',
    industry: 'interior-design',
    sourceUrl: 'https://www.awwwards.com/inspiration/vibe-hotel-rushcutters-bay-tom-mark-henry',
    styles: [],
    shots: [{ section: 'projects', note: 'Hotel interior project page' }],
  },
  {
    name: 'Studio Iro',
    source: 'Awwwards',
    designer: 'UNFOUND STUDIO',
    industry: 'interior-design',
    sourceUrl: 'https://www.awwwards.com/inspiration/homepage-studio-iro',
    styles: ['animation'],
    shots: [
      { section: 'full-page', note: 'Homepage' },
      { section: 'loading', note: 'Opening animation' },
      { section: 'services', note: 'Services' },
      { section: 'projects', note: 'Projects' },
      { section: 'navigation', note: 'Menu' },
    ],
  },
  {
    name: 'Material Creative',
    source: 'Awwwards',
    designer: 'Made-studio',
    industry: 'interior-design',
    sourceUrl: 'https://www.awwwards.com/inspiration/our-story-material-creative',
    styles: ['shopify'],
    shots: [
      { section: 'about', note: 'Our story' },
      { section: 'services', note: 'Services' },
      { section: 'projects', note: 'Featured projects' },
      { section: 'team', note: 'Meet the team' },
      { section: 'other', note: 'Process' },
    ],
  },
  {
    name: 'House of Honey',
    source: 'Awwwards',
    designer: 'Réplica',
    industry: 'interior-design',
    sourceUrl: 'https://www.awwwards.com/inspiration/projects-showcase-house-of-honey',
    styles: ['horizontal scroll'],
    shots: [
      { section: 'projects', note: 'Projects showcase with horizontal scrolling' },
      { section: 'navigation', note: 'Menu' },
      { section: 'about', note: 'Our studio' },
    ],
  },
  {
    name: 'Arkitektkontoret Vest',
    source: 'Awwwards',
    designer: 'Emele Collab',
    industry: 'architecture',
    sourceUrl: 'https://www.awwwards.com/inspiration/about-us-arkitektkontoret-vest',
    styles: ['page transitions', 'infinite scroll'],
    shots: [
      { section: 'about', note: 'About us' },
      { section: 'team', note: 'Team' },
      { section: 'projects', note: 'Project detail' },
      { section: 'gallery', note: 'Gallery' },
      { section: 'contact', note: 'Contact' },
      { section: 'footer', note: 'Footer' },
    ],
  },
  {
    name: 'THE WALL. Communications',
    source: 'Awwwards',
    designer: 'The Wall',
    industry: 'agency-studio',
    sourceUrl: 'https://www.awwwards.com/inspiration/studio-the-wall-communications',
    styles: ['smooth scroll'],
    shots: [
      { section: 'about', note: 'Studio' },
      { section: 'projects', note: 'Portfolio' },
      { section: 'pricing', note: 'Pricing' },
      { section: 'gallery', note: 'Gallery' },
      { section: 'footer', note: 'Footer' },
    ],
  },
  {
    name: 'Le:mma Studio',
    source: 'Awwwards',
    designer: 'Artemii Lebedev',
    industry: 'agency-studio',
    sourceUrl: 'https://www.awwwards.com/inspiration/creative-studio',
    styles: ['clean', 'fullscreen', 'big background images'],
    shots: [
      { section: 'hero', note: 'Hero image' },
      { section: 'footer', note: 'Footer' },
      { section: 'error-404', note: '404 page' },
    ],
  },
  {
    name: 'WA Studio',
    source: 'Awwwards',
    designer: 'WA-STUDIO',
    industry: 'agency-studio',
    sourceUrl: 'https://www.awwwards.com/inspiration/about-page-wa-studio',
    styles: [],
    shots: [
      { section: 'about', note: 'About page with service list' },
      { section: 'team', note: 'Team members' },
      { section: 'projects', note: 'Project page' },
      { section: 'footer', note: 'Interactive footer' },
    ],
  },
];
