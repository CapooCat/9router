// Second step of login: trade a 2FA ticket + a valid code for a real session.
//
// PUBLIC (see lib/auth/twoFactor/paths.js) — the caller has no session yet by
// definition. The ticket cookie is the whole credential, and it only exists because
// the password (or the OIDC round-trip) already checked out.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { checkLock, getClientIp, recordFail, recordSuccess } from "@/lib/auth/loginLimiter";
import { getStatus, verifySecondFactor } from "@/lib/auth/twoFactor/state";
import { BROKEN_HINT } from "@/lib/auth/twoFactor/gate";
import {
  clearTwoFactorTicketCookie,
  consumeTicket,
  readTwoFactorTicket,
  recordTicketAttempt,
} from "@/lib/auth/twoFactor/ticket";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const RESET_HINT =
  "Lost your authenticator? Open the 9Router CLI on the host → Settings → Reset Two-Factor.";

// `ticketExpired` sends the client back to the password step. Carry the reason (and any
// active lockout) in the body so the login page can render it immediately instead of
// silently dropping the user on a blank form.
function expired(cookieStore, extra = {}) {
  clearTwoFactorTicketCookie(cookieStore);
  const {
    error = "Your sign-in attempt expired. Please sign in again.",
    retryAfter,
    resetHint,
  } = extra;
  const headers = { ...NO_STORE_HEADERS };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  return NextResponse.json(
    { error, ticketExpired: true, retryAfter, resetHint },
    { status: 401, headers },
  );
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const lock = checkLock(ip);
    if (lock.locked) {
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${lock.retryAfter}s.`, retryAfter: lock.retryAfter, resetHint: RESET_HINT },
        { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(lock.retryAfter) } },
      );
    }

    const cookieStore = await cookies();
    const ticket = await readTwoFactorTicket(cookieStore);
    if (!ticket) return expired(cookieStore);

    const status = getStatus();
    if (status.broken) {
      return NextResponse.json({ error: BROKEN_HINT, code: "twofa_broken" }, { status: 503, headers: NO_STORE_HEADERS });
    }
    // 2FA was turned off (CLI reset) while this challenge was open. Refuse rather
    // than exchanging the ticket for a session with no code — that would make the
    // ticket a bare session token under one settings flip.
    if (!status.required) {
      clearTwoFactorTicketCookie(cookieStore);
      consumeTicket(ticket.jti);
      return NextResponse.json(
        { error: "Two-factor authentication is no longer enabled. Please sign in again.", code: "twofa_not_required" },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const body = await request.json().catch(() => ({}));
    const result = verifySecondFactor(body);

    if (!result.ok) {
      recordFail(ip);
      const { burned } = recordTicketAttempt(ticket.jti);
      const postLock = checkLock(ip);

      if (burned) {
        return expired(cookieStore, {
          error: "Too many incorrect codes. Please sign in again.",
          // Carry the lockout through the bounce so the password form arrives already
          // counting down, instead of accepting a submit that is bound to 429.
          ...(postLock.locked ? { retryAfter: postLock.retryAfter, resetHint: RESET_HINT } : {}),
        });
      }

      if (postLock.locked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Try again in ${postLock.retryAfter}s.`, retryAfter: postLock.retryAfter, resetHint: RESET_HINT },
          { status: 429, headers: { ...NO_STORE_HEADERS, "Retry-After": String(postLock.retryAfter) } },
        );
      }
      // One generic message for every reason (unknown code, replay, used backup code,
      // 2FA not configured) so this endpoint is not an oracle for code freshness.
      return NextResponse.json({ error: "Invalid code" }, { status: 401, headers: NO_STORE_HEADERS });
    }

    // Single-use: kill the jti before issuing the session so a double-submit cannot
    // mint two sessions from one ticket.
    consumeTicket(ticket.jti);
    clearTwoFactorTicketCookie(cookieStore);
    recordSuccess(ip);
    await setDashboardAuthCookie(cookieStore, request, ticket.claims || {});

    return NextResponse.json(
      {
        success: true,
        mustChangePassword: ticket.mustChangePassword === true,
        backupCodeUsed: result.usedBackupCode === true,
        backupCodesRemaining: typeof result.remaining === "number" ? result.remaining : undefined,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
