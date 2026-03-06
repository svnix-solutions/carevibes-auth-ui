import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "@/lib/bridge/config";
import { verifyJwt } from "@/lib/bridge/jwt";

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let params: URLSearchParams;

  if (contentType.includes("application/json")) {
    const body = await request.json();
    params = new URLSearchParams(body);
  } else {
    const body = await request.text();
    params = new URLSearchParams(body);
  }

  const grantType = params.get("grant_type");
  const code = params.get("code");

  if (grantType !== "authorization_code") {
    return NextResponse.json(
      {
        error: "unsupported_grant_type",
        error_description:
          "Only authorization_code grant type is supported",
      },
      { status: 400 }
    );
  }

  if (!code) {
    return NextResponse.json(
      {
        error: "invalid_request",
        error_description: "Missing code parameter",
      },
      { status: 400 }
    );
  }

  try {
    const payload = verifyJwt(code, getBridgeConfig().secret);

    return NextResponse.json({
      access_token: payload.access_token,
      token_type: payload.token_type || "Bearer",
      expires_in: payload.expires_in,
      refresh_token: payload.refresh_token,
    });
  } catch (err) {
    console.error("[bridge/token] JWT verification failed:", err);
    return NextResponse.json(
      {
        error: "invalid_grant",
        error_description:
          "The authorization code is invalid or has expired",
      },
      { status: 400 }
    );
  }
}
