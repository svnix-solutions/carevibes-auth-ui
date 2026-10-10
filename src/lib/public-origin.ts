import type { NextRequest } from "next/server";

/**
 * The origin the browser actually used (e.g. https://auth.iklera.com).
 *
 * Not request.nextUrl.origin: on Netlify that is the deploy's internal
 * address (<deploy-id>--iklera-auth.netlify.app). Redirecting there after
 * setting the session cookie on the real domain lands the user on a host
 * without their session — a reset link then reads as "expired", and a
 * first-time Google sign-in fails at the consent step.
 */
export function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return request.nextUrl.origin;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
