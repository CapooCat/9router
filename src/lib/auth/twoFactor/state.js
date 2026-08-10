// Two-factor state machine:  absent → pending → active,  with disable/reset → absent.
//
// Every transition is a single `mutateState` compare-and-set, so no interleaving can
// produce a half-enrolled state (enabled with no secret, or enabled with no recovery
// codes). All functions are synchronous because `store.js` is — that synchrony is
// what the CAS guarantees rest on.
import { mutateState, readState, clearState } from "./store.js";
import { buildOtpauthUri, generateSecret, matchTotpStep, currentStep } from "./totp.js";
import {
  backupHashEquals,
  countUnusedBackupCodes,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from "./backupCodes.js";

// A QR screenshotted and left in a chat log stops working after this.
export const PENDING_TTL_MS = 10 * 60 * 1000;

// How far behind `lastUsedStep` a match must be before we call it a clock regression
// rather than an ordinary replay attempt.
const TOTP_CLOCK_SLIP_STEPS = 2;

function hasText(value) {
  return typeof value === "string" && value.length > 0;
}

/**
 * The one predicate login, the OIDC callback and the challenge route all share,
 * so the three can never disagree about whether a second factor is required.
 *
 * `broken` = explicitly enabled but the secret is gone (hand-edited or truncated
 * file). Callers must fail CLOSED on it: silently downgrading an enabled control
 * is the exact failure mode 2FA exists to prevent, and `POST /api/auth/2fa/reset`
 * makes recovery a single CLI menu item.
 */
export function getStatus(now = Date.now()) {
  const state = readState();
  const enabled = state.enabled === true;
  const hasSecret = hasText(state.secret);
  const pending = hasText(state.pendingSecret)
    && typeof state.pendingCreatedAt === "number"
    && now - state.pendingCreatedAt <= PENDING_TTL_MS;

  return {
    enabled,
    required: enabled && hasSecret,
    broken: enabled && !hasSecret,
    pending,
    backupCodesTotal: Array.isArray(state.backupCodes) ? state.backupCodes.length : 0,
    backupCodesRemaining: countUnusedBackupCodes(state.backupCodes),
    enrolledAt: state.enrolledAt || null,
    lastUsedAt: state.lastUsedAt || null,
  };
}

/**
 * Mint a pending secret. Never touches the active secret, so abandoning a
 * re-enrollment leaves the existing authenticator and backup codes working.
 * Calling this again replaces the pending secret, invalidating any QR on screen.
 */
export function startSetup(now = Date.now()) {
  const secret = generateSecret();
  mutateState((current) => ({
    next: { ...current, pendingSecret: secret, pendingCreatedAt: now },
  }));
  return { secret, uri: buildOtpauthUri(secret) };
}

export function cancelSetup() {
  mutateState((current) => {
    if (!hasText(current.pendingSecret)) return null;
    const { pendingSecret, pendingCreatedAt, ...rest } = current;
    return { next: rest };
  });
}

/**
 * Promote pending → active. One atomic write sets `enabled`, moves the secret,
 * mints fresh backup codes and burns the confirming step. Because the codes are
 * created in the same write, "2FA on with no way back in" is unreachable; because
 * the step is burned, the code that enabled 2FA cannot be replayed at login.
 *
 * Verifies against the PENDING secret only — matching against the active secret
 * would let a current code promote an unrelated pending secret.
 *
 * @returns {{ ok: true, backupCodes: string[] } | { ok: false, reason: "no_pending"|"pending_expired"|"invalid" }}
 */
export function confirmSetup(code, now = Date.now()) {
  const state = readState();
  if (!hasText(state.pendingSecret) || typeof state.pendingCreatedAt !== "number") {
    return { ok: false, reason: "no_pending" };
  }
  if (now - state.pendingCreatedAt > PENDING_TTL_MS) {
    cancelSetup();
    return { ok: false, reason: "pending_expired" };
  }

  const step = matchTotpStep(state.pendingSecret, code, now);
  if (step === null) return { ok: false, reason: "invalid" };

  const { plain, stored } = generateBackupCodes();
  const result = mutateState((current) => {
    // Re-read guard: another request may have cancelled or replaced the pending secret.
    if (current.pendingSecret !== state.pendingSecret) return null;
    const { pendingSecret, pendingCreatedAt, ...rest } = current;
    return {
      next: {
        ...rest,
        enabled: true,
        secret: state.pendingSecret,
        backupCodes: stored,
        lastUsedStep: step,
        lastUsedAt: new Date(now).toISOString(),
        enrolledAt: new Date(now).toISOString(),
      },
    };
  });

  if (!result.changed) return { ok: false, reason: "invalid" };
  return { ok: true, backupCodes: plain };
}

/** Full teardown. Used by disable and by the CLI recovery route. */
export function disable() {
  clearState();
}

/** Replaces the whole array, so unused old codes stop working too. */
export function regenerateBackupCodes(now = Date.now()) {
  const { plain, stored } = generateBackupCodes();
  const result = mutateState((current) => {
    if (current.enabled !== true || !hasText(current.secret)) return null;
    return {
      next: { ...current, backupCodes: stored, backupCodesGeneratedAt: new Date(now).toISOString() },
    };
  });
  if (!result.changed) return { ok: false, reason: "not_configured" };
  return { ok: true, backupCodes: plain };
}

/**
 * Verify a TOTP code and burn its step.
 *
 * `step <= lastUsedStep` (not `!==`) also rejects replaying an *earlier* still-in-window
 * code after a later one succeeded — the shoulder-surfed-previous-code case.
 *
 * Callers must collapse every reason into one generic client error; distinguishing
 * `not_configured` / `invalid` / `replay` turns this into a code-freshness oracle.
 */
export function consumeTotpCode(code, now = Date.now()) {
  const state = readState();
  if (state.enabled !== true || !hasText(state.secret)) {
    return { ok: false, reason: "not_configured" };
  }

  const step = matchTotpStep(state.secret, code, now);
  if (step === null) return { ok: false, reason: "invalid" };

  // Unique signature of a backwards wall-clock jump rather than an attack: the
  // monotonic rule will reject every TOTP code until time catches up. Backup codes
  // ignore `lastUsedStep`, so recovery still exists.
  if (typeof state.lastUsedStep === "number" && step < state.lastUsedStep - TOTP_CLOCK_SLIP_STEPS) {
    console.warn("[2FA] code matched a step far behind lastUsedStep — server clock may have moved backwards");
  }

  const result = mutateState((current) => {
    if (current.enabled !== true || !hasText(current.secret)) return null;
    if (current.secret !== state.secret) return null; // rotated mid-flight
    if (typeof current.lastUsedStep === "number" && step <= current.lastUsedStep) return null; // replay
    return {
      next: { ...current, lastUsedStep: step, lastUsedAt: new Date(now).toISOString() },
    };
  });

  return result.changed ? { ok: true } : { ok: false, reason: "invalid" };
}

/**
 * Consume a recovery code. Find-and-mark happens inside one CAS, which is what
 * makes it genuinely single-use under concurrent submissions. Codes are marked
 * `usedAt` rather than deleted so the remaining/total counters stay honest, and
 * an unknown code is indistinguishable from an already-used one.
 */
export function consumeBackupCode(input, now = Date.now()) {
  const normalized = normalizeBackupCode(input);
  if (!normalized) return { ok: false, reason: "invalid" };
  const hash = hashBackupCode(normalized);

  const result = mutateState((current) => {
    if (current.enabled !== true || !Array.isArray(current.backupCodes)) return null;
    const index = current.backupCodes.findIndex(
      (entry) => entry && entry.usedAt == null && backupHashEquals(entry.h, hash),
    );
    if (index === -1) return null;

    const backupCodes = current.backupCodes.map((entry, i) =>
      i === index ? { ...entry, usedAt: new Date(now).toISOString() } : entry,
    );
    return {
      next: { ...current, backupCodes, lastUsedAt: new Date(now).toISOString() },
      value: { remaining: countUnusedBackupCodes(backupCodes) },
    };
  });

  if (!result.changed) return { ok: false, reason: "invalid" };
  return { ok: true, remaining: result.value.remaining };
}

/**
 * Accept either factor from a request body. Single entry point so the challenge
 * route and the management routes apply identical rules.
 * @param {{code?: string, backupCode?: string}} body
 * @param {{allowBackupCode?: boolean}} options — regeneration passes false, so one
 *        leaked recovery code cannot be laundered into ten fresh ones.
 */
export function verifySecondFactor(body, { allowBackupCode = true, now = Date.now() } = {}) {
  const backupCode = body?.backupCode;
  if (hasText(backupCode)) {
    if (!allowBackupCode) return { ok: false, reason: "invalid" };
    const result = consumeBackupCode(backupCode, now);
    return result.ok ? { ...result, usedBackupCode: true } : result;
  }
  return consumeTotpCode(body?.code, now);
}

export { currentStep };
