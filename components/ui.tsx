'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons';
import { cn, readableInk } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'solid';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-90',
  secondary: 'border border-hairline bg-surface hover:border-muted',
  ghost: 'text-muted hover:text-ink hover:bg-surface',
  solid: 'bg-ink text-canvas hover:opacity-90',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'secondary', className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[4px] px-3 text-13 font-medium transition-colors duration-150 motion-ease disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
}

export function IconButton({ label, variant = 'ghost', className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-[4px] transition-colors duration-150 motion-ease disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  /** Hides the option labels below the small breakpoint, leaving the icons. */
  compact?: boolean;
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  compact = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex h-9 shrink-0 items-center gap-0.5 rounded-[4px] border border-hairline p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={compact ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-full items-center gap-1.5 rounded-[3px] px-2.5 text-13 font-medium transition-colors duration-150 motion-ease',
              active ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {option.icon}
            <span className={compact ? 'hidden sm:inline' : undefined}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const FIELD_BASE =
  'w-full rounded-[4px] border border-hairline bg-surface px-2.5 text-15 outline-none transition-colors duration-150 motion-ease hover:border-muted';

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_BASE, 'h-9', className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, 'resize-y py-2 leading-[22px]', className)} {...props} />;
}

export function Select({
  className,
  wrapperClassName,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={cn('relative inline-flex w-full items-center', wrapperClassName)}>
      <select className={cn(FIELD_BASE, 'h-9 cursor-pointer pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 text-muted" />
    </span>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}

/** Wrapping the control in the label avoids plumbing ids through every control. */
export function Field({ label, children, hint, className }: FieldProps) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-13 text-muted">{label}</span>
      {children}
      {hint ? <span className="text-13 text-muted">{hint}</span> : null}
    </label>
  );
}

interface SwatchProps {
  color: string;
  onClick?: () => void;
  label?: string;
  size?: 'sm' | 'md';
}

export function Swatch({ color, onClick, label, size = 'md' }: SwatchProps) {
  const dimension = size === 'sm' ? 'size-4' : 'size-6';
  const content = (
    <span
      className={cn(dimension, 'block rounded-[3px] border border-hairline')}
      style={{ background: color }}
    />
  );
  if (!onClick) return content;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? `Copy ${color}`}
      title={label ?? `Copy ${color}`}
      className="rounded-[3px] transition-opacity duration-150 motion-ease hover:opacity-80"
    >
      {content}
    </button>
  );
}

/** A colour chip that shows its own hex in readable ink. */
export function ColorChip({ color, onClick }: { color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-hairline px-1.5 text-13 transition-opacity duration-150 motion-ease enabled:hover:opacity-80"
      style={{ background: color, color: readableInk(color) }}
    >
      {color}
    </button>
  );
}

interface MenuProps {
  label: string;
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
}

/** A small popover for actions that do not deserve room in the header. */
export function Menu({ label, icon, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={holder} className="relative">
      <IconButton label={label} aria-expanded={open} onClick={() => setOpen((prev) => !prev)}>
        {icon}
      </IconButton>
      {open ? (
        <div
          role="menu"
          className="ia-rise absolute right-0 top-full z-40 mt-1 flex w-56 flex-col rounded-[6px] border border-hairline bg-surface p-1"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-[4px] px-2 text-left text-13 transition-colors duration-150 motion-ease hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}
