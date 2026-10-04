// [fork] Catalog + per-model capabilities of an OpenAI-/Anthropic-compatible
// connection, for /v1/models.
//
// Upstream's route only fetches compatible model IDS, and only when the list is
// otherwise empty. Self-hosted servers (llama.cpp, vLLM, LM Studio, …) run model
// ids getCapabilitiesForModel() has no pattern for, so their context window
// falls to the 200k floor and vision/reasoning to false. This fetches the
// catalog with the per-model data it carries, plus llama-server's /props (what
// it is really running: ctx, mmproj vision, thinking template), and records the
// server-stated features for the request path (providers/upstreamFeatures.js).
//
// Kept out of src/app/api/v1/models/route.js so upstream merges stay clean: the
// route calls resolveCompatibleCatalog() from one fork block, and its own
// fetchCompatibleModelIds() remains the fallback when this returns nothing.

import { getCapabilitiesForModel } from "../providers/capabilities.js";
import { capsFromServerProps, mergeUpstreamCaps, upstreamFeatureOverrides } from "../providers/upstreamCaps.js";
import { recordUpstreamFeatures } from "../providers/upstreamFeatures.js";
import { fetchServerProps } from "./serverProps.js";

const FETCH_TIMEOUT_MS = 5000;
// Must match route.js INTERNAL_MODELS_FETCH_HEADER: another 9router instance
// seeing it skips its own dynamic fetch, breaking cross-instance loops.
const INTERNAL_MODELS_FETCH_HEADER = "x-9r-internal-models-fetch";

const EMPTY_CATALOG = { ids: [], capsById: new Map() };

const isOpenAICompatible = (provider) => typeof provider === "string" && provider.startsWith("openai-compatible-");
const isAnthropicCompatible = (provider) => typeof provider === "string" && provider.startsWith("anthropic-compatible-");

const parseModelList = (data) => {
  if (Array.isArray(data)) return data;
  return data?.data || data?.models || data?.results || [];
};

// Same URL + auth shape as route.js fetchCompatibleModelIds().
function catalogRequest(connection, baseUrl) {
  let url = `${baseUrl}/models`;
  const headers = { "Content-Type": "application/json" };
  if (isOpenAICompatible(connection.provider)) {
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else if (isAnthropicCompatible(connection.provider)) {
    if (url.endsWith("/messages/models")) url = url.slice(0, -9);
    else if (url.endsWith("/messages")) url = `${url.slice(0, -9)}/models`;
    headers["x-api-key"] = connection.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers.Authorization = `Bearer ${connection.apiKey}`;
  } else {
    return null;
  }
  return { url, headers };
}

/**
 * @param {object} connection - provider connection ({ provider, apiKey, providerSpecificData.baseUrl })
 * @returns {Promise<{ ids: string[], capsById: Map<string, object> }>}
 */
export async function resolveCompatibleCatalog(connection) {
  if (!connection?.apiKey) return EMPTY_CATALOG;
  const baseUrl = typeof connection?.providerSpecificData?.baseUrl === "string"
    ? connection.providerSpecificData.baseUrl.trim().replace(/\/$/, "")
    : "";
  if (!baseUrl) return EMPTY_CATALOG;

  const request = catalogRequest(connection, baseUrl);
  if (!request) return EMPTY_CATALOG;
  const { url, headers } = request;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      method: "GET",
      headers: { ...headers, [INTERNAL_MODELS_FETCH_HEADER]: "1" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) return EMPTY_CATALOG;

    const rawModels = parseModelList(await response.json());

    const entries = [];
    const seen = new Set();
    for (const model of rawModels) {
      const modelId = model?.id || model?.name || model?.model;
      if (typeof modelId !== "string" || modelId.trim() === "") continue;
      if (seen.has(modelId)) continue;
      seen.add(modelId);
      entries.push({ modelId, model });
    }

    // llama.cpp advertises the TRAINING context in /v1/models and says nothing
    // about mmproj or the chat template; /props has what it is really running.
    // Router mode: the root /props is a placeholder and each LOADED model
    // answers for itself. Unloaded ones are skipped — asking would spawn them.
    const serverProps = await fetchServerProps(baseUrl, headers);
    const isRouter = serverProps?.role === "router";
    const runtimeById = new Map();
    await Promise.all(entries.map(async ({ modelId, model }) => {
      if (!isRouter) {
        runtimeById.set(modelId, capsFromServerProps(serverProps));
      } else if (model?.status?.value === "loaded") {
        runtimeById.set(modelId, capsFromServerProps(await fetchServerProps(baseUrl, headers, { model: modelId })));
      }
    }));

    const ids = [];
    const capsById = new Map();
    for (const { modelId, model } of entries) {
      const runtime = runtimeById.get(modelId) || null;
      ids.push(modelId);
      capsById.set(
        modelId,
        mergeUpstreamCaps(getCapabilitiesForModel(connection.provider, modelId), model, runtime),
      );
      // The request path resolves caps by provider + model — let it see what
      // this server stated, so images/thinking aren't stripped on the way out.
      const features = upstreamFeatureOverrides(model, runtime);
      if (Object.keys(features).length > 0) recordUpstreamFeatures(connection.provider, modelId, features);
    }
    return { ids, capsById };
  } catch {
    return EMPTY_CATALOG;
  }
}
