import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const { pathname } = request.nextUrl;

  // ── Auth routes are always public ────────────────────────────────────────────
  // /auth/callback, /auth/reset-password, /auth/forgot-password, etc. must never
  // be intercepted — the invite flow depends on reaching these pages freely.
  if (pathname.startsWith('/auth/')) {
    return response;
  }

  let session = null;

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data } = await supabase.auth.getSession();
    session = data.session;

    // ── Onboarding completion guard (authenticated users only) ───────────────
    if (session) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', session.user.id)
        .single();

      const onboardingCompleted = profile?.onboarding_completed === true;

      if (!onboardingCompleted && pathname.startsWith('/dashboard')) {
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }

      if (onboardingCompleted && pathname.startsWith('/onboarding')) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    }
  } catch {
    // If Supabase is unreachable, fail open so the app keeps responding.
    // Auth guards below will treat session as null (unauthenticated).
  }

  // ── Unauthenticated guards ──────────────────────────────────────────────────
  if (!session) {
    if (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/onboarding') ||
      pathname.startsWith('/admin')
    ) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - public folder static assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|eot)$).*)',
  ],
};
