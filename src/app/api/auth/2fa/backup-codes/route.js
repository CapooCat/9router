// Issue a fresh set of recovery codes, invalidating every previous one (used or not).
//
// Accepts a TOTP code ONLY — never a backup code. Otherwise a single leaked recovery
// code could be laundered into ten fresh ones, turning one-time access into permanent
// access.
import { NextResponse } from "next/server";
import { getStatus, regenerateBackupCodes, consumeTotpCode } from "@/lib/auth/twoFactor/state";
import { hasCliToken, jsonError, NO_STORE_HEADERS, requireManagementAccess } from "@/lib/auth/twoFactor/reauth";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const denied = await requireManagementAccess(request, body);
    if (denied) return denied;

    if (!getStatus().required) {
      return jsonError("Two-factor authentication is not enabled.", 409, { code: "not_configured" });
    }

    if (!hasCliToken(request)) {
      const verified = consumeTotpCode(body?.code);
      if (!verified.ok) return jsonError("Invalid code", 401);
    }

    const result = regenerateBackupCodes();
    if (!result.ok) return jsonError("Two-factor authentication is not enabled.", 409, { code: "not_configured" });

    return NextResponse.json({ success: true, backupCodes: result.backupCodes }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
