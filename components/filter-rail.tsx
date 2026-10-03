'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FontName } from './font-name';
import { CheckIcon, ChevronRightIcon, SearchIcon } from './icons';
import { FAMILY_SWATCHES, type ColorFamily } from '@/lib/colors';
import type { FilterActions } from '@/lib/filter-url';
import {
  FILTER_GROUPS,
  GROUP_LABELS,
  SMART_FILTERS,
  SMART_LABELS,
  visibleOptions,
  type Counts,
  type FilterGroup,
  type FilterState,
  type GroupOption,
  type LibraryIndex,
  type SmartFilter,
} from '@/lib/library';
import { cn } from '@/lib/utils';

const COLLAPSED = 6;
/**
 * Style and Font are open vocabularies that grow with the archive, so past this
 * many options they get a box to type into. The fixed groups never need one.
 */
const FREE_TEXT: FilterGroup[] = ['style', 'font'];
const SEARCHABLE = 8;

interface RailProps {
  filters: FilterState;
  counts: Counts;
  smartCounts: Record<SmartFilter, number>;
  index: LibraryIndex;
  actions: FilterActions;
}

export function FilterRail({ filters, counts, smartCounts, index, actions }: RailProps) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <ul>
          {SMART_FILTERS.map((smart) => {
            const active = filters.smart === smart;
            return (
              <li key={smart}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => actions.setSmart(smart)}
                  className="flex w-full items-center gap-2 py-1 text-left text-13"
                >
                  <span
                    className={cn(
                      'flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 motion-ease',
                      active ? 'border-accent bg-accent' : 'border-hairline',
                    )}
                  >
                    {active ? <span className="size-1 rounded-full bg-accent-ink" /> : null}
                  </span>
                  <span className={cn('min-w-0 flex-1 truncate', !active && 'text-muted')}>
                    {SMART_LABELS[smart]}
                  </span>
                  <span className="shrink-0 text-muted">{smartCounts[smart]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {FILTER_GROUPS.map((group) => (
        <Group
          key={group}
          group={group}
          options={visibleOptions(group, counts, filters, index)}
          selectedCount={filters[group].length}
          onToggle={(value) => actions.toggle(group, value)}
          onClear={() => filters[group].forEach((value) => actions.remove(group, value))}
        />
      ))}
    </div>
  );
}

interface GroupProps {
  group: FilterGroup;
  options: GroupOption[];
  selectedCount: number;
  onToggle: (value: string) => void;
  onClear: () => void;
}

function Group({ group, options, selectedCount, onToggle, onClear }: GroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  if (!options.length) return null;

  const searchable = FREE_TEXT.includes(group) && options.length > SEARCHABLE;
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? options.filter((option) => option.label.toLowerCase().includes(needle))
    : options;
  const shown = expanded || needle ? matching : matching.slice(0, COLLAPSED);

  return (
    <section>
      <header className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-13 text-muted">{GROUP_LABELS[group]}</h3>
        {selectedCount ? (
          <button
            type="button"
            onClick={onClear}
            className="text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </header>

      {searchable ? (
        <div className="relative mb-1.5 flex items-center">
          <SearchIcon width={13} height={13} className="pointer-events-none absolute left-2 text-muted" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Find a ${GROUP_LABELS[group].toLowerCase()}`}
            aria-label={`Find a ${GROUP_LABELS[group].toLowerCase()}`}
            className="h-7 w-full rounded-[4px] border border-hairline bg-surface pl-7 pr-2 text-13 outline-none transition-colors duration-150 motion-ease hover:border-muted"
          />
        </div>
      ) : null}

      <ul>
        {shown.map((option) => (
          <li key={option.value} className="group/option flex items-center gap-1">
            <button
              type="button"
              aria-pressed={option.selected}
              onClick={() => onToggle(option.value)}
              className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left text-13"
            >
              <span
                className={cn(
                  'flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors duration-150 motion-ease',
                  option.selected ? 'border-accent bg-accent text-accent-ink' : 'border-hairline',
                )}
              >
                {option.selected ? <CheckIcon width={11} height={11} /> : null}
              </span>
              {group === 'color' ? (
                <span
                  aria-hidden="true"
                  className="size-3 shrink-0 rounded-[3px] border border-hairline"
                  style={{ background: FAMILY_SWATCHES[option.value as ColorFamily] }}
                />
              ) : null}
              <span className={cn('min-w-0 flex-1 truncate', !option.selected && 'text-muted')}>
                {group === 'font' ? <FontName name={option.label} /> : option.label}
              </span>
              <span className="shrink-0 text-muted">{option.count}</span>
            </button>
            {group === 'collection' ? (
              <Link
                href={`/collection/${option.value}`}
                aria-label={`Open ${option.label}`}
                title="Open this collection"
                className="shrink-0 rounded-[3px] p-0.5 text-muted opacity-0 transition-opacity duration-150 motion-ease group-hover/option:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRightIcon width={14} height={14} />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      {!needle && matching.length > COLLAPSED ? (
        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          className="mt-1 text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
        >
          {expanded ? 'Show less' : `Show all ${matching.length}`}
        </button>
      ) : null}

      {needle && !matching.length ? (
        <p className="text-13 text-muted">Nothing matches</p>
      ) : null}
    </section>
  );
}
