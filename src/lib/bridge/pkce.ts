import crypto from "crypto";

export function generateCodeVerifier(length: number = 64): string {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return bytes.toString("base64url").slice(0, length);
}

export function computeCodeChallenge(codeVerifier: string): string {
  return crypto
    .createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
}
