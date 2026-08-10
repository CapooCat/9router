"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/components";
import CodeInput from "./CodeInput";

const CODE_INPUT_ID = "twofa-code";

/**
 * The login page's second step. Self-contained so `src/app/login/page.js` only needs
 * an import, one state flag and a render branch.
 *
 * Renders nothing until `active`, but still probes /api/auth/2fa-pending on mount —
 * that dormant probe is what rescues the three cases where a ticket exists but this
 * page did not issue it: an OIDC callback that redirects back to /login, a refresh
 * mid-challenge, and a second tab. All three are dead ends otherwise.
 *
 * @param {boolean} props.active                     Show the code form.
 * @param {(data: object) => void} props.onVerified  Receives { mustChangePassword, ... }.
 * @param {(info?: {error?: string, retryAfter?: number, resetHint?: string}) => void} props.onCancel
 *   Ticket already dropped server-side. Called with no argument for a user-initiated
 *   "Back", or with a reason when the server kicked us out (burned/expired ticket).
 * @param {() => void} [props.onPending]             Fired when the mount probe finds a live ticket.
 */
export default function TwoFactorChallenge({ active = false, onVerified, onCancel, onPending }) {
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!onPending) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/2fa-pending", { signal: AbortSignal.timeout(5000) });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.pending === true) onPending();
      } catch {
        // Probe failure is non-fatal: worst case the user re-enters their password.
      }
    })();
    return () => { cancelled = true; };
  }, [onPending]);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  const submitCode = useCallback(async (raw) => {
    if (submittingRef.current || retryAfter > 0) return;
    submittingRef.current = true;
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const payload = useBackupCode ? { backupCode: raw } : { code: raw };
      const res = await fetch("/api/auth/2fa-challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        onVerified?.(data);
        return;
      }

      // Ticket burned, expired, or 2FA switched off mid-challenge → start over.
      // Hand the reason to the parent rather than calling setError: this component
      // unmounts on cancel, so a local message would never be seen. The parent shows
      // it on the password form straight away, along with any lockout countdown.
      if (data?.ticketExpired || data?.code === "twofa_not_required") {
        onCancel?.({
          error: data?.error || "Please sign in again.",
          retryAfter: data?.retryAfter ? Number(data.retryAfter) : 0,
          resetHint: data?.resetHint || "",
        });
        return;
      }

      setError(data?.error || "Invalid code");
      if (data?.resetHint) setResetHint(data.resetHint);
      if (data?.retryAfter) setRetryAfter(Number(data.retryAfter));
      setCode("");
      document.getElementById(CODE_INPUT_ID)?.focus();
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }, [onCancel, onVerified, retryAfter, useBackupCode]);

  const handleSubmit = (event) => {
    event.preventDefault();
    submitCode(code.trim());
  };

  const handleBack = async () => {
    // Logout also clears the 2FA ticket cookie, so this genuinely abandons the challenge.
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    onCancel?.();
  };

  const tooShort = useBackupCode ? code.replace(/-/g, "").length < 12 : code.length !== 6;

  if (!active) return null;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="size-14 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-3xl!">verified_user</span>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-md font-medium">Two-factor authentication</p>
          <p className="text-sm text-text-muted">
            {useBackupCode
              ? "Enter one of your saved backup codes."
              : "Enter the 6-digit code from your authenticator app."}
          </p>
        </div>
      </div>

      <CodeInput
        inputId={CODE_INPUT_ID}
        mode={useBackupCode ? "backup" : "totp"}
        label={useBackupCode ? "Backup code" : "Authentication code"}
        value={code}
        onChange={setCode}
        onComplete={(next) => submitCode(next)}
        disabled={loading || retryAfter > 0}
        autoFocus
      />

      {/* Always mounted: an aria-live region added at the same time as its content is usually not announced. */}
      <div aria-live="polite" className="flex flex-col gap-1">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {retryAfter > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Locked. Retry in <span className="font-mono">{retryAfter}</span>s.
          </p>
        )}
        {resetHint && <p className="text-xs text-text-muted">{resetHint}</p>}
      </div>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        loading={loading}
        disabled={retryAfter > 0 || tooShort}
      >
        {retryAfter > 0 ? `Wait ${retryAfter}s` : "Verify"}
      </Button>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setUseBackupCode((v) => !v);
            setCode("");
            setError("");
          }}
        >
          {useBackupCode ? "Use authenticator app" : "Use a backup code instead"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
