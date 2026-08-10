// Start enrollment: mint a PENDING secret and hand back the otpauth:// URI.
//
// Never touches the active secret, so abandoning setup while already enrolled leaves
// the existing authenticator and backup codes working. Re-calling this replaces the
// pending secret, invalidating any QR still on screen.
import { NextResponse } from "next/server";
import { formatSecretForDisplay, TOTP_ALGORITHM, TOTP_DIGITS, TOTP_PERIOD } from "@/lib/auth/twoFactor/totp";
import { getStatus, startSetup, verifySecondFactor } from "@/lib/auth/twoFactor/state";
import { hasCliToken, jsonError, NO_STORE_HEADERS, requireManagementAccess } from "@/lib/auth/twoFactor/reauth";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const denied = await requireManagementAccess(request, body);
    if (denied) return denied;

    // Re-enrolling while already active also needs the CURRENT second factor, so a
    // stolen session plus a known password cannot silently swap the authenticator.
    if (getStatus().required && !hasCliToken(request)) {
      const verified = verifySecondFactor(body);
      if (!verified.ok) return jsonError("Invalid code", 401);
    }

    const { secret, uri } = startSetup();

    return NextResponse.json(
      {
        uri,
        secret,
        secretDisplay: formatSecretForDisplay(secret),
        algorithm: TOTP_ALGORITHM,
        digits: TOTP_DIGITS,
        period: TOTP_PERIOD,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
