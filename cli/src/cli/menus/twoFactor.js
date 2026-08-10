const api = require("../api/client");
const { confirm, pause } = require("../utils/input");
const { showStatus } = require("../utils/display");

// Kept in its own module so menus/settings.js only ever needs one import, one header
// line and one spread — any future 2FA menu work happens here.

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
};

/**
 * Header line for the settings menu.
 * @param {Object} data - refresh() payload; expects data.twoFactor
 */
function twoFactorHeaderLine(data) {
  const twoFactor = data?.twoFactor || {};
  if (twoFactor.broken) {
    return `  2FA:      ${COLORS.yellow}BROKEN${COLORS.reset} ${COLORS.dim}(logins blocked — reset below)${COLORS.reset}`;
  }
  const on = twoFactor.enabled === true;
  const detail = on
    ? `${COLORS.dim}(TOTP, ${twoFactor.backupCodesRemaining ?? 0} backup codes)${COLORS.reset}`
    : `${COLORS.dim}(TOTP)${COLORS.reset}`;
  return `  2FA:      ${on ? `${COLORS.green}ON${COLORS.reset}` : `${COLORS.red}OFF${COLORS.reset}`} ${detail}`;
}

/**
 * Disable 2FA server-side. For a lost authenticator with the backup codes gone, or a
 * misconfigured state that refuses every login. The CLI bypasses dashboard auth with
 * x-9r-cli-token, and the route is local-only.
 */
async function resetTwoFactor() {
  const ok = await confirm("Disable two-factor authentication and delete the TOTP secret?");
  if (!ok) {
    showStatus("Cancelled", "info");
    await pause();
    return;
  }

  const result = await api.resetTwoFactor();
  if (result.success) {
    showStatus("Two-factor disabled. Re-enable it from Profile → Two-Factor Authentication.", "success");
  } else {
    showStatus(`Failed: ${result.error}`, "error");
  }
  await pause();
}

/** Menu items to spread into the settings menu's `items` array. */
function twoFactorMenuItems() {
  return [
    {
      label: (d) => {
        const twoFactor = d?.twoFactor || {};
        if (twoFactor.broken) return "🔐 Reset Two-Factor (misconfigured — fixes login)";
        return twoFactor.enabled === true
          ? "🔐 Reset Two-Factor (disable TOTP)"
          : "🔐 Reset Two-Factor (already off)";
      },
      action: async () => { await resetTwoFactor(); return true; },
    },
  ];
}

module.exports = { twoFactorHeaderLine, twoFactorMenuItems };
