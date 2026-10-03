'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface InlineTextProps {
  value: string;
  onSave: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  /** id of a datalist to autocomplete from. */
  list?: string;
  style?: CSSProperties;
}

const INLINE_BASE =
  '-mx-1.5 w-full rounded-[4px] border border-transparent bg-transparent px-1.5 outline-none transition-colors duration-150 motion-ease hover:border-hairline focus:border-hairline';

/** Looks like text until you point at it; saves on blur or Enter, Esc reverts. */
export function InlineText({ value, onSave, label, placeholder, className, list, style }: InlineTextProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      ref.current?.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(value);
      focused.current = false;
      ref.current?.blur();
    }
  };

  return (
    <input
      ref={ref}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      list={list}
      style={style}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focused.current = false;
        // Read the field itself rather than the draft this render closed over.
        if (event.target.value !== value) onSave(event.target.value);
      }}
      onKeyDown={onKeyDown}
      className={cn(INLINE_BASE, className)}
    />
  );
}

export function InlineTextArea({ value, onSave, label, placeholder, className }: InlineTextProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      rows={3}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focused.current = false;
        if (event.target.value !== value) onSave(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(value);
          focused.current = false;
          ref.current?.blur();
        }
      }}
      className={cn(INLINE_BASE, 'resize-y py-1 leading-[22px]', className)}
    />
  );
}
