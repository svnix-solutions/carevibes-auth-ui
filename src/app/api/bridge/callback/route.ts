import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "@/lib/bridge/config";
import { signJwt, verifyJwt } from "@/lib/bridge/jwt";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Decode bridge state from the OAuth state parameter (signed JWT)
  if (!stateParam) {
    return NextResponse.json(
      {
        error: "invalid_state",
        error_description: "Missing state parameter.",
      },
      { status: 400 }
    );
  }

  let bridgeState: {
    code_verifier: string;
    erpnext_redirect_uri: string;
    erpnext_state: string;
    erpnext_client_id: string;
  };

  try {
    const payload = verifyJwt(stateParam, getBridgeConfig().secret);
    bridgeState = {
      code_verifier: payload.code_verifier as string,
      erpnext_redirect_uri: payload.erpnext_redirect_uri as string,
      erpnext_state: payload.erpnext_state as string,
      erpnext_client_id: payload.erpnext_client_id as string,
    };
  } catch (err) {
    console.error("[bridge/callback] State JWT verification failed:", err);
    return NextResponse.json(
      {
        error: "invalid_state",
        error_description:
          "Bridge state is invalid or expired. Please restart the authorization flow.",
      },
      { status: 400 }
    );
  }

  // Forward errors from Supabase back to ERPNext
  if (error) {
    const erpnextRedirect = new URL(bridgeState.erpnext_redirect_uri);
    erpnextRedirect.searchParams.set("error", error);
    if (errorDescription) {
      erpnextRedirect.searchParams.set("error_description", errorDescription);
    }
    erpnextRedirect.searchParams.set("state", bridgeState.erpnext_state);

    return NextResponse.redirect(erpnextRedirect.toString());
  }

  if (!code) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing authorization code from Supabase",
      },
      { status: 400 }
    );
  }

  // Exchange the Supabase code + code_verifier for tokens
  const bridgeCallbackUrl = `${getBridgeConfig().baseUrl}/api/bridge/callback`;

  const tokenResponse = await fetch(
    `${getBridgeConfig().supabaseUrl}/auth/v1/oauth/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: bridgeState.code_verifier,
        redirect_uri: bridgeCallbackUrl,
        client_id: getBridgeConfig().supabaseClientId,
        client_secret: getBridgeConfig().supabaseClientSecret,
      }),
    }
  );

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    console.error(
      "[bridge/callback] Supabase token exchange failed:",
      tokenResponse.status,
      errorBody
    );

    // Include actual upstream error for debugging
    let upstreamDetail = "";
    try {
      const parsed = JSON.parse(errorBody);
      upstreamDetail = `: ${parsed.error ?? parsed.code ?? ""} ${parsed.error_description ?? parsed.message ?? ""}`.trim();
    } catch {
      upstreamDetail = errorBody ? `: ${errorBody.slice(0, 200)}` : "";
    }

    const erpnextRedirect = new URL(bridgeState.erpnext_redirect_uri);
    erpnextRedirect.searchParams.set("error", "server_error");
    erpnextRedirect.searchParams.set(
      "error_description",
      `Token exchange failed (HTTP ${tokenResponse.status})${upstreamDetail}`
    );
    erpnextRedirect.searchParams.set("state", bridgeState.erpnext_state);

    return NextResponse.redirect(erpnextRedirect.toString());
  }

  const tokens = await tokenResponse.json();

  // Mint a bridge_code JWT containing the tokens
  const bridgeCode = signJwt(
    {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || "Bearer",
      expires_in: tokens.expires_in,
    },
    getBridgeConfig().secret,
    getBridgeConfig().bridgeCodeTtl
  );

  // Redirect back to ERPNext with the bridge_code
  const erpnextRedirect = new URL(bridgeState.erpnext_redirect_uri);
  erpnextRedirect.searchParams.set("code", bridgeCode);
  erpnextRedirect.searchParams.set("state", bridgeState.erpnext_state);

  return NextResponse.redirect(erpnextRedirect.toString());
}
