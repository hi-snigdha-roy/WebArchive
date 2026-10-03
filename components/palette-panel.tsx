'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon, PlusIcon } from './icons';
import { useToast } from './toast';
import { Button } from './ui';
import { assignRole, clearRole, resolveRoles } from '@/lib/colors';
import { hasEyeDropper, pickFromScreen } from '@/lib/eyedropper';
import { updateSite } from '@/lib/store';
import {
  COLOR_ROLES,
  MAX_COLORS,
  ROLE_LABELS,
  ROLE_SHORT,
  type ColorRole,
  type Site,
} from '@/lib/types';
import { cn, copyText, normalizeHex } from '@/lib/utils';

export function PalettePanel({ site }: { site: Site }) {
  const toast = useToast();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState('#');
  const holder = useRef<HTMLDivElement>(null);

  const roles = resolveRoles(site.colors, site.colorRoles);
  const assigned = site.colorRoles ?? {};

  useEffect(() => {
    if (!menuFor) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setMenuFor(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuFor]);

  const copy = async (hex: string) => {
    toast((await copyText(hex)) ? `Copied ${hex}` : 'Could not copy');
  };

  const add = (raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    if (site.colors.includes(hex) || site.colors.length >= MAX_COLORS) return;
    void updateSite(site.id, { colors: [...site.colors, hex] });
    setDraft('#');
    setPicking(false);
  };

  const remove = (hex: string) => {
    void updateSite(site.id, { colors: site.colors.filter((color) => color !== hex) });
    setMenuFor(null);
  };

  const setRole = (hex: string, role: ColorRole | null) => {
    const next = role ? assignRole(assigned, role, hex) : clearRole(assigned, hex);
    void updateSite(site.id, { colorRoles: next });
    setMenuFor(null);
  };

  const pick = async () => {
    if (hasEyeDropper()) {
      const hex = await pickFromScreen();
      if (hex) add(hex);
      return;
    }
    setPicking((previous) => !previous);
  };

  /** Which role a swatch is actually playing, chosen by hand or worked out. */
  const roleOf = (hex: string): ColorRole | null =>
    COLOR_ROLES.find((role) => roles[role] === hex) ?? null;

  return (
    <div ref={holder}>
      <div className="grid grid-cols-4 gap-2">
        {site.colors.map((color) => {
          const role = roleOf(color);
          const byHand = COLOR_ROLES.some((item) => assigned[item] === color);
          return (
            <div key={color} className="group relative min-w-0">
              <button
                type="button"
                onClick={() => void copy(color)}
                aria-label={`Copy ${color}`}
                title={`Copy ${color}`}
                className="block h-14 w-full rounded-[4px] border border-hairline"
                style={{ background: color }}
              />
              <button
                type="button"
                onClick={() => remove(color)}
                aria-label={`Remove ${color}`}
                title="Remove"
                className="hover-actions absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-[3px] border border-hairline bg-surface text-ink"
              >
                <CloseIcon width={11} height={11} />
              </button>
              <button
                type="button"
                onClick={() => setMenuFor(menuFor === color ? null : color)}
                title="Set a role"
                aria-expanded={menuFor === color}
                className="mt-1 block w-full truncate text-left text-13 text-muted transition-colors duration-150 motion-ease hover:text-ink"
              >
                {color}
              </button>
              {role ? (
                <span
                  className={cn(
                    'block truncate text-13',
                    byHand ? 'text-ink' : 'text-muted opacity-70',
                  )}
                >
                  {ROLE_SHORT[role]}
                </span>
              ) : null}

              {menuFor === color ? (
                <div
                  role="menu"
                  className="ia-rise absolute left-0 top-full z-30 mt-1 flex w-36 flex-col rounded-[6px] border border-hairline bg-surface p-1"
                >
                  {COLOR_ROLES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      role="menuitemradio"
                      aria-checked={assigned[item] === color}
                      onClick={() => setRole(color, item)}
                      className="flex h-8 items-center rounded-[4px] px-2 text-left text-13 transition-colors duration-150 motion-ease hover:bg-canvas"
                    >
                      {ROLE_LABELS[item]}
                    </button>
                  ))}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => setRole(color, null)}
                    className="flex h-8 items-center rounded-[4px] px-2 text-left text-13 text-muted transition-colors duration-150 motion-ease hover:bg-canvas"
                  >
                    No role
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {site.colors.length < MAX_COLORS ? (
          <button
            type="button"
            onClick={() => void pick()}
            aria-label="Add a colour"
            title={hasEyeDropper() ? 'Pick a colour from anywhere on screen' : 'Add a colour'}
            className="flex h-14 w-full items-center justify-center rounded-[4px] border border-dashed border-hairline text-muted transition-colors duration-150 motion-ease hover:border-muted hover:text-ink"
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>

      {picking ? (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            type="color"
            aria-label="Pick a colour"
            value={normalizeHex(draft) ?? '#888888'}
            onChange={(event) => setDraft(event.target.value)}
            className="size-7 shrink-0 cursor-pointer rounded-[4px] border border-hairline bg-surface p-0.5"
          />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add(draft);
              }
            }}
            placeholder="#1A1C1E"
            aria-label="Hex code"
            className="h-7 min-w-0 flex-1 rounded-[4px] border border-hairline bg-surface px-2 text-13 outline-none"
          />
          <Button onClick={() => add(draft)} disabled={!normalizeHex(draft)} className="h-7 px-2">
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
