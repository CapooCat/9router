// Finish enrollment: confirm a code against the pending secret, then promote it.
//
// No password re-auth here — `setup` already required it to mint the pending secret,
// and possession of a code proves the authenticator was actually provisioned.
// The backup codes in the response are the only time they exist in plaintext.
import { NextResponse } from "next/server";
import { confirmSetup } from "@/lib/auth/twoFactor/state";
import { jsonError, NO_STORE_HEADERS, requireLoginEnabled } from "@/lib/auth/twoFactor/reauth";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const denied = await requireLoginEnabled();
    if (denied) return denied;

    const result = confirmSetup(body?.code);

    if (!result.ok) {
      if (result.reason === "no_pending") {
        return jsonError("Start two-factor setup again.", 409, { code: "no_pending" });
      }
      if (result.reason === "pending_expired") {
        return jsonError("Setup expired. Scan a fresh QR code.", 410, { code: "pending_expired" });
      }
      return jsonError(
        "Invalid code. Check that your phone's clock is set to update automatically.",
        401,
      );
    }

    return NextResponse.json({ success: true, backupCodes: result.backupCodes }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
