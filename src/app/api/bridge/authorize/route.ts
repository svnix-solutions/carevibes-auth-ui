import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "@/lib/bridge/config";
import { generateCodeVerifier, computeCodeChallenge } from "@/lib/bridge/pkce";
import { signJwt } from "@/lib/bridge/jwt";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

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

  return NextResponse.redirect(supabaseAuthorizeUrl.toString());
}
