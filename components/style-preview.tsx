'use client';

import { contrastRatio, resolveRoles } from '@/lib/colors';
import { previewStyle, useTypeface } from '@/lib/fonts';
import { titleCase, type Site } from '@/lib/types';
import { readableInk } from '@/lib/utils';

const SAMPLE = 'Stay a while. The view is better in person.';

/**
 * The site's own colours and type, arranged the way it would arrange them:
 * a heading, a line of body copy and a button.
 */
export function StylePreview({ site }: { site: Site }) {
  const heading = useTypeface(site.fonts.heading, site.fonts.headingPreview);
  const body = useTypeface(site.fonts.body, site.fonts.bodyPreview);

  const hasFonts = Boolean(site.fonts.heading || site.fonts.body);
  if (!site.colors.length && !hasFonts) {
    return (
      <p className="rounded-[6px] border border-dashed border-hairline px-3 py-6 text-center text-13 text-muted">
        Add fonts and colors to see a preview
      </p>
    );
  }

  const roles = resolveRoles(site.colors, site.colorRoles);
  const background = roles.background ?? null;
  // A palette of one would set the text in the background colour.
  const chosen = roles.text ?? null;
  const ink =
    background && (!chosen || contrastRatio(chosen, background) < 1.6)
      ? readableInk(background)
      : chosen;
  const accent = roles.accent ?? null;

  return (
    <div
      className={`rounded-[6px] border border-hairline p-4 ${background ? '' : 'bg-surface text-ink'}`}
      style={background ? { background, color: ink ?? undefined } : undefined}
    >
      <p className="truncate text-24" style={previewStyle(heading.family, 600)}>
        {titleCase(site.name)}
      </p>
      <p className="mt-1.5 text-15 opacity-80" style={previewStyle(body.family)}>
        {SAMPLE}
      </p>
      <span
        className={`mt-3 inline-flex h-8 items-center rounded-[4px] px-3 text-13 font-medium ${
          accent ? '' : 'border border-hairline'
        }`}
        style={
          accent
            ? { ...previewStyle(body.family), background: accent, color: readableInk(accent) }
            : previewStyle(body.family)
        }
      >
        Learn more
      </span>
    </div>
  );
}
