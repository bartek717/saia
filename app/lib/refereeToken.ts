import crypto from "crypto";

const DEFAULT_TTL_DAYS = 30;

type TokenPayload = {
  refereeFormId: string;
  exp: number;
};

function getSecret() {
  return process.env.REFEREE_LINK_SECRET || process.env.AIRTABLE_PAT || "dev-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createRefereeToken(refereeFormId: string, expiresAtISO?: string) {
  const exp = expiresAtISO
    ? Math.floor(new Date(expiresAtISO).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + DEFAULT_TTL_DAYS * 24 * 60 * 60;

  const payload: TokenPayload = { refereeFormId, exp };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

export function verifyRefereeToken(token: string, expectedRefereeFormId: string) {
  if (!token || !token.includes(".")) {
    return { ok: false as const, reason: "Missing or invalid token format." };
  }

  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return { ok: false as const, reason: "Malformed token." };
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSecret())
    .update(body)
    .digest("base64url");

  if (expectedSignature !== signature) {
    return { ok: false as const, reason: "Invalid token signature." };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as TokenPayload;
  } catch {
    return { ok: false as const, reason: "Invalid token payload." };
  }

  if (payload.refereeFormId !== expectedRefereeFormId) {
    return { ok: false as const, reason: "Token is not valid for this form." };
  }

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false as const, reason: "Token has expired." };
  }

  return {
    ok: true as const,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
  };
}
