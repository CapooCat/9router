import { describe, it, expect } from "vitest";
import {
  contextWindowFromUpstreamModel,
  maxOutputFromUpstreamModel,
  upstreamCapsOverrides,
  mergeUpstreamCaps,
} from "../../open-sse/providers/upstreamCaps.js";
import { DEFAULT_CAPABILITIES } from "../../open-sse/providers/capabilities.js";

describe("contextWindowFromUpstreamModel", () => {
  // Real payload shapes, one per upstream family.
  const CASES = [
    ["llama.cpp /v1/models", { id: "m", owned_by: "llamacpp", meta: { n_vocab: 151936, n_ctx_train: 262144, n_embd: 2048 } }, 262144],
    ["llama.cpp with meta.n_ctx", { meta: { n_ctx: 32768, n_ctx_train: 262144 } }, 32768],
    ["vLLM / SGLang", { id: "m", max_model_len: 131072 }, 131072],
    ["HF TGI", { max_total_tokens: 32768 }, 32768],
    ["TGI max_input_tokens", { max_input_tokens: 30000 }, 30000],
    ["OpenRouter", { context_length: 1000000 }, 1000000],
    ["OpenRouter top_provider", { top_provider: { context_length: 400000 } }, 400000],
    ["Groq", { context_window: 131072 }, 131072],
    ["Mistral / KoboldCPP", { max_context_length: 32768 }, 32768],
    ["LM Studio loaded ctx", { loaded_context_length: 8192, max_context_length: 131072 }, 8192],
    ["Novita", { context_size: 65536 }, 65536],
    ["Gemini /v1beta/models", { inputTokenLimit: 1048576, outputTokenLimit: 8192 }, 1048576],
    ["LiteLLM /model/info", { model_info: { max_input_tokens: 200000, max_output_tokens: 8192 } }, 200000],
    ["Ollama /api/show", { model_info: { "qwen3.context_length": 262144, "qwen3.embedding_length": 2048 } }, 262144],
    ["Ollama details", { details: { context_length: 8192 } }, 8192],
    ["models.dev shape", { limit: { context: 272000, output: 128000 } }, 272000],
    ["raw HF config", { config: { max_position_embeddings: 32768 } }, 32768],
    ["9router self-fetch", { capabilities: { contextWindow: 1000000 } }, 1000000],
    ["camelCase gateway", { contextLength: 16384 }, 16384],
    ["max_seq_len", { max_seq_len: 4096 }, 4096],
  ];

  for (const [label, entry, expected] of CASES) {
    it(`reads ${label}`, () => {
      expect(contextWindowFromUpstreamModel(entry)).toBe(expected);
    });
  }

  it("prefers the served context over the advertised maximum", () => {
    // LM Studio reports both; the loaded one is what requests actually get.
    expect(contextWindowFromUpstreamModel({
      loaded_context_length: 8192,
      max_context_length: 131072,
      context_length: 131072,
    })).toBe(8192);
  });

  it("ranks meta.n_ctx_train last — it is the training ctx, not the served one", () => {
    expect(contextWindowFromUpstreamModel({
      max_model_len: 8192,
      meta: { n_ctx_train: 262144 },
    })).toBe(8192);
  });

  it("accepts numeric strings", () => {
    expect(contextWindowFromUpstreamModel({ context_length: "8192" })).toBe(8192);
  });

  it("skips a zero/negative key instead of letting it win the chain", () => {
    // llama.cpp emits 0 for unset fields — `??` chaining would stop there.
    expect(contextWindowFromUpstreamModel({ context_length: 0, max_model_len: 4096 })).toBe(4096);
    expect(contextWindowFromUpstreamModel({ context_length: -1, max_model_len: 4096 })).toBe(4096);
  });

  it("rejects implausible values (misread byte/param counts)", () => {
    expect(contextWindowFromUpstreamModel({ context_length: 30_000_000_000 })).toBeNull();
  });

  it("returns null when the upstream advertises nothing usable", () => {
    expect(contextWindowFromUpstreamModel({ id: "m", object: "model" })).toBeNull();
    expect(contextWindowFromUpstreamModel({ context_length: "n/a" })).toBeNull();
    expect(contextWindowFromUpstreamModel({ context_length: null })).toBeNull();
    expect(contextWindowFromUpstreamModel(null)).toBeNull();
    expect(contextWindowFromUpstreamModel("gpt-4")).toBeNull();
  });

  it("ignores a bare top-level max_tokens — ambiguous across catalogs", () => {
    expect(contextWindowFromUpstreamModel({ max_tokens: 4096 })).toBeNull();
  });

  it("survives hostile shapes without throwing", () => {
    expect(contextWindowFromUpstreamModel({ meta: "not-an-object" })).toBeNull();
    expect(contextWindowFromUpstreamModel({ model_info: [] })).toBeNull();
    expect(contextWindowFromUpstreamModel({ limit: 5 })).toBeNull();
  });
});

describe("maxOutputFromUpstreamModel", () => {
  const CASES = [
    ["Groq", { max_completion_tokens: 32768 }, 32768],
    ["OpenRouter top_provider", { top_provider: { max_completion_tokens: 16384 } }, 16384],
    ["Gemini", { outputTokenLimit: 8192 }, 8192],
    ["models.dev shape", { limit: { output: 4096 } }, 4096],
    ["LiteLLM max_output_tokens", { model_info: { max_output_tokens: 8192 } }, 8192],
    ["LiteLLM max_tokens (output)", { model_info: { max_tokens: 4096 } }, 4096],
    ["normalized", { max_output_tokens: 65536 }, 65536],
    ["9router self-fetch", { capabilities: { maxOutput: 128000 } }, 128000],
  ];

  for (const [label, entry, expected] of CASES) {
    it(`reads ${label}`, () => {
      expect(maxOutputFromUpstreamModel(entry)).toBe(expected);
    });
  }

  it("ignores llama.cpp's unlimited n_predict sentinel", () => {
    expect(maxOutputFromUpstreamModel({ meta: { n_predict: -1 } })).toBeNull();
    expect(maxOutputFromUpstreamModel({ meta: { n_predict: 2048 } })).toBe(2048);
  });

  it("ignores a bare top-level max_tokens — ambiguous across catalogs", () => {
    expect(maxOutputFromUpstreamModel({ max_tokens: 4096 })).toBeNull();
  });

  it("returns null when absent", () => {
    expect(maxOutputFromUpstreamModel({ id: "m" })).toBeNull();
  });
});

describe("upstreamCapsOverrides", () => {
  it("states only what the upstream advertised", () => {
    expect(upstreamCapsOverrides({ context_length: 8192 })).toEqual({ contextWindow: 8192 });
    expect(upstreamCapsOverrides({ max_completion_tokens: 4096 })).toEqual({ maxOutput: 4096 });
    expect(upstreamCapsOverrides({ id: "m" })).toEqual({});
  });
});

describe("mergeUpstreamCaps", () => {
  const base = { ...DEFAULT_CAPABILITIES };

  it("overrides the 200k default floor with what the upstream advertised", () => {
    expect(base.contextWindow).toBe(200000);
    expect(mergeUpstreamCaps(base, { max_model_len: 131072 }).contextWindow).toBe(131072);
  });

  it("lets the running server's ctx win over the advertised training ctx", () => {
    const merged = mergeUpstreamCaps(base, { meta: { n_ctx_train: 262144 } }, 32768);
    expect(merged.contextWindow).toBe(32768);
  });

  it("clamps maxOutput to the context window", () => {
    const merged = mergeUpstreamCaps(base, { context_length: 8192 });
    expect(merged.contextWindow).toBe(8192);
    expect(merged.maxOutput).toBe(8192);
  });

  it("returns the base object untouched when nothing was advertised", () => {
    expect(mergeUpstreamCaps(base, { id: "m" })).toBe(base);
  });

  it("keeps non-limit capabilities from the base", () => {
    const visionBase = { ...DEFAULT_CAPABILITIES, vision: true, reasoning: true };
    const merged = mergeUpstreamCaps(visionBase, { context_length: 65536 });
    expect(merged).toMatchObject({ vision: true, reasoning: true, contextWindow: 65536 });
  });
});
