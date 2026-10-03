'use client';

import { useState } from 'react';
import { CloseIcon } from './icons';
import { Confirm } from './modal';
import { useToast } from './toast';
import { Button, IconButton } from './ui';
import { DEMO_BANNER_DISMISSED, removeDemoData, useFlag } from '@/lib/store';

export function DemoBanner({ present }: { present: boolean }) {
  const [dismissed, setDismissed] = useFlag(DEMO_BANNER_DISMISSED);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  if (!present || dismissed) return null;

  const remove = async () => {
    setConfirming(false);
    await removeDemoData();
    toast('Demo data removed');
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-hairline bg-surface px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-13">Demo sites loaded</p>
        <Button onClick={() => setConfirming(true)}>Remove demo data</Button>
        <IconButton label="Dismiss" onClick={() => setDismissed(true)}>
          <CloseIcon />
        </IconButton>
      </div>
      <Confirm
        open={confirming}
        title="Remove demo data?"
        message="Every demo site and its shots are deleted. Anything you added yourself stays."
        confirmLabel="Remove"
        onConfirm={() => void remove()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
