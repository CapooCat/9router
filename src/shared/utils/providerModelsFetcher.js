// Fetch and cache suggested models for providers that expose a public models API
// Fetches via backend proxy to avoid CORS issues

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map(); // key: fetcher.url → { data, expiresAt }

// Longer than the route's own upstream timeout so the server's error message wins when it can produce one.
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fetch suggested models for a provider using its modelsFetcher config.
 * Results are cached in-memory for CACHE_TTL_MS.
 * @param {{ url: string, type: string }} fetcher
 * @returns {Promise<Array<{ id: string, name: string, contextLength?: number }>>}
 */
export async function fetchSuggestedModels(fetcher) {
  if (!fetcher?.url || !fetcher?.type) return [];

  const cached = cache.get(fetcher.url);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const params = new URLSearchParams({ url: fetcher.url, type: fetcher.type });
    const res = await fetch(`/api/providers/suggested-models?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = json.data ?? [];
    cache.set(fetcher.url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch {
    return [];
  }
}

/**
 * Fetch models from each connection's provider endpoint and merge them.
 * @throws when every connection request fails.
 */
export async function fetchModelsFromConnections(connections) {
  // Upstreams disagree on the id/name field, so collapse them into { id, name } and drop duplicates.
  function normalizeFetchedModels(rawModels) {
    const modelsById = new Map();
    for (const model of rawModels) {
      const id = model?.id || model?.model || model?.name;
      if (!id || modelsById.has(id)) continue;
      modelsById.set(id, { id, name: model.name || model.display_name || model.displayName || id });
    }
    return [...modelsById.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const results = await Promise.all(
    connections.map(async (connection) => {
      try {
        const response = await fetch(`/api/providers/${connection.id}/models`, {
          cache: "no-store",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const data = await response.json().catch(() => ({}));
        return { ok: response.ok, data };
      } catch (error) {
        const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
        return { ok: false, data: { error: timedOut ? "Timed out while fetching models" : error.message } };
      }
    }),
  );

  const successfulResults = results.filter((result) => result.ok);
  if (successfulResults.length === 0) {
    throw new Error(results.find((result) => result.data?.error)?.data?.error || "Failed to fetch models");
  }

  return normalizeFetchedModels(successfulResults.flatMap((result) => result.data.models || []));
}
