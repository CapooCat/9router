"use client";

import PropTypes from "prop-types";
import { getZdrPolicy } from "open-sse/providers/zdr.js";

/**
 * Shield marking that a provider offers zero data retention at all.
 *
 * Capability only — it says nothing about whether ZDR is currently switched on,
 * which is per-provider state that lives on the provider's own page. Renders
 * nothing when the upstream published no policy: silence means "unknown
 * retention", and a shield on every card would read as a guarantee nobody made.
 */

const MODE_TITLE = {
  request: "Zero data retention — available per request",
  default: "Zero data retention — retains nothing by default",
  account: "Zero data retention — enable it on the provider's own console",
};

export default function ZdrShield({ providerId }) {
  const policy = getZdrPolicy(providerId);
  if (!policy) return null;

  return (
    <span
      title={MODE_TITLE[policy.mode]}
      className="material-symbols-outlined shrink-0 text-[18px]! leading-none text-emerald-500"
    >
      shield_lock
    </span>
  );
}

ZdrShield.propTypes = {
  providerId: PropTypes.string.isRequired,
};
