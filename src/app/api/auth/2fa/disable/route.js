// Turn 2FA off. Requires the current password AND a current second factor, so
// neither a stolen session nor a known password alone is enough.
//
// A backup code is accepted here on purpose: someone who lost their phone must be
// able to turn 2FA off from the dashboard rather than only via the CLI.
import { NextResponse } from "next/server";
import { disable, getStatus, verifySecondFactor } from "@/lib/auth/twoFactor/state";
import { hasCliToken, jsonError, NO_STORE_HEADERS, requireManagementAccess } from "@/lib/auth/twoFactor/reauth";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const denied = await requireManagementAccess(request, body);
    if (denied) return denied;

    const status = getStatus();
    if (!status.enabled) {
      return NextResponse.json({ success: true, alreadyDisabled: true }, { headers: NO_STORE_HEADERS });
    }

    // `broken` state has no usable secret, so no code can ever be produced for it —
    // let the password alone tear it down instead of forcing a CLI trip.
    if (status.required && !hasCliToken(request)) {
      const verified = verifySecondFactor(body);
      if (!verified.ok) return jsonError("Invalid code", 401);
    }

    disable();
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
