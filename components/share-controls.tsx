'use client';

import { useEffect, useState } from 'react';
import { Confirm } from './modal';
import { useToast } from './toast';
import { Button } from './ui';
import { createShare, getShare, revokeShare } from '@/lib/store';
import { copyText } from '@/lib/utils';

/** Making a collection readable by anyone holding the link, and taking it back. */
export function ShareControls({ collectionId }: { collectionId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [known, setKnown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let active = true;
    void getShare(collectionId)
      .catch(() => null)
      .then((found) => {
        if (!active) return;
        setToken(found);
        setKnown(true);
      });
    return () => {
      active = false;
    };
  }, [collectionId]);

  const link = token ? `${window.location.origin}/share/${token}` : null;

  const start = async () => {
    setBusy(true);
    try {
      const next = await createShare(collectionId);
      setToken(next);
      const url = `${window.location.origin}/share/${next}`;
      toast((await copyText(url)) ? 'Share link copied' : 'Share link created');
    } catch (problem) {
      toast(problem instanceof Error ? problem.message : 'Could not create a share link');
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setConfirming(false);
    setBusy(true);
    try {
      await revokeShare(collectionId);
      setToken(null);
      toast('Sharing stopped');
    } catch (problem) {
      toast(problem instanceof Error ? problem.message : 'Could not stop sharing');
    } finally {
      setBusy(false);
    }
  };

  if (!known) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {link ? (
        <>
          <input
            readOnly
            value={link}
            aria-label="Share link"
            onFocus={(event) => event.target.select()}
            className="h-9 min-w-0 flex-1 rounded-[4px] border border-hairline bg-surface px-2.5 text-13 outline-none sm:w-80 sm:flex-none"
          />
          <Button
            onClick={async () => toast((await copyText(link)) ? 'Share link copied' : 'Could not copy')}
          >
            Copy
          </Button>
          <Button onClick={() => setConfirming(true)} disabled={busy}>
            Stop sharing
          </Button>
        </>
      ) : (
        <Button onClick={() => void start()} disabled={busy}>
          {busy ? 'Creating' : 'Create share link'}
        </Button>
      )}

      <Confirm
        open={confirming}
        title="Stop sharing this collection?"
        message="The link stops working straight away. Anyone you sent it to will see that it is no longer available."
        confirmLabel="Stop sharing"
        onConfirm={() => void stop()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
