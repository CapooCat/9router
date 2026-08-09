"use client";

import { useState, useEffect, useCallback } from "react";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";

// Module cache: one /api/models + /v1/models fetch shared by every instance.
let cache = null; // { byFull, byId } | null
let inflight = null;

const EMPTY_MAPS = { byFull: {}, byId: {} };

function buildMaps(models, routerModels) {
  const byFull = {};
  const byId = {};
  for (const m of models || []) {
    if (!m.caps) continue;
    if (m.fullModel) byFull[m.fullModel] = m.caps;
    if (m.routedModel) byFull[m.routedModel] = m.caps;
    if (m.model) byId[m.model] = m.caps;
  }
  // /v1/models is the router's live catalog. It carries the limits a compatible
  // provider actually advertised — a self-hosted llama.cpp/vLLM model id matches
  // no capability pattern, so without this its context window reads as the 200k
  // DEFAULT_CAPABILITIES floor. /api/models cannot know: it serves static
  // AI_MODELS only. Live entries win on exact id; a bare id is only claimed when
  // free, so one provider's model cannot shadow a built-in of the same name.
  for (const m of routerModels || []) {
    const caps = m?.capabilities;
    if (!m?.id || !caps) continue;
    byFull[m.id] = caps;
    const slash = m.id.indexOf("/");
    const bare = slash > 0 ? m.id.slice(slash + 1) : m.id;
    if (!byId[bare]) byId[bare] = caps;
  }
  return { byFull, byId };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function loadModelCaps() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  // allSettled: /v1/models hits live upstreams and may fail or be slow — that
  // must not cost us the static caps, and vice versa.
  inflight = Promise.allSettled([fetchJson("/api/models"), fetchJson("/v1/models")])
    .then(([staticRes, liveRes]) => {
      const staticModels = staticRes.status === "fulfilled" ? staticRes.value?.models : null;
      const liveModels = liveRes.status === "fulfilled" ? liveRes.value?.data : null;
      // Both dead — keep cache null so a later mount can retry.
      if (!staticModels && !liveModels) return EMPTY_MAPS;
      cache = buildMaps(staticModels, liveModels);
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

// Resolve caps from a "provider/model" string or a bare model id.
function resolveCaps(byFull, byId, key) {
  if (!key) return null;
  if (byFull[key]) return byFull[key];
  const bare = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
  if (byId[bare]) return byId[bare];
  const provider = key.includes("/") ? key.slice(0, key.indexOf("/")) : null;
  const c = getCapabilitiesForModel(provider, bare);
  return {
    vision: c.vision,
    search: c.search,
    reasoning: c.reasoning,
    contextWindow: c.contextWindow,
    maxOutput: c.maxOutput,
  };
}

export function useModelCaps() {
  const [byFull, setByFull] = useState(() => cache?.byFull || {});
  const [byId, setById] = useState(() => cache?.byId || {});

  useEffect(() => {
    if (cache) {
      setByFull(cache.byFull);
      setById(cache.byId);
      return;
    }
    let alive = true;
    loadModelCaps().then((maps) => {
      if (alive) { setByFull(maps.byFull); setById(maps.byId); }
    });
    return () => { alive = false; };
  }, []);

  const getCaps = useCallback(
    (key) => resolveCaps(byFull, byId, key),
    [byFull, byId],
  );

  return { getCaps };
}
