// [fork] Runtime metadata probe for self-hosted OpenAI-/Anthropic-compatible servers.
//
// llama.cpp's /v1/models only advertises `meta.n_ctx_train` (the model's
// TRAINING context) and says nothing about the loaded mmproj or the chat
// template. llama-server exposes what it is really running at /props — a
// non-/v1 endpoint:
//
//   GET /props -> { "default_generation_settings": { "n_ctx": 32768 },
//                   "modalities": { "vision": true, "audio": false },
//                   "chat_template": "...", "chat_template_caps": { ... } }
//
// In router mode (`--models-dir`) the root /props is a placeholder and each
// model answers at /props?model=<id>. That route SPAWNS the model unless
// `autoload=false` is passed, so the probe always passes it — reading caps must
// never load a GGUF into memory.
//
// Best-effort only: any failure (404 on non-llama.cpp servers, timeout, bad
// JSON) returns null and callers fall back to whatever they already know.

import { capsFromServerProps, upstreamFeatureOverrides } from "../providers/upstreamCaps.js";
import { recordUpstreamFeatures } from "../providers/upstreamFeatures.js";
import { stripThinkingSuffix } from "../translator/concerns/thinkingUnified.js";

const CACHE_TTL_MS = 60 * 1000;
// A server that answered "no /props" will not grow one; re-asking every minute
// would cost every non-llama.cpp upstream an extra round trip on the hot path.
const NOT_SUPPORTED_TTL_MS = 10 * 60 * 1000;
const PROBE_TIMEOUT_MS = 2500;
const cache = new Map(); // key: props URL → { value, expiresAt }
const inflight = new Map(); // key: props URL → Promise

function propsUrlFor(baseUrl, model) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  // Strip the API suffix: ".../v1", ".../v1/chat/completions", ".../v1/messages".
  const root = trimmed.replace(/\/v1(\/.*)?$/, "");
  const url = `${root || trimmed}/props`;
  return model ? `${url}?model=${encodeURIComponent(model)}&autoload=false` : url;
}

async function probe(url, headers) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { value: null, ttl: NOT_SUPPORTED_TTL_MS };
    const json = await response.json();
    return { value: json && typeof json === "object" ? json : null, ttl: CACHE_TTL_MS };
  } catch {
    return { value: null, ttl: CACHE_TTL_MS };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Raw llama-server /props payload, or null when the server has none.
 * @param {string} baseUrl - provider base URL, with or without the /v1 suffix
 * @param {Record<string,string>} [headers] - auth headers to reuse
 * @param {{ model?: string }} [opts] - router mode: ask about one model (never autoloads)
 */
export async function fetchServerProps(baseUrl, headers = {}, { model } = {}) {
  const url = propsUrlFor(baseUrl, model);
  if (!url) return null;

  const cached = cache.get(url);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (inflight.has(url)) return inflight.get(url);

  const pending = probe(url, headers).then(({ value, ttl }) => {
    cache.set(url, { value, expiresAt: Date.now() + ttl });
    inflight.delete(url);
    return value;
  });
  inflight.set(url, pending);
  return pending;
}

/**
 * Props for one model on a server that may be a single-model llama-server or a
 * router: the root /props answers for a single-model server; a router defers to
 * /props?model=<id>, which only answers while that model is loaded.
 */
export async function fetchModelServerProps(baseUrl, headers, model) {
  const root = await fetchServerProps(baseUrl, headers);
  if (root?.role !== "router") return root;
  return model ? fetchServerProps(baseUrl, headers, { model }) : null;
}

function compatibleAuthHeaders(provider, apiKey) {
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (apiKey && provider.startsWith("anthropic-compatible-")) headers["x-api-key"] = apiKey;
  return headers;
}

/**
 * Request path: learn what a compatible upstream's server says about `model`
 * and record it, so getCapabilitiesForModel() stops stripping images and
 * thinking params a llama.cpp server can handle. Never throws.
 *
 * Called once from chatCore before the modality strip. Records under every id
 * capabilities get resolved under on that path: the client's `model` (modality
 * strip) and the upstream id with and without a "(level)" thinking suffix
 * (applyThinking).
 * @param {string} provider
 * @param {string} model - model id from modelInfo
 * @param {string} upstreamModel - id sent upstream, possibly "(level)"-suffixed
 * @param {object} credentials - connection credentials ({ apiKey, providerSpecificData.baseUrl })
 */
export async function observeCompatibleUpstream(provider, model, upstreamModel, credentials) {
  if (typeof provider !== "string") return;
  if (!provider.startsWith("openai-compatible-") && !provider.startsWith("anthropic-compatible-")) return;
  const baseUrl = credentials?.providerSpecificData?.baseUrl;
  const servedModel = stripThinkingSuffix(upstreamModel || model);
  if (!baseUrl || typeof servedModel !== "string" || !servedModel) return;
  const ids = [...new Set([servedModel, upstreamModel, model].filter((id) => typeof id === "string" && id))];

  try {
    const props = await fetchModelServerProps(baseUrl, compatibleAuthHeaders(provider, credentials.apiKey), servedModel);
    const features = upstreamFeatureOverrides(null, capsFromServerProps(props));
    // Nothing stated (no /props, router model not loaded) — keep what the
    // /v1/models fetch may already have recorded.
    if (Object.keys(features).length === 0) return;
    for (const id of ids) recordUpstreamFeatures(provider, id, features);
  } catch {
    // fail-open: capability detection must never break a request
  }
}
