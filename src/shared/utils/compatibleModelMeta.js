// Runtime metadata probe for self-hosted OpenAI-compatible servers.
//
// llama.cpp's /v1/models only advertises `meta.n_ctx_train` (the model's
// TRAINING context), which is usually far larger than the context the server is
// actually running with (`-c` / `--ctx-size`, divided across `--parallel`
// slots). llama-server exposes the real value at /props — a non-/v1 endpoint:
//
//   GET /props -> { "default_generation_settings": { "n_ctx": 32768, ... }, ... }
//
// Best-effort only: any failure (404 on non-llama.cpp servers, timeout, bad
// JSON) returns null and callers fall back to whatever /v1/models advertised.

const CACHE_TTL_MS = 60 * 1000;
const PROBE_TIMEOUT_MS = 2500;
const cache = new Map(); // key: propsUrl → { value, expiresAt }

function propsUrlFor(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  // Strip the OpenAI-compat suffix: ".../v1" or ".../v1/chat/completions".
  const root = trimmed.replace(/\/v1(\/.*)?$/, "");
  return `${root || trimmed}/props`;
}

function toPositiveInt(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function readContextWindow(props) {
  const candidates = [
    props?.default_generation_settings?.n_ctx,
    props?.default_generation_settings?.params?.n_ctx,
    props?.n_ctx,
  ];
  for (const c of candidates) {
    const n = toPositiveInt(c);
    if (n) return n;
  }
  return null;
}

/**
 * Context window the upstream server is actually running with, or null when the
 * server does not expose /props (i.e. it is not llama.cpp-shaped).
 * @param {string} baseUrl - provider base URL, with or without the /v1 suffix
 * @param {Record<string,string>} [headers] - auth headers to reuse
 */
export async function fetchRuntimeContextWindow(baseUrl, headers = {}) {
  const url = propsUrlFor(baseUrl);
  if (!url) return null;

  const cached = cache.get(url);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  let value = null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      value = readContextWindow(await response.json());
    }
  } catch {
    value = null;
  }

  cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
