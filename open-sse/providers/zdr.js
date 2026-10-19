// Zero Data Retention (ZDR) — one read-only policy declaration per provider.
//
// The router never mutates requests for ZDR. A provider that takes a per-request
// header knob is enabled by the user adding that header under the provider's
// Custom Headers (providerOverrides) — the dashboard card shows the exact row.
// Body-field knobs (OpenRouter/Vercel/Blackbox routing filters, OpenAI store) are
// not sent; their notes point at the account-wide equivalent instead.
//
//   mode:"request" — upstream takes a per-call HEADER. `headers` is the row to add.
//   mode:"account" — console toggle, signed agreement or approval. Nothing to send;
//                    we report it so the user knows the hop retains unless THEY enabled it.
//   mode:"default" — upstream states it retains nothing for ordinary inference.
//   mode:"none"    — upstream publishes a retention policy that offers no
//                    zero-retention option for this API (or plan). Declared so the
//                    dashboard can say so instead of staying silent.
//
// restrictsRouting marks gateways where ZDR FILTERS the serving pool: enabling it
// can turn a working model into a "no ZDR providers available" error.
//
// ── ADDING A PROVIDER ────────────────────────────────────────────────────────
// Add a `zdr` block to registry/{id}.js at TOP LEVEL — not inside `transport`,
// which is byte-compared against tests/__baseline__/providers-baseline.json.
// Always cite the vendor doc in `docs`. If no vendor doc states a policy, leave
// the provider undeclared: "unknown retention" is the honest default, and a
// wrong ZDR claim is worse than a missing one.
//
// ZdrPolicy shape:
//   { mode, headers?, restrictsRouting?, note?, docs? }

import REGISTRY from "./registry/index.js";

/** @type {Record<string, {mode:string, headers?:object, restrictsRouting?:boolean, note?:string, docs?:string}>} */
export const PROVIDER_ZDR = {};
for (const entry of REGISTRY) {
  if (entry.zdr) PROVIDER_ZDR[entry.id] = entry.zdr;
}

/** Declared ZDR policy for a provider id, or null when the provider never stated one. */
export function getZdrPolicy(provider) {
  return PROVIDER_ZDR[provider] || null;
}

/** All declared policies as [{ provider, ...policy }], for the dashboard. */
export function listZdrPolicies() {
  return Object.entries(PROVIDER_ZDR).map(([provider, policy]) => ({ provider, ...policy }));
}
