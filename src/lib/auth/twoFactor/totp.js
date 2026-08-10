// TOTP primitives, thin wrapper over `otpauth`.
// Pure: no persistence, no request context, an injectable timestamp for tests.
import { TOTP, Secret } from "otpauth";

export const TOTP_ISSUER = "9Router";
export const TOTP_LABEL = "dashboard";

// SHA1 / 6 digits / 30s is what Google Authenticator and Microsoft Authenticator
// assume when a QR omits the parameters. Do not "upgrade" these — several apps
// silently ignore algorithm=SHA256 and then generate codes that never validate.
export const TOTP_ALGORITHM = "SHA1";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD = 30;

// ±1 step (90s total acceptance). RFC 6238 §5.2 recommends at most one step, and
// guess probability scales linearly with the window: 3 live codes per 10^6 at
// window 1 vs 5 at window 2. Both authenticator apps read an NTP-synced device
// clock, so one step is ample. Intentionally not user-configurable — a settings
// knob here would be an attacker-writable security parameter.
export const TOTP_WINDOW = 1;

/** 160-bit secret — the length RFC 4226 §4 R6 recommends for HMAC-SHA1. */
export function generateSecret() {
  return new Secret({ size: 20 }).base32;
}

function buildTotp(secretBase32) {
  return new TOTP({
    issuer: TOTP_ISSUER,
    label: TOTP_LABEL,
    secret: Secret.fromBase32(secretBase32),
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD,
  });
}

/** `otpauth://totp/…` URI for the enrollment QR / manual entry. */
export function buildOtpauthUri(secretBase32) {
  return buildTotp(secretBase32).toString();
}

/** Absolute 30s step index for a timestamp — the value persisted as `lastUsedStep`. */
export function currentStep(timestamp = Date.now()) {
  return Math.floor(timestamp / 1000 / TOTP_PERIOD);
}

/**
 * @returns {number|null} the absolute step index the code belongs to, or null.
 *
 * Returning the step (rather than a boolean) is what makes replay protection
 * possible: the caller persists it and refuses anything not strictly greater.
 */
export function matchTotpStep(secretBase32, code, timestamp = Date.now()) {
  if (!secretBase32) return null;
  const token = String(code || "").replace(/\D/g, "");
  if (token.length !== TOTP_DIGITS) return null;

  let delta;
  try {
    delta = buildTotp(secretBase32).validate({ token, timestamp, window: TOTP_WINDOW });
  } catch {
    // Malformed base32 in a hand-edited state file — treat as no match.
    return null;
  }
  if (delta === null || delta === undefined) return null;
  return currentStep(timestamp) + delta;
}

/** Group a base32 secret into 4-char blocks for manual entry. Display only. */
export function formatSecretForDisplay(secretBase32) {
  return String(secretBase32 || "").replace(/(.{4})/g, "$1 ").trim();
}
