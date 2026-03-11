import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getBridgeConfig } from "@/lib/bridge/config";

/**
 * Universal logout endpoint for any app using the bridge.
 *
 * Usage:
 *   GET /api/bridge/logout?post_logout_redirect_uri=https://app.example.com/login
 *
 * 1. Clears the Supabase session (revokes server-side + deletes cookies)
 * 2. Redirects to post_logout_redirect_uri
 *
 * The redirect URI origin must match one of the BRIDGE_ALLOWED_REDIRECT_URIS origins.
 */
export async function GET(request: NextRequest) {
  const postLogoutUri = request.nextUrl.searchParams.get(
    "post_logout_redirect_uri"
  );

  // Validate the redirect URI
  if (!postLogoutUri) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameter: post_logout_redirect_uri",
      },
      { status: 400 }
    );
  }

  let targetOrigin: string;
  try {
    targetOrigin = new URL(postLogoutUri).origin;
  } catch {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "post_logout_redirect_uri is not a valid URL",
      },
      { status: 400 }
    );
  }

  const allowedOrigins = new Set(
    getBridgeConfig().allowedRedirectUris.map((uri) => {
      try {
        return new URL(uri).origin;
      } catch {
        return "";
      }
    })
  );

  if (!allowedOrigins.has(targetOrigin)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description:
          "post_logout_redirect_uri origin is not in the allowed list",
      },
      { status: 400 }
    );
  }

  // Build the redirect response — we'll set cookie deletions on it
  const redirectResponse = NextResponse.redirect(postLogoutUri);

  // Create a Supabase client that reads cookies from the request
  // and writes cookie deletions to the redirect response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Sign out — revokes session server-side and clears cookies
  await supabase.auth.signOut();

  return redirectResponse;
}
