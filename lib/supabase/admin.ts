import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The secret key bypasses row level security, so this file exists for exactly
// one job: looking up a share token and reading the single collection it points
// at. The `server-only` import above makes the build fail if any client
// component ever imports this, so the key can never reach a browser bundle.
//
// Nothing else in the app may import this module.

export function supabaseAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set.');
  if (!secret) throw new Error('SUPABASE_SECRET_KEY is not set.');

  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
