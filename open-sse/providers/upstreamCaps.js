// Per-model limits advertised by OpenAI-compatible upstreams.
//
// getCapabilitiesForModel() only knows models it has a pattern or an exact entry
// for, so any self-hosted / unknown model id falls through to
// DEFAULT_CAPABILITIES (200k context). Custom OpenAI-compatible servers usually
// DO state their real limits in /v1/models — just under different keys:
//
//   OpenRouter & most gateways : context_length, top_provider.context_length
//   vLLM / SGLang / TGI        : max_model_len, max_input_tokens
//   llama.cpp (llama-server)   : meta.n_ctx_train (training ctx — the running
//                                server's ctx comes from /props, see
//                                src/shared/utils/compatibleModelMeta.js)
//   models.dev-shaped payloads : limit.context / limit.output
//
// These helpers return ONLY what the upstream actually stated, so callers can
// merge them over the pattern-matched defaults without clobbering known values.

function toPositiveInt(value) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function firstPositive(candidates) {
  for (const c of candidates) {
    const n = toPositiveInt(c);
    if (n) return n;
  }
  return null;
}

/** Context window stated by an upstream /v1/models entry, or null. */
export function contextWindowFromUpstreamModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  return firstPositive([
    entry.context_length,
    entry.contextLength,
    entry.context_window,
    entry.contextWindow,
    entry.max_context_length,
    entry.max_input_tokens,
    entry.max_model_len,
    entry.top_provider?.context_length,
    entry.limit?.context,
    entry.capabilities?.contextWindow,
    entry.meta?.n_ctx,
    entry.meta?.n_ctx_train,
  ]);
}

/** Max output tokens stated by an upstream /v1/models entry, or null. */
export function maxOutputFromUpstreamModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  return firstPositive([
    entry.max_output_tokens,
    entry.maxOutputTokens,
    entry.max_completion_tokens,
    entry.maxOutput,
    entry.top_provider?.max_completion_tokens,
    entry.limit?.output,
    entry.capabilities?.maxOutput,
    entry.meta?.n_predict,
  ]);
}

/**
 * Capability deltas an upstream model entry justifies. Empty object when the
 * upstream said nothing — merging it is then a no-op.
 */
export function upstreamCapsOverrides(entry) {
  const overrides = {};
  const contextWindow = contextWindowFromUpstreamModel(entry);
  if (contextWindow) overrides.contextWindow = contextWindow;
  const maxOutput = maxOutputFromUpstreamModel(entry);
  if (maxOutput) overrides.maxOutput = maxOutput;
  return overrides;
}

/** Clamp maxOutput to the context window — some servers report a larger one. */
export function mergeUpstreamCaps(baseCaps, entry, runtimeContextWindow = null) {
  const overrides = upstreamCapsOverrides(entry);
  const runtime = toPositiveInt(runtimeContextWindow);
  // The running server's ctx (llama.cpp /props) beats anything the model card
  // advertises — a model with 256k training ctx served with `-c 8192` is 8192.
  if (runtime) overrides.contextWindow = runtime;
  if (Object.keys(overrides).length === 0) return baseCaps;

  const merged = { ...baseCaps, ...overrides };
  if (merged.contextWindow && merged.maxOutput > merged.contextWindow) {
    merged.maxOutput = merged.contextWindow;
  }
  return merged;
}
