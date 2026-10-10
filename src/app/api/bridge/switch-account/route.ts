import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getBridgeConfig } from "@/lib/bridge/config";
import { verifyJwt } from "@/lib/bridge/jwt";
import { publicOrigin } from "@/lib/public-origin";

/**
 * "Use a different account" from the consent screen.
 *
 *   GET /api/bridge/switch-account?state=<bridge state JWT>
 *     The sign-in was already approved (bound to the current user), so it
 *     can't be reused: sign out and restart from the requesting app's /login.
 *     The app is taken from the signed state JWT Supabase handed back (and
 *     re-checked against BRIDGE_ALLOWED_REDIRECT_URIS) — no cookie needed.
 *
 *   GET /api/bridge/switch-account?authorization_id=<id>
 *     Not approved yet: sign out and return to this same consent request
 *     after the new user signs in.
 *
 * Either way the Supabase session is cleared server-side first.
 */
export async function GET(request: NextRequest) {
  const config = getBridgeConfig();
  const state = request.nextUrl.searchParams.get("state");
  const authorizationId = request.nextUrl.searchParams.get("authorization_id");

  let target: string | null = null;

  if (state) {
    try {
      const payload = verifyJwt(state, config.secret);
      const redirectUri = payload.erpnext_redirect_uri as string;
      if (config.allowedRedirectUris.includes(redirectUri)) {
        target = `${new URL(redirectUri).origin}/login`;
      }
    } catch {
      // Expired/invalid state — fall through to the other options.
    }
  }

  if (!target && authorizationId) {
    const consent = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
    target = new URL(`/login?next=${encodeURIComponent(consent)}`, publicOrigin(request)).toString();
  }

  if (!target) {
    // Last resort: the app remembered at /authorize (if the cookie survived).
    target = request.cookies.get(config.downstreamLoginCookieName)?.value ?? null;
  }

  const response = target
    ? NextResponse.redirect(target)
    : new NextResponse(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signed out</title>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#111">
<div style="text-align:center;max-width:22rem;padding:1.5rem">
<h1 style="font-size:1.25rem">You're signed out</h1>
<p style="color:#555;font-size:.9rem">Go back to the app you were using and sign in again with the account you want.</p>
</div></body>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );
  await supabase.auth.signOut();

  return response;
}
