import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/app" ? "/" : pathname.slice(4);
    return NextResponse.redirect(url);
  }

  // If env vars are not yet configured, skip auth and let pages handle it
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh session - do NOT remove this
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isOnboardingRoute =
    pathname === "/onboarding" || pathname.startsWith("/onboarding/");
  const isDashboardRoute =
    pathname === "/" ||
    pathname.startsWith("/bookmarks/") ||
    pathname === "/canvas" ||
    pathname.startsWith("/canvas/") ||
    pathname === "/captures" ||
    pathname.startsWith("/captures/") ||
    pathname.startsWith("/folders/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/");
  const isProtectedAppRoute =
    isDashboardRoute;

  if (!user && (isProtectedAppRoute || isOnboardingRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (isOnboardingRoute) {
      url.searchParams.set("next", "/onboarding");
    }
    return NextResponse.redirect(url);
  }

  if (!user) {
    return supabaseResponse;
  }

  const { data: onboarding } = await supabase
    .from("user_onboarding")
    .select("completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const onboardingComplete = Boolean(onboarding?.completed_at);
  const shouldForceOnboarding =
    !onboardingComplete && (isAuthRoute || isProtectedAppRoute);

  if (shouldForceOnboarding) {
    const url = request.nextUrl.clone();
    url.pathname = "/onboarding";
    return NextResponse.redirect(url);
  }

  if (onboardingComplete && (isAuthRoute || isOnboardingRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
