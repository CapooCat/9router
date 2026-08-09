"use client";

import { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { Card, Toggle } from "@/shared/components";
import { getZdrPolicy } from "open-sse/providers/zdr.js";

/**
 * Zero-data-retention panel for one provider.
 *
 * Renders nothing when the upstream never published a retention policy — an
 * undeclared provider means "unknown retention", and an empty card would read as
 * reassurance. Only "request"-mode providers expose a knob 9Router can send, so
 * only those get a toggle; "account"/"default" providers render as policy text.
 *
 * Owns its own settings I/O: the opt-in lives in the shared `zdrProviders` map,
 * so every write re-reads first rather than trusting a snapshot that could drop
 * another provider's entry.
 */

const MODE_LABEL = {
  request: "Sent per request",
  default: "No retention by default",
  account: "Enable on the provider",
};

export default function ZeroDataRetentionCard({ providerId }) {
  const policy = getZdrPolicy(providerId);
  const hasKnob = !!(policy && (policy.body || policy.headers));

  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasKnob) return;
    let cancelled = false;
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => {
        if (!cancelled) setEnabled((data.zdrProviders || {})[providerId] === true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [providerId, hasKnob]);

  const handleToggle = useCallback(async (on) => {
    setEnabled(on);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const data = res.ok ? await res.json() : {};
      const updated = { ...(data.zdrProviders || {}) };
      if (on) updated[providerId] = true;
      else delete updated[providerId];
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zdrProviders: updated }),
      });
    } catch (error) {
      console.log("Error saving ZDR config:", error);
      setEnabled(!on); // keep the switch honest about what is stored
    } finally {
      setSaving(false);
    }
  }, [providerId]);

  if (!policy) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <span className="material-symbols-outlined text-[20px] text-emerald-500">shield_lock</span>
        <h2 className="text-lg font-semibold">Zero Data Retention</h2>
        <span className="rounded bg-text-muted/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
          {MODE_LABEL[policy.mode]}
        </span>
        {policy.restrictsRouting && (
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-600">
            may fail routing
          </span>
        )}
      </div>

      {hasKnob && (
        <div className="mb-3 flex items-start justify-between gap-4 sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Request zero retention on every call</p>
            <p className="text-xs text-text-muted">
              {policy.restrictsRouting
                ? "Restricts routing to zero-retention endpoints — a model served by none fails instead of falling back."
                : "Adds this provider's zero-retention flag to each outbound request."}
            </p>
          </div>
          <Toggle checked={enabled} onChange={handleToggle} disabled={saving} />
        </div>
      )}

      {policy.note && <p className="text-xs text-text-muted sm:text-sm">{policy.note}</p>}

      {policy.docs && (
        <a
          href={policy.docs}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-xs text-primary hover:underline sm:text-sm"
        >
          Provider retention policy
        </a>
      )}
    </Card>
  );
}

ZeroDataRetentionCard.propTypes = {
  providerId: PropTypes.string.isRequired,
};
