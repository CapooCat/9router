// Signing key for 2FA tickets.
//
// A ticket is "first factor passed, second factor pending" — strictly weaker than a
// session. `verifyDashboardAuthToken` accepts any JWT that verifies against the
// session SECRET regardless of its claims, so signing tickets with that same key
// would mean a ticket pasted into the `auth_token` cookie authenticates as a full
// session. Deriving a separate key makes that fail at the *signature*, which is a
// stronger guarantee than any claim check and needs no change to existing verifiers.
//
// HMAC rather than crypto.hkdfSync: available on every runtime this ships on,
// including Bun (`npm run start:bun`).
//
// Rotating JWT_SECRET invalidates sessions and tickets together — the correct
// coupling, since a ticket is only ever redeemed for a session.
import crypto from "node:crypto";
import { getJwtSecretRaw } from "@/lib/auth/dashboardSession";

const TICKET_KEY_INFO = "9r-2fa-ticket-v1";

let cached = null;

export function getTicketSecret() {
  if (!cached) {
    cached = crypto.createHmac("sha256", getJwtSecretRaw()).update(TICKET_KEY_INFO).digest();
  }
  return cached;
}
