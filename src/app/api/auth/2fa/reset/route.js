// Break-glass: wipe all 2FA state. Lost phone with the backup codes gone, or a
// `broken` state file that fails login closed.
//
// Local/CLI only — enforced by LOCAL_ONLY_PATHS in dashboardGuard (see
// lib/auth/twoFactor/paths.js), which accepts the CLI token or loopback + an
// authenticated session. No password is required, mirroring the existing
// /api/auth/reset-password precedent: possession of the host machine is the proof.
//
// Note this only clears the second factor. The password is untouched, so a remote
// attacker still cannot get in with this alone even if they somehow reached it.
import { NextResponse } from "next/server";
import { disable } from "@/lib/auth/twoFactor/state";

export async function POST() {
  try {
    disable();
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
