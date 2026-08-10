// Short-lived "first factor passed, second factor pending" ticket.
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { shouldUseSecureCookie } from "@/lib/auth/dashboardSession";
import { getTicketSecret } from "./secret.js";

export const TICKET_COOKIE = "twofa_ticket";
// Scoped to /api/auth: the only readers are 2fa-challenge, 2fa-pending and logout.
// The ticket is therefore never attached to /v1/* LLM traffic or /dashboard.
const TICKET_COOKIE_PATH = "/api/auth";
const TICKET_TTL_SECONDS = 300;
const TICKET_TYP = "2fa";
const TICKET_AUD = "9r-2fa";

// Attempts are capped per ticket, not only per IP, because getClientIp() collapses
// to the literal "unknown" bucket when there is no x-9r-real-ip and TRUST_PROXY is
// off — every client shares one bucket then, so an attacker could lock the real user
// out, and a TRUST_PROXY misconfiguration would let X-Forwarded-For rotation escape
// the bucket entirely. A jti counter is immune to both.
const MAX_ATTEMPTS_PER_TICKET = 5;

// jti → { attempts, expiresAt }. In-memory and swept on write, matching
// loginLimiter.js's "resets on process restart" contract: a restart mid-login is a
// harmless retry, and the map is bounded by the 5-minute TTL.
const liveTickets = new Map();

function sweep(now = Date.now()) {
  for (const [jti, entry] of liveTickets) {
    if (entry.expiresAt <= now) liveTickets.delete(jti);
  }
}

/**
 * @param {object} params
 * @param {"password"|"oidc"} params.method
 * @param {object} params.claims        Session claims to apply once the code checks out.
 *                                     On the OIDC leg this ticket is the ONLY carrier of
 *                                     the verified identity between callback and session.
 * @param {boolean} params.mustChangePassword
 */
export async function createTwoFactorTicket({ method, claims = {}, mustChangePassword = false }) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({
    typ: TICKET_TYP,
    method,
    claims,
    mustChangePassword: mustChangePassword === true,
    jti,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .setAudience(TICKET_AUD)
    .sign(getTicketSecret());

  sweep();
  liveTickets.set(jti, { attempts: 0, expiresAt: Date.now() + TICKET_TTL_SECONDS * 1000 });
  return { token, jti };
}

/** Signature + claim shape only. Liveness is a separate check — see isTicketLive. */
export async function verifyTwoFactorTicket(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getTicketSecret(), { audience: TICKET_AUD });
    if (payload.typ !== TICKET_TYP) return null;
    // A session token can never reach here (different key), but refuse anything
    // session-shaped anyway so the two families stay unambiguous.
    if (payload.authenticated === true) return null;
    if (typeof payload.jti !== "string" || !payload.jti) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * A jti absent from the map is dead: already redeemed, burned by too many failures,
 * expired, or minted before a restart. All four mean "sign in again".
 */
export function isTicketLive(jti) {
  sweep();
  return liveTickets.has(jti);
}

/** @returns {{burned: boolean, remaining: number}} — burned tickets are unusable. */
export function recordTicketAttempt(jti) {
  sweep();
  const entry = liveTickets.get(jti);
  if (!entry) return { burned: true, remaining: 0 };

  entry.attempts += 1;
  if (entry.attempts >= MAX_ATTEMPTS_PER_TICKET) {
    liveTickets.delete(jti);
    return { burned: true, remaining: 0 };
  }
  return { burned: false, remaining: MAX_ATTEMPTS_PER_TICKET - entry.attempts };
}

/** Single-use: redeeming a ticket kills it even though its JWT exp is still in the future. */
export function consumeTicket(jti) {
  liveTickets.delete(jti);
}

export function setTwoFactorTicketCookie(cookieStore, request, token) {
  cookieStore.set(TICKET_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    // "lax", not "strict": the OIDC leg redirects back cross-site, and a strict
    // cookie is withheld on that navigation. The only reader is a POST, which lax
    // already withholds cross-site, so CSRF is impossible — and a forged request
    // would still need a valid TOTP code.
    sameSite: "lax",
    path: TICKET_COOKIE_PATH,
    maxAge: TICKET_TTL_SECONDS,
  });
}

// Deleting a path-scoped cookie REQUIRES the matching path — cookieStore.delete(name)
// defaults to path "/" and silently no-ops here.
export function clearTwoFactorTicketCookie(cookieStore) {
  try {
    cookieStore.delete({ name: TICKET_COOKIE, path: TICKET_COOKIE_PATH });
  } catch {
    // Some cookie stores are read-only (e.g. during a render pass); ignore.
  }
}

/** Verified AND live ticket payload from the request cookies, or null. */
export async function readTwoFactorTicket(cookieStore) {
  const payload = await verifyTwoFactorTicket(cookieStore.get(TICKET_COOKIE)?.value);
  if (!payload) return null;
  if (!isTicketLive(payload.jti)) return null;
  return payload;
}

export const __test__ = { liveTickets, MAX_ATTEMPTS_PER_TICKET, TICKET_TTL_SECONDS };
