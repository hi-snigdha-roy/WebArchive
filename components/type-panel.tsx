'use client';

import { useId } from 'react';
import { InlineText } from './inline';
import { previewStyle, useTypeface } from '@/lib/fonts';
import { updateSite } from '@/lib/store';
import type { Site } from '@/lib/types';

interface TypePanelProps {
  site: Site;
  /** Typefaces already named somewhere in the archive, for autocomplete. */
  suggestions: string[];
  onFilter: (font: string) => void;
}

export function TypePanel({ site, suggestions, onFilter }: TypePanelProps) {
  const listId = useId();
  return (
    <div className="flex flex-col gap-3">
      <TypeRow
        label="Heading"
        name={site.fonts.heading ?? ''}
        substitute={site.fonts.headingPreview ?? ''}
        weight={600}
        listId={listId}
        onFilter={onFilter}
        onRename={(heading) => void updateSite(site.id, { fonts: { ...site.fonts, heading } })}
        onSubstitute={(headingPreview) =>
          void updateSite(site.id, { fonts: { ...site.fonts, headingPreview } })
        }
      />
      <TypeRow
        label="Body"
        name={site.fonts.body ?? ''}
        substitute={site.fonts.bodyPreview ?? ''}
        weight={400}
        listId={listId}
        onFilter={onFilter}
        onRename={(body) => void updateSite(site.id, { fonts: { ...site.fonts, body } })}
        onSubstitute={(bodyPreview) =>
          void updateSite(site.id, { fonts: { ...site.fonts, bodyPreview } })
        }
      />
      <datalist id={listId}>
        {suggestions.map((font) => (
          <option key={font} value={font} />
        ))}
      </datalist>
    </div>
  );
}

interface TypeRowProps {
  label: string;
  name: string;
  substitute: string;
  weight: number;
  listId: string;
  onFilter: (font: string) => void;
  onRename: (value: string) => void;
  onSubstitute: (value: string) => void;
}

function TypeRow({
  label,
  name,
  substitute,
  weight,
  listId,
  onFilter,
  onRename,
  onSubstitute,
}: TypeRowProps) {
  const { family, missing } = useTypeface(name, substitute);
  const style = previewStyle(family, weight);

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        disabled={!name}
        onClick={() => onFilter(name)}
        title={name ? `Show everything set in ${name}` : undefined}
        aria-label={name ? `Show everything set in ${name}` : 'No typeface yet'}
        className="h-12 w-12 shrink-0 rounded-[4px] border border-hairline text-24 leading-none transition-colors duration-150 motion-ease enabled:hover:border-muted disabled:opacity-40"
        style={style}
      >
        Aa
      </button>

      <div className="min-w-0 flex-1">
        <p className="text-13 text-muted">{label}</p>
        <InlineText
          value={name}
          label={`${label} typeface`}
          placeholder="Not set"
          list={listId}
          onSave={onRename}
          className="text-18"
          style={style}
        />
        {name && missing ? (
          <div className="mt-1">
            <p className="text-13 text-muted">Not on Google Fonts</p>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                defaultValue={substitute}
                key={substitute}
                onBlur={(event) => {
                  if (event.target.value.trim() !== substitute) onSubstitute(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                list={listId}
                placeholder="Preview with…"
                aria-label={`Preview ${label.toLowerCase()} with another typeface`}
                className="h-7 min-w-0 flex-1 rounded-[4px] border border-hairline bg-surface px-2 text-13 outline-none transition-colors duration-150 motion-ease hover:border-muted"
              />
              <button
                type="button"
                onClick={() => onSubstitute('serif')}
                className="h-7 shrink-0 rounded-[4px] border border-hairline px-2 text-13 transition-colors duration-150 motion-ease hover:border-muted"
                style={{ fontFamily: 'serif' }}
              >
                Serif
              </button>
              <button
                type="button"
                onClick={() => onSubstitute('sans-serif')}
                className="h-7 shrink-0 rounded-[4px] border border-hairline px-2 text-13 transition-colors duration-150 motion-ease hover:border-muted"
                style={{ fontFamily: 'sans-serif' }}
              >
                Sans
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
