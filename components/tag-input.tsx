'use client';

import Link from 'next/link';
import { useId, useState, type KeyboardEvent } from 'react';
import { CloseIcon } from './icons';
import { cn } from '@/lib/utils';

interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
  /** When given, each tag's label links there, usually to its own filter. */
  hrefFor?: (value: string) => string;
}

export function TagInput({
  values,
  onChange,
  suggestions = [],
  placeholder = 'Add a style',
  className,
  hrefFor,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const open = suggestions.filter((item) => !values.includes(item));

  const add = (raw: string) => {
    const value = raw.trim().replace(/,$/, '').trim();
    if (!value) return;
    if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div
      className={cn(
        'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[4px] border border-hairline bg-surface px-1.5 py-1 transition-colors duration-150 motion-ease hover:border-muted focus-within:border-muted',
        className,
      )}
    >
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex h-6 items-center gap-1 rounded-[3px] border border-hairline px-1.5 text-13"
        >
          {hrefFor ? (
            <Link
              href={hrefFor(value)}
              title={`Show everything tagged ${value}`}
              className="hover:underline"
            >
              {value}
            </Link>
          ) : (
            value
          )}
          <button
            type="button"
            onClick={() => onChange(values.filter((item) => item !== value))}
            aria-label={`Remove ${value}`}
            className="text-muted transition-colors duration-150 motion-ease hover:text-ink"
          >
            <CloseIcon width={12} height={12} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        list={open.length ? listId : undefined}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={values.length ? '' : placeholder}
        className="h-7 min-w-24 flex-1 bg-transparent px-1 text-15 outline-none"
      />
      {open.length ? (
        <datalist id={listId}>
          {open.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
