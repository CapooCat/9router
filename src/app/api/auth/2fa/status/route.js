// Non-secret 2FA summary for the dashboard card and the CLI header line.
// Authenticated (deny-by-default in dashboardGuard); never returns the secret,
// the pending secret, or any backup-code hash.
import { NextResponse } from "next/server";
import { getStatus } from "@/lib/auth/twoFactor/state";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = getStatus();
    return NextResponse.json(
      {
        enabled: status.enabled,
        broken: status.broken,
        pendingSetup: status.pending,
        enrolledAt: status.enrolledAt,
        lastUsedAt: status.lastUsedAt,
        backupCodesTotal: status.backupCodesTotal,
        backupCodesRemaining: status.backupCodesRemaining,
        // Lets the client warn about a skewed browser clock, the most common cause
        // of "my code is always rejected".
        serverTime: Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
