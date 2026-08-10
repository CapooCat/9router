"use client";

import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button, Card, Input } from "@/shared/components";
import Modal from "@/shared/components/Modal";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { cn } from "@/shared/utils/cn";
import CodeInput from "./CodeInput";

const EMPTY_SETUP = { open: false, step: "password", password: "", code: "", uri: "", secret: "" };
const EMPTY_AUTH = { open: false, mode: "", password: "", code: "" };

// Display grouping only — the value copied to the clipboard is always the raw secret.
const groupSecret = (secret = "") => secret.replace(/(.{4})/g, "$1 ").trim();

/**
 * Profile-page 2FA card, fully self-contained (own status fetch, own modals) so
 * `dashboard/profile/page.js` needs one import and one element.
 *
 * @param {boolean} props.requireLogin  From the page's settings. 2FA is refused while
 *   login is off, because it would be enrolled but never enforced.
 */
export default function TwoFactorCard({ requireLogin = true }) {
  const [status, setStatus] = useState({
    enabled: false,
    broken: false,
    pendingSetup: false,
    backupCodesTotal: 0,
    backupCodesRemaining: 0,
  });
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState(EMPTY_SETUP);
  const [auth, setAuth] = useState(EMPTY_AUTH);
  const [codes, setCodes] = useState([]);
  const [codesAcked, setCodesAcked] = useState(false);
  const [clockSkewMs, setClockSkewMs] = useState(0);
  const { copied, copy } = useCopyToClipboard();

  const applyStatus = useCallback((data) => {
    setStatus({
      enabled: data.enabled === true,
      broken: data.broken === true,
      pendingSetup: data.pendingSetup === true,
      backupCodesTotal: Number(data.backupCodesTotal || 0),
      backupCodesRemaining: Number(data.backupCodesRemaining || 0),
    });
    if (typeof data.serverTime === "number") setClockSkewMs(Math.abs(Date.now() - data.serverTime));
    if (data.pendingSetup === true || data.broken === true) setExpanded(true);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/2fa/status");
      if (!res.ok) return;
      applyStatus(await res.json());
    } catch (err) {
      console.error("Failed to fetch 2FA status:", err);
    }
  }, [applyStatus]);

  useEffect(() => {
    fetch("/api/auth/2fa/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) applyStatus(data); })
      .catch((err) => console.error("Failed to fetch 2FA status:", err));
  }, [applyStatus]);

  const startSetup = () => {
    setMessage({ type: "", message: "" });
    setSetup({ ...EMPTY_SETUP, open: true });
  };

  const closeSetup = () => {
    // The codes step is the only time the plaintext codes exist; do not let it close
    // until the user has copied or downloaded them.
    if (setup.step === "codes" && !codesAcked) return;
    setSetup(EMPTY_SETUP);
    setCodes([]);
    setCodesAcked(false);
  };

  const confirmPassword = async () => {
    setBusy(true);
    setMessage({ type: "", message: "" });
    try {
      const res = await fetch("/api/auth/2fa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: setup.password, code: setup.code || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", message: data.error || "Failed to start setup" });
        return;
      }
      // Drop the password from component state as soon as it has been spent.
      setSetup((s) => ({ ...s, step: "scan", uri: data.uri, secret: data.secret, password: "", code: "" }));
    } catch {
      setMessage({ type: "error", message: "An error occurred" });
    } finally {
      setBusy(false);
    }
  };

  const enable = async (code) => {
    setBusy(true);
    setMessage({ type: "", message: "" });
    try {
      const res = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", message: data.error || "Invalid code" });
        setSetup((s) => ({ ...s, code: "" }));
        return;
      }
      setCodes(data.backupCodes || []);
      setCodesAcked(false);
      setSetup((s) => ({ ...s, step: "codes", uri: "", secret: "", code: "" }));
      await loadStatus();
    } catch {
      setMessage({ type: "error", message: "An error occurred" });
    } finally {
      setBusy(false);
    }
  };

  const confirmAuthAction = async () => {
    const { mode, password, code } = auth;
    setBusy(true);
    setMessage({ type: "", message: "" });
    try {
      const path = mode === "disable" ? "/api/auth/2fa/disable" : "/api/auth/2fa/backup-codes";
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: "error", message: data.error || "Failed" });
        return;
      }

      setAuth(EMPTY_AUTH);
      await loadStatus();

      if (mode === "disable") {
        setMessage({ type: "success", message: "Two-factor authentication disabled" });
        return;
      }
      // Reuse the wizard's codes step so reveal/copy/download lives in one place.
      setCodes(data.backupCodes || []);
      setCodesAcked(false);
      setSetup({ ...EMPTY_SETUP, open: true, step: "codes" });
    } catch {
      setMessage({ type: "error", message: "An error occurred" });
    } finally {
      setBusy(false);
    }
  };

  const downloadCodes = () => {
    const stamp = new Date().toISOString().replace(/[.:]/g, "-");
    const content = [
      "9Router two-factor backup codes",
      `Generated: ${new Date().toISOString()}`,
      "Each code can be used once.",
      "",
      ...codes,
      "",
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `9router-2fa-backup-codes-${stamp}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setCodesAcked(true);
  };

  const setupFooter = () => {
    if (setup.step === "password") {
      return (
        <>
          <Button variant="ghost" onClick={closeSetup} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={confirmPassword} loading={busy} disabled={!setup.password}>
            Continue
          </Button>
        </>
      );
    }
    if (setup.step === "scan") {
      return (
        <>
          <Button variant="ghost" onClick={closeSetup} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => enable(setup.code)} loading={busy} disabled={setup.code.length !== 6}>
            Verify &amp; enable
          </Button>
        </>
      );
    }
    return (
      <Button variant="success" onClick={closeSetup} disabled={!codesAcked}>
        I&apos;ve saved my codes
      </Button>
    );
  };

  // A `broken` config has no usable secret, so no code can ever be produced for it —
  // the password alone tears it down (the disable route agrees).
  const codeExempt = auth.mode === "disable" && status.broken;

  return (
    <>
      <Card>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center gap-3 text-left"
        >
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <span className="material-symbols-outlined text-[20px]">encrypted</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold">Two-Factor Authentication</h3>
            <p className="text-xs text-text-muted">
              {status.broken ? (
                "Misconfigured — logins are blocked"
              ) : status.enabled ? (
                <>
                  Enabled · <span>{status.backupCodesRemaining}</span> backup codes left
                </>
              ) : status.pendingSetup ? (
                "Setup started but not verified"
              ) : (
                "Require a TOTP code after your password"
              )}
            </p>
          </div>
          <span className="material-symbols-outlined text-text-muted shrink-0">
            {expanded ? "expand_less" : "expand_more"}
          </span>
        </button>

        {expanded && (
          <div className="flex flex-col gap-4 mt-4">
            <p className="text-xs sm:text-sm text-text-muted">
              Asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator,
              1Password, Aegis) after your password. OIDC sign-in also lands on the code step, but MFA inside your
              identity provider is configured there, not here.
            </p>

            {requireLogin !== true && (
              <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                Turn on <b>Require login</b> above before enabling two-factor authentication.
              </p>
            )}

            {status.broken && (
              <p className="text-xs sm:text-sm text-red-500">
                Two-factor is enabled but its secret is missing, so every login is being refused. Disable it below, or
                run the <code className="bg-sidebar px-1 rounded">9router</code> CLI → Settings → Reset Two-Factor.
              </p>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-bg p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm sm:text-base">Status</p>
                <p className="text-xs sm:text-sm text-text-muted">
                  {status.enabled ? "Active on this dashboard" : "Not enabled"}
                </p>
              </div>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-1 rounded-full",
                  status.enabled
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-black/5 dark:bg-white/5 text-text-muted",
                )}
              >
                {status.enabled ? "ON" : "OFF"}
              </span>
            </div>

            {status.enabled && status.backupCodesRemaining <= 2 && (
              <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                Only <span>{status.backupCodesRemaining}</span> backup code(s) left. Generate a new set.
              </p>
            )}

            {clockSkewMs > 20000 && (
              <p className="text-xs sm:text-sm text-amber-600 dark:text-amber-400">
                This browser&apos;s clock differs from the server by <span>{Math.round(clockSkewMs / 1000)}</span>s.
                TOTP codes depend on accurate time — check the clock on the host and on your phone.
              </p>
            )}

            <div aria-live="polite">
              {message.message && (
                <p className={`text-xs sm:text-sm ${message.type === "error" ? "text-red-500" : "text-green-500"}`}>
                  {message.message}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border/50">
              {!status.enabled ? (
                <Button
                  variant="primary"
                  icon="add_moderator"
                  onClick={startSetup}
                  disabled={busy || requireLogin !== true}
                  className="w-full sm:w-auto"
                >
                  {status.pendingSetup ? "Resume setup" : "Enable two-factor"}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    icon="refresh"
                    onClick={() => setAuth({ ...EMPTY_AUTH, open: true, mode: "regenerate" })}
                    disabled={busy}
                    className="w-full sm:w-auto"
                  >
                    Regenerate backup codes
                  </Button>
                  <Button
                    variant="primary"
                    icon="remove_moderator"
                    onClick={() => setAuth({ ...EMPTY_AUTH, open: true, mode: "disable" })}
                    disabled={busy}
                  >
                    Disable
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Enrollment wizard: password → scan + verify → backup codes. */}
      <Modal
        isOpen={setup.open}
        onClose={closeSetup}
        closeOnOverlay={setup.step !== "codes"}
        title={
          setup.step === "password"
            ? "Confirm Password"
            : setup.step === "scan"
              ? "Scan QR Code"
              : "Save Your Backup Codes"
        }
        size={setup.step === "password" ? "sm" : "md"}
        footer={setupFooter()}
      >
        {setup.step === "password" && (
          <div className="flex flex-col gap-3">
            <p className="text-text-muted text-sm">Enter your current password to start two-factor setup.</p>
            <Input
              type="password"
              value={setup.password}
              onChange={(e) => setSetup((s) => ({ ...s, password: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && setup.password) confirmPassword();
              }}
              placeholder="Current password"
              autoFocus
            />
            {status.enabled && (
              <CodeInput
                mode="totp"
                label="Current authentication code"
                value={setup.code}
                onChange={(v) => setSetup((s) => ({ ...s, code: v }))}
                hint="Re-enrolling replaces your authenticator, so a current code is required."
                disabled={busy}
              />
            )}
            <div aria-live="polite">
              {message.type === "error" && <p className="text-xs text-red-500">{message.message}</p>}
            </div>
          </div>
        )}

        {setup.step === "scan" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              Scan this code with your authenticator app, then enter the 6-digit code it shows.
            </p>

            {/* Hard-coded black-on-white with a white wrapper: an inverted QR fails on a
                meaningful share of Android scanners, so the quiet zone stays white in
                both themes rather than following the app theme. */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-lg border border-border">
                <QRCodeSVG
                  value={setup.uri}
                  size={176}
                  level="M"
                  marginSize={4}
                  bgColor="#FFFFFF"
                  fgColor="#000000"
                  title="Two-factor setup QR code"
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="font-medium text-text-main text-xs sm:text-sm">Or enter this key manually</p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={copied === "secret" ? "check" : "content_copy"}
                  onClick={() => copy(setup.secret, "secret")}
                >
                  {copied === "secret" ? "Copied!" : "Copy"}
                </Button>
              </div>
              <code className="block break-all font-mono text-xs sm:text-sm select-all">
                {groupSecret(setup.secret)}
              </code>
            </div>

            <CodeInput
              mode="totp"
              label="Authentication code"
              value={setup.code}
              onChange={(v) => setSetup((s) => ({ ...s, code: v }))}
              onComplete={(v) => enable(v)}
              disabled={busy}
              autoFocus
            />

            <div aria-live="polite">
              {message.message && (
                <p className={`text-xs sm:text-sm ${message.type === "error" ? "text-red-500" : "text-green-500"}`}>
                  {message.message}
                </p>
              )}
            </div>
          </div>
        )}

        {setup.step === "codes" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                These codes are shown only once. Store them somewhere safe — each one works a single time if you lose
                your authenticator.
              </p>
            </div>

            <ul className="grid grid-cols-2 gap-2" data-i18n-skip="true">
              {codes.map((code) => (
                <li key={code} className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2 text-center">
                  <code className="font-mono text-sm select-all">{code}</code>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                icon={copied === "codes" ? "check" : "content_copy"}
                onClick={() => {
                  copy(codes.join("\n"), "codes");
                  setCodesAcked(true);
                }}
                className="w-full sm:w-auto"
              >
                {copied === "codes" ? "Copied!" : "Copy all"}
              </Button>
              <Button variant="outline" icon="download" onClick={downloadCodes} className="w-full sm:w-auto">
                Download .txt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Disable / regenerate. Not ConfirmModal — its `message` renders into a single
          <p>, and both flows need a password plus a code. */}
      <Modal
        isOpen={auth.open}
        onClose={() => setAuth(EMPTY_AUTH)}
        title={auth.mode === "disable" ? "Disable Two-Factor" : "Regenerate Backup Codes"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAuth(EMPTY_AUTH)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={auth.mode === "disable" ? "danger" : "primary"}
              onClick={confirmAuthAction}
              loading={busy}
              disabled={!auth.password || (!codeExempt && auth.code.length !== 6)}
            >
              {auth.mode === "disable" ? "Disable" : "Regenerate"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-text-muted text-sm">
            {codeExempt
              ? "The stored secret is missing, so no code can be generated. Confirm your password to clear the broken configuration."
              : auth.mode === "disable"
                ? "Confirm your password and a current code to turn off two-factor authentication."
                : "Confirm your password and a current code. Your existing backup codes stop working immediately."}
          </p>
          <Input
            type="password"
            value={auth.password}
            onChange={(e) => setAuth((s) => ({ ...s, password: e.target.value }))}
            placeholder="Current password"
            autoFocus
          />
          {/* No auto-submit here: the code is not the only required field. */}
          {!codeExempt && (
            <CodeInput
              mode="totp"
              label="Authentication code"
              value={auth.code}
              onChange={(v) => setAuth((s) => ({ ...s, code: v }))}
              onSubmitKey={() => {
                if (auth.password && auth.code.length === 6) confirmAuthAction();
              }}
              disabled={busy}
            />
          )}
          <div aria-live="polite">
            {message.type === "error" && <p className="text-xs text-red-500">{message.message}</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
