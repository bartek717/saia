import crypto from "crypto";

export function createRefereeToken() {
  return crypto.randomBytes(12).toString("base64url");
}

export function verifyTokenFormat(token: string) {
  if (!token || token.length < 8) {
    return { ok: false as const, reason: "Missing or invalid token." };
  }
  return { ok: true as const };
}

export function checkTokenExpiry(expiresAtRaw: string | undefined) {
  if (!expiresAtRaw) {
    return { ok: true as const };
  }
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) {
    return { ok: true as const };
  }
  if (expiresAt.getTime() < Date.now()) {
    return { ok: false as const, reason: "Token has expired." };
  }
  return { ok: true as const };
}
