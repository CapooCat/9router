"use client";

import PropTypes from "prop-types";
import { Card } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { getZdrPolicy } from "open-sse/providers/zdr.js";

/**
 * Zero-data-retention policy panel for one provider. Read-only.
 *
 * Renders nothing when the upstream never published a retention policy — an
 * undeclared provider means "unknown retention", and an empty card would read as
 * reassurance. The router sends no ZDR knob itself: a "request"-mode provider
 * lists the header row to add under Custom Headers; "account"/"default"/"none"
 * providers render as policy text only.
 */

const MODE_LABEL = {
  request: "Needs a header",
  default: "On by default",
  account: "Set up with provider",
  none: "Not available",
};

const MODE_SUMMARY = {
  request: "This provider can skip storing your prompts and responses, but only when each request asks for it. Add the header below under Custom Headers and 9Router will send it with every call.",
  default: "This provider says it doesn't store your prompts or responses after answering normal requests. Nothing to set up — check the details below for exceptions.",
  account: "This provider may keep your prompts and responses for a while unless you turn on zero retention in your account with them. 9Router can't switch this on for you.",
  none: "This provider doesn't offer zero retention on this API, so your prompts and responses may be kept for a while. Use a different provider if that matters to you.",
};

export default function ZeroDataRetentionCard({ providerId }) {
  const { copied, copy } = useCopyToClipboard();
  const policy = getZdrPolicy(providerId);
  if (!policy) return null;

  const headerRows = Object.entries(policy.headers || {});

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <span
          className={`material-symbols-outlined text-[20px] ${policy.mode === "none" ? "text-text-muted" : "text-emerald-500"}`}
        >
          {policy.mode === "none" ? "shield" : "shield_lock"}
        </span>
        <h2 className="text-lg font-semibold">Zero Data Retention</h2>
        <span className="rounded bg-text-muted/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted">
          {MODE_LABEL[policy.mode]}
        </span>
        {policy.restrictsRouting && (
          <span
            title="With zero retention on, models that no zero-retention server can run return an error instead of falling back."
            className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-600"
          >
            Can block some models
          </span>
        )}
      </div>

      <p className="mb-3 text-sm">{MODE_SUMMARY[policy.mode]}</p>

      {policy.restrictsRouting && (
        <p className="mb-3 text-xs text-amber-600 sm:text-sm">
          Heads up: with zero retention on, some models may stop working here — they return an error instead of
          switching to a server that keeps data.
        </p>
      )}

      {headerRows.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-text-muted sm:text-sm">Header to add:</p>
          <div className="flex flex-col gap-1.5">
            {headerRows.map(([name, value]) => (
              <div key={name} className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-text-muted/10 px-2 py-1 font-mono text-xs">
                  {name}: {value}
                </code>
                <button
                  type="button"
                  onClick={() => copy(`${name}: ${value}`, name)}
                  title="Copy header"
                  className="material-symbols-outlined shrink-0 text-[18px] text-text-muted hover:text-primary"
                >
                  {copied === name ? "check" : "content_copy"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {policy.note && (
        <div>
          <p className="mb-0.5 text-xs font-medium text-text-muted sm:text-sm">Details</p>
          <p className="text-xs text-text-muted sm:text-sm">{policy.note}</p>
        </div>
      )}

      {policy.docs && (
        <a
          href={policy.docs}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-2 inline-block text-xs text-primary hover:underline sm:text-sm"
        >
          Read the provider&apos;s data policy
        </a>
      )}

      <p className="mt-3 text-[11px] text-text-muted">
        This is about what the provider keeps. 9Router&apos;s own request logs and usage stats stay on this machine
        either way.
      </p>
    </Card>
  );
}

ZeroDataRetentionCard.propTypes = {
  providerId: PropTypes.string.isRequired,
};
