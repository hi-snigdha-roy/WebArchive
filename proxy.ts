import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { requireSupabaseConfig } from '@/lib/supabase/config';

// Next.js 16 renamed the middleware convention to proxy. This runs before every
// render: it refreshes the Supabase session so the cookie never goes stale, and
// it keeps signed-out visitors away from everything but the login page and a
// shared collection.

/** The only paths a signed-out visitor may reach. */
function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/share/');
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = requireSupabaseConfig();

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // A response that sets auth cookies must never be cached, or one
        // person's session token could be handed to somebody else.
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call: it is what
  // refreshes the tokens and writes them back through setAll above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    // An API call should hear "no", not be handed a login page as HTML.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.search = '';
    return NextResponse.redirect(target);
  }

  if (user && pathname === '/login') {
    const target = request.nextUrl.clone();
    target.pathname = '/';
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  // Everything except Next's own assets and static files, so signing in is
  // never blocked by a missing stylesheet.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
