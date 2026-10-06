// The two values the browser is allowed to know. They are referenced as whole
// literals, not looked up by name, because that is the only form Next.js
// inlines into the client bundle.
//
// The secret key is never read here. It lives only in lib/supabase/admin.ts,
// which is server-only.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Names only — a missing value must never be echoed back. */
export function requireSupabaseConfig(): { url: string; key: string } {
  if (!SUPABASE_URL) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local.');
  }
  if (!SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set. Add it to .env.local.');
  }
  return { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY };
}
