'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, TextInput } from '@/components/ui';
import { supabaseBrowser } from '@/lib/supabase/client';

// Sign in only. There is deliberately no way to create an account here, and
// new signups are turned off on the project itself.

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
      if (error) {
        // Never say which half was wrong: that would confirm whether an
        // address has an account here.
        setProblem(
          error.status
            ? 'Email or password is incorrect.'
            : 'Could not reach the server. Try again.',
        );
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setProblem('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-xs rounded-[8px] border border-hairline bg-surface p-6"
      >
        <h1 className="text-24 font-medium">Inspiration Archive</h1>
        <p className="mt-1 text-13 text-muted">Sign in to open your archive.</p>

        <div className="mt-6 flex flex-col gap-3">
          <Field label="Email">
            <TextInput
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
        </div>

        {problem ? (
          <p role="alert" className="mt-3 text-13">
            {problem}
          </p>
        ) : null}

        <Button type="submit" variant="primary" className="mt-5 w-full" disabled={busy}>
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
