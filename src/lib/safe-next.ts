/**
 * Where to send the user after a sign-in step. Only paths on this site:
 * an absolute URL (or "//host") in ?next= would otherwise turn the bridge
 * into an open redirect to any website.
 */
export function safeNext(next: string | null | undefined, fallback = "/oauth/consent"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
