import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "@/lib/bridge/config";
import { generateCodeVerifier, computeCodeChallenge } from "@/lib/bridge/pkce";
import { signJwt } from "@/lib/bridge/jwt";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Run the flow on the bridge's own host. Supabase always sends the browser
  // back to that host for the login/consent pages, so the downstream-client
  // cookie set below must live there too: started on another address (e.g.
  // the old *.netlify.app one), the login page wouldn't see this app's
  // cookie — and would read a leftover one from another app instead, e.g.
  // offering patient sign-up on the doctor app's login.
  // Redirects at most once (`canonical=1`), so a proxy reporting the host
  // differently can't put every sign-in into a loop.
  const base = new URL(getBridgeConfig().baseUrl);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host && host !== base.host && !searchParams.has("canonical")) {
    const target = new URL(request.nextUrl.pathname, base.origin);
    searchParams.forEach((value, key) => target.searchParams.set(key, value));
    target.searchParams.set("canonical", "1");
    return NextResponse.redirect(target.toString(), 307);
  }

  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const responseType = searchParams.get("response_type");

  if (!clientId || !redirectUri || !state) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description:
          "Missing required parameters: client_id, redirect_uri, state",
      },
      { status: 400 }
    );
  }

  if (responseType && responseType !== "code") {
    return NextResponse.json(
      {
        error: "unsupported_response_type",
        error_description: "Only response_type=code is supported",
      },
      { status: 400 }
    );
  }

  if (!getBridgeConfig().allowedRedirectUris.includes(redirectUri)) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "redirect_uri is not in the allowed list",
      },
      { status: 400 }
    );
  }

  const codeVerifier = generateCodeVerifier(64);
  const codeChallenge = computeCodeChallenge(codeVerifier);

  const bridgeCallbackUrl = `${getBridgeConfig().baseUrl}/api/bridge/callback`;

  // Encode bridge state into the OAuth state parameter as a signed JWT
  // This avoids cookie dependency which breaks on serverless redirect chains
  const bridgeStateJwt = signJwt(
    {
      code_verifier: codeVerifier,
      erpnext_redirect_uri: redirectUri,
      erpnext_state: state,
      erpnext_client_id: clientId,
    },
    getBridgeConfig().secret,
    getBridgeConfig().stateCookieMaxAge
  );

  const supabaseAuthorizeUrl = new URL(
    `${getBridgeConfig().supabaseUrl}/auth/v1/oauth/authorize`
  );
  supabaseAuthorizeUrl.searchParams.set(
    "client_id",
    getBridgeConfig().supabaseClientId
  );
  supabaseAuthorizeUrl.searchParams.set("redirect_uri", bridgeCallbackUrl);
  supabaseAuthorizeUrl.searchParams.set("response_type", "code");
  // Do NOT send scope — Supabase OAuth 2.1 Phase 1 has no scope management;
  // including scopes (openid, email, profile) causes "validation_failed".
  supabaseAuthorizeUrl.searchParams.set("code_challenge", codeChallenge);
  supabaseAuthorizeUrl.searchParams.set("code_challenge_method", "S256");
  supabaseAuthorizeUrl.searchParams.set("state", bridgeStateJwt);

  const response = NextResponse.redirect(supabaseAuthorizeUrl.toString());

  // Stash the downstream client_id so /oauth/consent can render the right
  // app name/logo. Path "/" so it travels with the post-login redirect.
  response.cookies.set(
    getBridgeConfig().downstreamClientCookieName,
    clientId,
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: getBridgeConfig().stateCookieMaxAge,
    }
  );

  // The downstream app's /login restarts the whole flow — used by "Use a
  // different account" on the consent screen. redirectUri is already
  // validated against the allow-list above.
  response.cookies.set(
    getBridgeConfig().downstreamLoginCookieName,
    `${new URL(redirectUri).origin}/login`,
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: getBridgeConfig().stateCookieMaxAge,
    }
  );

  return response;
}
