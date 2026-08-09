// Zero Data Retention (ZDR) — one declaration per provider, doing two jobs.
//
// ZDR is sold three different ways and only one of them is something a router can
// put on the wire, so a single boolean per provider would be a lie:
//
//   mode:"request" — upstream takes a per-call knob (body field or header). We send it.
//   mode:"account" — console toggle or signed agreement. Nothing to send; we report it
//                    so the user knows the hop still retains unless THEY enabled it.
//   mode:"default" — upstream states it retains nothing for ordinary inference.
//
// Gateways that FILTER routing on ZDR (openrouter, vercel-ai-gateway) set
// restrictsRouting: turning ZDR on there can convert a working model into a
// "no ZDR providers available" 400. That is why the feature is a global opt-in
// setting (settings.zeroDataRetention, default false) instead of always-on.
//
// ── ADDING A PROVIDER ────────────────────────────────────────────────────────
// Add a `zdr` block to registry/{id}.js at TOP LEVEL — not inside `transport`,
// which is byte-compared against tests/__baseline__/providers-baseline.json.
// Always cite the vendor doc in `docs`. If no vendor doc states a policy, leave
// the provider undeclared: "unknown retention" is the honest default, and a
// wrong ZDR claim is worse than a missing one.
//
// ZdrPolicy shape:
//   { mode, body?, headers?, restrictsRouting?, note?, docs? }
//   body    — deep-merged into the outbound provider-format body (ZDR wins over
//             whatever the client sent, so a client cannot silently opt out).
//   headers — merged onto the upstream request headers.
//
// A knob belongs here, never in transport.headers, even when the vendor's own CLI
// sends it unconditionally: baking it in makes it unswitchable, and a ZDR flag can
// cost you models (commandcode's free tier 400s when x-cmd-zdr is set).

import REGISTRY from "./registry/index.js";

/** @type {Record<string, {mode:string, body?:object, headers?:object, restrictsRouting?:boolean, note?:string, docs?:string}>} */
export const PROVIDER_ZDR = {};
for (const entry of REGISTRY) {
  if (entry.zdr) PROVIDER_ZDR[entry.id] = entry.zdr;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Deep-merge `source` into `target`, recording the leaf paths actually written.
// Existing sibling keys survive (openrouter clients may already send
// `provider: { order: [...] }` — we add `zdr` beside it, not over it).
function mergeInto(target, source, prefix, applied) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      if (!isPlainObject(target[key])) target[key] = {};
      mergeInto(target[key], value, path, applied);
    } else {
      target[key] = value;
      applied.push(path);
    }
  }
}

/** Declared ZDR policy for a provider id, or null when the provider never stated one. */
export function getZdrPolicy(provider) {
  return PROVIDER_ZDR[provider] || null;
}

/** All declared policies as [{ provider, ...policy }], for the dashboard. */
export function listZdrPolicies() {
  return Object.entries(PROVIDER_ZDR).map(([provider, policy]) => ({ provider, ...policy }));
}

/** Headers a provider wants when ZDR is on, or null. */
export function zdrHeadersFor(provider) {
  const policy = PROVIDER_ZDR[provider];
  if (!policy?.headers) return null;
  return { ...policy.headers };
}

/**
 * Merge a provider's ZDR body knob into the outbound body (mutates).
 * Returns a short label of what was written (for the request log), or null.
 * Fail-open: a malformed body must never break the request.
 */
export function applyZdrToBody(provider, body) {
  const policy = PROVIDER_ZDR[provider];
  if (!policy?.body || !isPlainObject(body)) return null;
  try {
    const applied = [];
    mergeInto(body, policy.body, "", applied);
    return applied.length ? applied.join(",") : null;
  } catch {
    return null;
  }
}
