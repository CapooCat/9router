// Persistence for two-factor state.
//
// Deliberately NOT in the settings blob (`src/lib/db/repos/settingsRepo.js`):
//  - `PATCH /api/settings` mass-assigns whatever it is handed, so a `twoFactor` key
//    there would let any authenticated caller write their own TOTP secret. Keeping it
//    out of the blob removes that class of bug instead of filtering for it.
//  - `exportSettings()` returns the raw row, so the blob leaks into every DB backup.
//    A separate file keeps the TOTP secret out of downloadable backups.
//  - It survives the CLI "Reset Password to Default" action, which is correct.
//
// Trade-off: restoring a DB backup does NOT restore 2FA. The CLI reset path
// (`POST /api/auth/2fa/reset`) covers anyone who ends up confused by that.
//
// Same DATA_DIR + 0600 precedent as the JWT secret file in dashboardSession.js.
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/dataDir";

const FILE_NAME = "two-factor.json";
const FILE_MODE = 0o600;

function filePath() {
  return path.join(DATA_DIR, FILE_NAME);
}

/**
 * Current state, or `{}` when absent/unreadable/corrupt.
 *
 * A corrupt file reads as `{}` (⇒ `enabled` falsy ⇒ 2FA off) rather than throwing,
 * so a truncated write can never wedge the login route. The `broken` check in
 * `state.js` is what catches the dangerous variant — `enabled` set with no secret.
 *
 * Shape: { enabled, secret, pendingSecret, pendingCreatedAt, lastUsedStep,
 *          lastUsedAt, backupCodes: [{ h, usedAt }], enrolledAt }
 */
export function readState() {
  try {
    const raw = fs.readFileSync(filePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeState(next) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = filePath();
  // Write-then-rename so a crash mid-write cannot leave a half-written secret.
  // `renameSync` replaces an existing destination on Windows too (MoveFileEx).
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: FILE_MODE });
  try {
    fs.renameSync(tmp, target);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    throw error;
  }
  // renameSync preserves the temp file's mode, but be explicit for pre-existing files.
  try { fs.chmodSync(target, FILE_MODE); } catch {}
}

/**
 * Atomic read-modify-write. `mutator(current)` MUST be synchronous — that is what
 * makes this a compare-and-set: nothing else in this single-threaded process can
 * interleave between the read and the write, which is the same guarantee the
 * SQLite `adapter.transaction(fn)` gives the settings blob.
 *
 * Return `null` from the mutator to abort with no write (used for every CAS failure:
 * replay, rotated secret, already-used backup code).
 *
 * @param {(current: object) => ({ next: object, value?: any } | null)} mutator
 * @returns {{ changed: boolean, state: object, value: any }}
 */
export function mutateState(mutator) {
  const current = readState();
  const result = mutator(current);
  if (!result) return { changed: false, state: current, value: undefined };
  writeState(result.next);
  return { changed: true, state: result.next, value: result.value };
}

/** Remove all 2FA state (disable / CLI recovery). */
export function clearState() {
  try {
    fs.unlinkSync(filePath());
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export const __test__ = { filePath, writeState };
