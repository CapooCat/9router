// The two hooks that make login 2FA-aware. Each returns a response to short-circuit
// with, or null to let the caller continue exactly as before — so the edits to
// login/route.js and oidc/callback/route.js stay additive and reviewable.
import { NextResponse } from "next/server";
import { getStatus } from "./state.js";
import {
  createTwoFactorTicket,
  clearTwoFactorTicketCookie,
  setTwoFactorTicketCookie,
} from "./ticket.js";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export const BROKEN_HINT =
  "Two-factor authentication is misconfigured. Open the 9Router CLI on the host → Settings → Reset Two-Factor to recover.";

// IdP display fields ride inside the ticket JWT, which lives in a cookie. A provider
// returning a pathological `name` could push the ticket past the ~4KB cookie limit,
// which manifests as "2FA never works with this IdP" rather than an obvious error.
const OIDC_FIELD_MAX = 190;

function clamp(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, OIDC_FIELD_MAX);
}

/**
 * Call after the password checks out and BEFORE `recordSuccess(ip)`.
 *
 * The limiter placement matters more than it looks: `recordSuccess` does
 * `attempts.delete(ip)`, which wipes fails, lockUntil AND lockLevel — the whole
 * progressive ladder. If it ran at the password step, anyone already holding the
 * password (leaked, reused, or the shipped default "123456") would get a free
 * limiter reset per iteration: password-ok → ladder cleared → one code guess →
 * repeat, forever, against a 3-in-10^6 per-attempt hit rate. So when 2FA is
 * required the password step must not touch the limiter at all; only
 * /api/auth/2fa-challenge records fail/success.
 *
 * `mustChangePassword` is computed by the caller (it needs `storedHash` and
 * `isLocalRequest`) but is carried INSIDE the signed ticket and only returned after
 * the code step — otherwise the client could act on it and skip the second factor.
 *
 * @returns {NextResponse|null} null ⇒ no 2FA, proceed with the normal session path.
 */
export async function twoFactorLoginGate({ request, cookieStore, mustChangePassword = false }) {
  const status = getStatus();

  if (status.broken) {
    return NextResponse.json({ error: BROKEN_HINT, code: "twofa_broken" }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (!status.required) return null;

  // Drop any stale ticket first, so an abandoned attempt can never be redeemed
  // using a newer password success.
  clearTwoFactorTicketCookie(cookieStore);
  const { token } = await createTwoFactorTicket({
    method: "password",
    claims: {},
    mustChangePassword,
  });
  setTwoFactorTicketCookie(cookieStore, request, token);

  return NextResponse.json(
    { success: false, twoFactorRequired: true },
    { headers: NO_STORE_HEADERS },
  );
}

/**
 * Call in the OIDC callback after the id_token is verified and BEFORE
 * `setDashboardAuthCookie`.
 *
 * @param {object} params.claims  The session claims the callback would have set.
 * @param {string} params.origin  Result of getPublicOrigin(request).
 * @returns {NextResponse|null} null ⇒ no 2FA, set the session as before.
 */
export async function twoFactorOidcGate({ request, cookieStore, claims, origin }) {
  const status = getStatus();

  if (status.broken) {
    return NextResponse.redirect(new URL("/login?error=twofa_broken", origin));
  }
  if (!status.required) return null;

  const { token } = await createTwoFactorTicket({
    method: "oidc",
    claims: {
      ...claims,
      oidcEmail: clamp(claims?.oidcEmail),
      oidcName: clamp(claims?.oidcName) || "",
    },
    // No dashboard password is in play on this leg.
    mustChangePassword: false,
  });
  setTwoFactorTicketCookie(cookieStore, request, token);

  // ?twofa=1 is a UI hint only — the login page re-confirms via /api/auth/2fa-pending.
  // A query param must never drive an auth decision.
  return NextResponse.redirect(new URL("/login?twofa=1", origin));
}
