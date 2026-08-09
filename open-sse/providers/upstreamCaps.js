// Per-model limits advertised by OpenAI-compatible upstreams.
//
// getCapabilitiesForModel() only knows models it has a pattern or an exact entry
// for, so any self-hosted / unknown model id falls through to
// DEFAULT_CAPABILITIES (200k context). Custom OpenAI-compatible servers usually
// DO state their real limits in /v1/models — just never under the same key.
// There is no standard: OpenAI's own /v1/models carries no limits at all, so
// every gateway and inference server invented its own field.
//
// These helpers return ONLY what the upstream actually stated, so callers can
// merge them over the pattern-matched defaults without clobbering known values.
//
// ── ADDING A KEY ─────────────────────────────────────────────────────
// Append to CONTEXT_READERS / MAX_OUTPUT_READERS below. Order is trust order:
// what the server is ACTUALLY serving beats what the model card theoretically
// supports (a 262k-context model launched with `-c 8192` is an 8192 model).
// A key that no upstream sends simply never matches — the cost of a wrong guess
// is zero, the cost of a missing key is a silent fallback to the 200k floor.

// Nothing real exceeds this; anything larger is a misread field (a byte count,
// a parameter count) rather than a token limit.
const MAX_PLAUSIBLE_TOKENS = 100_000_000;

function toPositiveInt(value) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_PLAUSIBLE_TOKENS) return null;
  return Math.floor(n);
}

/**
 * Ollama's /api/show nests the context under an architecture-prefixed key:
 *   model_info: { "qwen3.context_length": 262144, "qwen3.embedding_length": 2048 }
 * The architecture varies per model, so match on the suffix instead.
 */
function archPrefixedContextLength(modelInfo) {
  if (!modelInfo || typeof modelInfo !== "object") return null;
  for (const [key, value] of Object.entries(modelInfo)) {
    if (!key.endsWith(".context_length")) continue;
    const n = toPositiveInt(value);
    if (n) return n;
  }
  return null;
}

// Context-window readers, most trustworthy first. Each returns a raw candidate;
// toPositiveInt() decides whether it is usable.
const CONTEXT_READERS = [
  // ── What the server is currently serving (beats any advertised maximum) ──
  (e) => e.loaded_context_length,          // LM Studio /api/v0/models
  (e) => e.meta?.n_ctx,                    // llama.cpp, when present
  (e) => e.max_model_len,                  // vLLM, SGLang
  (e) => e.max_total_tokens,               // HF TGI /info

  // ── Advertised per-model limits ──
  (e) => e.context_length,                 // OpenRouter, Together, Fireworks, DeepInfra
  (e) => e.contextLength,                  // camelCase gateways, 9router's own shape
  (e) => e.context_window,                 // Groq
  (e) => e.contextWindow,
  (e) => e.context_size,                   // Novita, assorted proxies
  (e) => e.max_context_length,             // Mistral, LM Studio, KoboldCPP
  (e) => e.maxContextLength,
  (e) => e.max_input_tokens,               // TGI, LiteLLM
  (e) => e.maxInputTokens,
  (e) => e.input_token_limit,
  (e) => e.inputTokenLimit,                // Google Gemini /v1beta/models
  (e) => e.max_prompt_tokens,
  (e) => e.max_prompt_length,
  (e) => e.max_sequence_length,            // some HF-derived servers
  (e) => e.max_seq_len,

  // ── Nested blocks ──
  (e) => e.top_provider?.context_length,   // OpenRouter per-upstream block
  (e) => e.limit?.context,                 // models.dev-shaped payloads
  (e) => e.limits?.context,
  (e) => e.model_info?.max_input_tokens,   // LiteLLM /model/info
  (e) => e.model_info?.context_length,
  (e) => archPrefixedContextLength(e.model_info), // Ollama /api/show
  (e) => e.details?.context_length,        // Ollama details block
  (e) => e.capabilities?.contextWindow,    // another 9router instance upstream
  (e) => e.spec?.context_length,
  (e) => e.config?.max_position_embeddings, // raw HF config passthrough
  (e) => e.config?.n_positions,

  // ── Weakest: the model's TRAINING context, not the served one ──
  // llama.cpp reports this even when launched with a much smaller `-c`; the
  // real value comes from /props and is applied by mergeUpstreamCaps().
  (e) => e.meta?.n_ctx_train,
];

// Max-output readers, most trustworthy first.
//
// Deliberately NOT read: a bare top-level `max_tokens`. It means the OUTPUT cap
// in Anthropic-shaped payloads but the CONTEXT window in several model catalogs
// (DeepInfra, older Anyscale), and guessing wrong in either direction is worse
// than falling back to the pattern-matched default. `model_info.max_tokens` IS
// read — LiteLLM defines that one unambiguously as output.
const MAX_OUTPUT_READERS = [
  (e) => e.max_output_tokens,
  (e) => e.maxOutputTokens,
  (e) => e.max_completion_tokens,          // Groq
  (e) => e.maxCompletionTokens,
  (e) => e.output_token_limit,
  (e) => e.outputTokenLimit,               // Google Gemini /v1beta/models
  (e) => e.max_response_tokens,
  (e) => e.max_output,
  (e) => e.maxOutput,

  // ── Nested blocks ──
  (e) => e.top_provider?.max_completion_tokens, // OpenRouter
  (e) => e.limit?.output,                  // models.dev-shaped payloads
  (e) => e.limits?.output,
  (e) => e.model_info?.max_output_tokens,  // LiteLLM /model/info
  (e) => e.model_info?.max_tokens,         // LiteLLM: output, not context
  (e) => e.capabilities?.maxOutput,        // another 9router instance upstream
  (e) => e.spec?.max_output_tokens,

  // llama.cpp's default `-n`, usually -1 (unlimited) → rejected as non-positive.
  (e) => e.meta?.n_predict,
];

// Run readers in order, first usable value wins. A reader that throws on an
// oddly-shaped entry is treated as a miss — callers feed us unvalidated JSON.
function readFirst(readers, entry) {
  for (const read of readers) {
    let raw;
    try {
      raw = read(entry);
    } catch {
      continue;
    }
    const n = toPositiveInt(raw);
    if (n) return n;
  }
  return null;
}

/** Context window stated by an upstream /v1/models entry, or null. */
export function contextWindowFromUpstreamModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  return readFirst(CONTEXT_READERS, entry);
}

/** Max output tokens stated by an upstream /v1/models entry, or null. */
export function maxOutputFromUpstreamModel(entry) {
  if (!entry || typeof entry !== "object") return null;
  return readFirst(MAX_OUTPUT_READERS, entry);
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
