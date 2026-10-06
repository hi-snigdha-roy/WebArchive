'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabaseConfig } from './config';

let client: SupabaseClient | null = null;

/** The browser's Supabase client. Uses the publishable key and nothing else. */
export function supabaseBrowser(): SupabaseClient {
  if (!client) {
    const { url, key } = requireSupabaseConfig();
    client = createBrowserClient(url, key);
  }
  return client;
}
