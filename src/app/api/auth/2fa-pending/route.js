// "Is a 2FA challenge open for this browser?"
//
// PUBLIC, but discloses nothing: it only reports on a ticket the caller already
// holds. Deliberately does NOT report whether 2FA is enabled — that would hand an
// unauthenticated caller the install's security posture for free. A visitor learns
// 2FA exists only after presenting a correct password.
//
// The login page needs this because a ticket can exist without the page having
// issued it: an OIDC callback that redirects back to /login, a refresh mid-challenge,
// or a second tab. All three are dead ends otherwise.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readTwoFactorTicket } from "@/lib/auth/twoFactor/ticket";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const ticket = await readTwoFactorTicket(cookieStore);
    return NextResponse.json(
      { pending: !!ticket, method: ticket?.method || null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ pending: false, method: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
