// [fork] Features a compatible upstream stated about the model it serves.
//
// Self-hosted model ids (a llama.cpp `--alias`, a GGUF filename) match no
// capability pattern, so getCapabilitiesForModel() reports vision/reasoning as
// false and the request path strips images and thinking params the server could
// have handled. What the server itself says (llama.cpp /props, router listing —
// see upstreamCaps.js) is recorded here, keyed provider + model, by the
// /v1/models catalog fetch (services/compatibleModels.js) and the request path
// (services/serverProps.js).
//
// capabilities.js applies it with a single applyUpstreamFeatures() call at the
// end of refine(); everything else lives here so upstream merges stay clean.
//
// Server-side only — empty in the browser bundle. The store lives on globalThis
// because the server bundles this module into every route chunk with its own
// module state (same reason as capabilities.js setCatalogSource).

const localStore = new Map();

function store() {
  if (typeof globalThis === "undefined") return localStore;
  if (!globalThis.__9rUpstreamFeatures) globalThis.__9rUpstreamFeatures = localStore;
  return globalThis.__9rUpstreamFeatures;
}

const keyOf = (provider, model) => `${provider}\u0000${model}`;

/**
 * Record what an upstream server stated about a model it serves.
 * @param {string} provider
 * @param {string} model - model id as capabilities are looked up
 * @param {object|null} features - { vision?, audioInput?, videoInput?, reasoning? }; empty/null clears
 */
export function recordUpstreamFeatures(provider, model, features) {
  if (!provider || !model) return;
  const key = keyOf(provider, model);
  if (features && Object.keys(features).length > 0) store().set(key, { ...features });
  else store().delete(key);
}

/**
 * Overlay recorded features onto a resolved capabilities object (mutates it).
 * The serving upstream's statement wins over name heuristics both ways: a
 * llama.cpp server without --mmproj rejects images whatever the name suggests.
 */
export function applyUpstreamFeatures(result, provider, model) {
  if (!provider || !model) return result;
  const stated = store().get(keyOf(provider, model));
  if (stated) Object.assign(result, stated);
  return result;
}
