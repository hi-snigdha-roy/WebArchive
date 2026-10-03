'use client';

import { previewStyle, useFont } from '@/lib/fonts';
import { cn } from '@/lib/utils';

interface FontNameProps {
  name: string;
  onClick?: () => void;
  className?: string;
  title?: string;
}

/**
 * A typeface name set in that typeface, once the face has been found. Until
 * then, and for anything nobody publishes, it stays in the interface font.
 */
export function FontName({ name, onClick, className, title }: FontNameProps) {
  const { family } = useFont(name);
  const style = previewStyle(family);

  if (!onClick) {
    return (
      <span style={style} className={className}>
        {name}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      title={title}
      className={cn('text-left hover:underline', className)}
    >
      {name}
    </button>
  );
}
