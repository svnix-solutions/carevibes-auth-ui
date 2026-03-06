import { NextRequest, NextResponse } from "next/server";
import { getBridgeConfig } from "./config";

export interface BridgeState {
  code_verifier: string;
  erpnext_redirect_uri: string;
  erpnext_state: string;
  erpnext_client_id: string;
}

export function setBridgeStateCookie(
  response: NextResponse,
  state: BridgeState
): void {
  response.cookies.set(getBridgeConfig().stateCookieName, JSON.stringify(state), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/bridge",
    maxAge: getBridgeConfig().stateCookieMaxAge,
  });
}

export function getBridgeStateCookie(
  request: NextRequest
): BridgeState | null {
  const raw = request.cookies.get(getBridgeConfig().stateCookieName)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (
      !parsed.code_verifier ||
      !parsed.erpnext_redirect_uri ||
      !parsed.erpnext_state ||
      !parsed.erpnext_client_id
    ) {
      return null;
    }
    return parsed as BridgeState;
  } catch {
    return null;
  }
}

export function clearBridgeStateCookie(response: NextResponse): void {
  response.cookies.set(getBridgeConfig().stateCookieName, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/bridge",
    maxAge: 0,
  });
}
