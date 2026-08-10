// Shared authorization for the 2FA management routes (setup/enable/disable/backup-codes).
//
// These routes are not in any dashboardGuard allow-list: the deny-by-default /api/*
// branch already demands a session JWT or the CLI token, and a 2FA ticket cannot
// satisfy it (different signing key). This module adds the step-up on top.
import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import { verifyDashboardPassword } from "@/lib/auth/dashboardSession";

const CLI_TOKEN_HEADER = "x-9r-cli-token";

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function jsonError(message, status, extra = {}) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: NO_STORE_HEADERS });
}

/**
 * With requireLogin off, isAuthenticated() short-circuits true and the guard never
 * runs a login — 2FA would be enrolled but never enforced, which is worse than not
 * having it because the user believes they are protected. There is also no session
 * to step up against.
 *
 * @returns {NextResponse|null} a response to return immediately, or null when allowed.
 */
export async function requireLoginEnabled() {
  const settings = await getSettings();
  if (settings.requireLogin === false) {
    return jsonError(
      'Enable "Require login" before configuring two-factor authentication.',
      409,
      { code: "require_login_disabled" },
    );
  }
  return null;
}

export function hasCliToken(request) {
  return !!request.headers.get(CLI_TOKEN_HEADER);
}

/**
 * Step-up check for the 2FA routes that need the password re-entered.
 *
 * Password re-auth (not just a valid session) because a stolen or fixated session
 * cookie must not be enough to swap the second factor. Reuses the existing
 * `verifyDashboardPassword` primitive that /api/settings/database already uses for
 * the same purpose, including its CLI-token exemption — the CLI token is derived
 * from the host machine id, so holding it already proves local access.
 *
 * @returns {NextResponse|null} a response to return immediately, or null when allowed.
 */
export async function requireManagementAccess(request, body = {}) {
  const blocked = await requireLoginEnabled();
  if (blocked) return blocked;

  if (hasCliToken(request)) return null;

  const ok = await verifyDashboardPassword(body?.password);
  if (!ok) return jsonError("Invalid password", 401);

  return null;
}
