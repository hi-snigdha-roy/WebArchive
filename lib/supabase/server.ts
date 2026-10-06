import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseConfig } from './config';

/**
 * A Supabase client for server components, route handlers and server actions.
 * A fresh one per request: sharing a client between requests would leak one
 * visitor's session into another's response.
 *
 * This still uses the publishable key, so every query is subject to row level
 * security and sees only the signed-in owner's rows.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  const { url, key } = requireSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so there is nothing to recover here.
        }
      },
    },
  });
}
