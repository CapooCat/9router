// One-time recovery codes.
import crypto from "node:crypto";

export const BACKUP_CODE_COUNT = 10;
const CODE_LENGTH = 12;
const GROUP_SIZE = 4;

// RFC 4648 base32: no 0/1/8/9, so the classic O↔0 and I↔1 transcription slips
// cannot turn one valid code into a *different* valid code.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 12 chars × 5 bits = 60 bits of entropy per code, from a CSPRNG. */
function randomCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    // Alphabet length is 32 and byte range is 256, so the modulo is uniform.
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Display form `XXXX-XXXX-XXXX`. Storage and comparison always use the normalized form. */
export function formatBackupCode(code) {
  return String(code || "").replace(new RegExp(`(.{${GROUP_SIZE}})(?=.)`, "g"), "$1-");
}

/**
 * Strip only separators, then require an exact match on the alphabet.
 * Deliberately does NOT strip arbitrary junk — reshaping a typo into a
 * well-formed string would burn an attempt against a code the user never typed.
 * @returns {string|null} normalized code, or null when malformed.
 */
export function normalizeBackupCode(input) {
  const cleaned = String(input || "").toUpperCase().replace(/[\s-]/g, "");
  if (!new RegExp(`^[A-Z2-7]{${CODE_LENGTH}}$`).test(cleaned)) return null;
  return cleaned;
}

/**
 * Unsalted SHA-256, deliberately not bcrypt:
 *  1. Cost factors and salts defend low-entropy, human-chosen secrets. There is no
 *     dictionary for 60 uniformly random bits, and no two installs share a code, so
 *     neither stretching nor salting buys anything here.
 *  2. Codes are opaque, so verification tries the input against up to 10 stored
 *     hashes. At bcrypt cost 10 that is ~1s of single-threaded CPU per attempt, on
 *     the *unauthenticated* half of the login flow — a self-inflicted DoS.
 *  3. bcryptjs is async, so it cannot run inside the synchronous `mutateState`
 *     compare-and-set, and that CAS is what makes consumption genuinely one-time.
 *  4. A state-file leak also exposes the TOTP secret, so no choice of hash here
 *     changes the outcome of that scenario. Slow hashing would be theatre paid for
 *     in login latency.
 */
export function hashBackupCode(normalized) {
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Constant-time hex compare. */
export function backupHashEquals(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * @returns {{ plain: string[], stored: Array<{h: string, usedAt: null}> }}
 * `plain` is shown to the user exactly once and never persisted.
 */
export function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const plain = [];
  const stored = [];
  for (let i = 0; i < count; i++) {
    const code = randomCode();
    plain.push(formatBackupCode(code));
    stored.push({ h: hashBackupCode(code), usedAt: null });
  }
  return { plain, stored };
}

export function countUnusedBackupCodes(backupCodes) {
  if (!Array.isArray(backupCodes)) return 0;
  return backupCodes.filter((entry) => entry && entry.usedAt == null).length;
}
