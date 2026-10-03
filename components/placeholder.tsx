import { sectionLabel, type Section } from '@/lib/types';
import { cn, readableInk } from '@/lib/utils';

interface PlaceholderProps {
  siteName: string;
  section: Section | null;
  /** The site's first colour, used as the background when it has one. */
  color?: string;
  size?: 'tile' | 'large';
  className?: string;
}

export function Placeholder({ siteName, section, color, size = 'tile', className }: PlaceholderProps) {
  const ink = color ? readableInk(color) : undefined;
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col justify-end gap-1 overflow-hidden rounded-img border border-dashed p-3',
        !color && 'border-hairline bg-surface',
        className,
      )}
      style={color ? { background: color, color: ink, borderColor: `${ink}40` } : undefined}
    >
      <span
        className={cn(
          'line-clamp-3 font-medium break-words',
          size === 'large' ? 'text-32' : 'text-18',
        )}
      >
        {siteName}
      </span>
      <span className={cn('text-13', color ? 'opacity-70' : 'text-muted')}>
        {sectionLabel(section)}
      </span>
    </div>
  );
}
