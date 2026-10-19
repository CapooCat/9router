"use client";

import PropTypes from "prop-types";
import { getZdrPolicy } from "open-sse/providers/zdr.js";

/**
 * Shield marking that a provider offers zero data retention at all.
 *
 * Capability only — it says nothing about whether ZDR is actually in effect
 * (custom header added / account setting enabled). Renders
 * nothing when the upstream published no policy: silence means "unknown
 * retention", and a shield on every card would read as a guarantee nobody made.
 */

const MODE_TITLE = {
  request: "Zero data retention available — add a header in Custom Headers to turn it on",
  default: "Zero data retention on by default — prompts and responses aren't stored",
  account: "Zero data retention available — turn it on in your account with this provider",
};

export default function ZdrShield({ providerId }) {
  const policy = getZdrPolicy(providerId);
  // "none" = vendor states there is no zero-retention path; a shield would claim one
  if (!policy || policy.mode === "none") return null;

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
