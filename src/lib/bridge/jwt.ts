import crypto from "crypto";

interface JwtPayload {
  [key: string]: unknown;
  iat?: number;
  exp?: number;
  jti?: string;
}

export function signJwt(
  payload: JwtPayload,
  secret: string,
  ttlSeconds: number
): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
    jti: crypto.randomUUID(),
  };

  const headerB64 = toBase64Url(JSON.stringify(header));
  const payloadB64 = toBase64Url(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");

  return `${signingInput}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");

  const sigBuffer = Buffer.from(signatureB64, "base64url");
  const expectedBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid JWT signature");
  }

  const header = JSON.parse(fromBase64Url(headerB64));
  if (header.alg !== "HS256") {
    throw new Error(`Unsupported algorithm: ${header.alg}`);
  }

  const payload: JwtPayload = JSON.parse(fromBase64Url(payloadB64));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new Error("JWT expired");
  }

  return payload;
}

function toBase64Url(str: string): string {
  return Buffer.from(str, "utf8").toString("base64url");
}

function fromBase64Url(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}
