'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from './modal';
import { useToast } from './toast';
import { Button } from './ui';
import { copyText } from '@/lib/utils';

function codeFor(origin: string): string {
  return `javascript:(function(){window.open('${origin}/?add=1&url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank','noopener');})();`;
}

export function BookmarkletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Read once on mount; the panel itself only ever renders in the browser.
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin));
  const link = useRef<HTMLAnchorElement>(null);
  const toast = useToast();
  const code = origin ? codeFor(origin) : '';

  useEffect(() => {
    if (!open || !code) return;
    // React refuses to render a javascript: href, so it is set on the node.
    link.current?.setAttribute('href', code);
  }, [open, code]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save from anywhere"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="flex flex-col gap-4">
        <p className="text-15 text-muted">
          Drag this to your bookmarks bar. On any site, clicking it opens the add form here with
          that page&rsquo;s address and title already filled in.
        </p>

        <div className="flex justify-center rounded-[6px] border border-dashed border-hairline py-6">
          <a
            ref={link}
            draggable
            onClick={(event) => event.preventDefault()}
            className="inline-flex h-9 cursor-grab items-center rounded-[4px] bg-accent px-3 text-13 font-medium text-accent-ink"
          >
            Save to Archive
          </a>
        </div>

        <div>
          <p className="mb-1.5 text-13 text-muted">
            Or make a bookmark by hand and paste this as its address
          </p>
          <code className="block max-h-24 overflow-auto rounded-[4px] border border-hairline bg-canvas p-2 text-13 break-all">
            {code}
          </code>
          <Button
            className="mt-2"
            onClick={async () => toast((await copyText(code)) ? 'Copied' : 'Could not copy')}
          >
            Copy
          </Button>
        </div>

        <p className="text-13 text-muted">
          It points at {origin || 'this address'}, so it works wherever you are running the
          archive.
        </p>
      </div>
    </Modal>
  );
}
