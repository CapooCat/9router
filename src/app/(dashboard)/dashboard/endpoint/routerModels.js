// Data layer for the "Browse Models" modal.
// No React here — mergeModelLists() is pure and unit-tested.

/**
 * Every OpenAI-shaped model-list endpoint the router serves.
 * The kind slugs mirror KIND_SLUG_MAP in src/app/api/v1/models/[kind]/route.js.
 * Deliberately excluded: /v1beta/models (Gemini re-projection of the same catalog),
 * /v1/models/info (single-model lookup) and /api/tags (hardcoded Ollama stub).
 */
export const MODEL_SOURCES = [
  { kind: "llm", label: "LLM", path: "/v1/models" },
  { kind: "embedding", label: "Embedding", path: "/v1/models/embedding" },
  { kind: "image", label: "Image", path: "/v1/models/image" },
  { kind: "imageToText", label: "Image to Text", path: "/v1/models/image-to-text" },
  { kind: "tts", label: "TTS", path: "/v1/models/tts" },
  { kind: "stt", label: "STT", path: "/v1/models/stt" },
  { kind: "web", label: "Web", path: "/v1/models/web" },
];

/** Endpoints worth knowing about but not mergeable into one list. */
export const RELATED_ENDPOINTS = [
  { path: "/v1beta/models", note: "Gemini shape" },
  { path: "/v1/models/info?id=provider/model", note: "single-model metadata" },
];

export const KIND_LABELS = {
  ...Object.fromEntries(MODEL_SOURCES.map((s) => [s.kind, s.label])),
  webSearch: "Web Search",
  webFetch: "Web Fetch",
};

function sortKey(model) {
  return `${model.kind}:${model.id}`;
}

/**
 * Fold the per-source payloads into one deduped, sorted list.
 * `results` is [{ source, data }] — a source whose fetch failed simply isn't in it.
 */
export function mergeModelLists(results) {
  const byKey = new Map();

  for (const result of results || []) {
    const sourceKind = result?.source?.kind;
    const entries = result?.data?.data;
    if (!sourceKind || !Array.isArray(entries)) continue;

    for (const entry of entries) {
      if (!entry?.id) continue;
      // The base /v1/models list already tags its virtual entries as
      // webSearch/webFetch — that is more specific than the source kind.
      const kind = entry.kind || sourceKind;
      const key = `${kind}:${entry.id}`;
      if (byKey.has(key)) continue;

      byKey.set(key, {
        id: entry.id,
        kind,
        owned_by: entry.owned_by || entry.id.split("/")[0] || "",
        capabilities: entry.capabilities || null,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Count models per kind, in MODEL_SOURCES order with any extra kinds appended. */
export function countByKind(models) {
  const counts = new Map();
  for (const model of models) counts.set(model.kind, (counts.get(model.kind) || 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: KIND_LABELS[kind] || kind, count }))
    .sort((a, b) => b.count - a.count);
}

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Fetch every source in parallel from the current origin.
 * allSettled, not all: one dead endpoint must not blank the whole modal.
 *
 * No x-9r-internal-models-fetch header is sent, so the live per-provider
 * resolvers do run — slower on a box with many connections, but it shows what
 * the router actually serves rather than the static catalog.
 */
export async function fetchRouterModels({ apiKey, signal } = {}) {
  const headers = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const settled = await Promise.allSettled(
    MODEL_SOURCES.map(async (source) => {
      const started = now();
      const res = await fetch(source.path, { headers, signal, cache: "no-store" });
      const ms = Math.round(now() - started);
      if (!res.ok) {
        const error = new Error(`HTTP ${res.status}`);
        error.ms = ms;
        throw error;
      }
      return { source, data: await res.json(), ms };
    })
  );

  const ok = [];
  const sources = settled.map((result, index) => {
    const source = MODEL_SOURCES[index];
    if (result.status !== "fulfilled") {
      return {
        ...source,
        ok: false,
        count: 0,
        ms: result.reason?.ms ?? null,
        error: result.reason?.message || "Request failed",
      };
    }
    ok.push(result.value);
    return {
      ...source,
      ok: true,
      count: result.value.data?.data?.length || 0,
      ms: result.value.ms,
      error: null,
    };
  });

  return { models: mergeModelLists(ok), sources };
}
