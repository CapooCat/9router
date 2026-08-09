import { describe, it, expect } from "vitest";
import {
  contextWindowFromUpstreamModel,
  maxOutputFromUpstreamModel,
  mergeUpstreamCaps,
} from "../../open-sse/providers/upstreamCaps.js";
import { DEFAULT_CAPABILITIES } from "../../open-sse/providers/capabilities.js";

describe("contextWindowFromUpstreamModel", () => {
  it("reads llama.cpp's meta.n_ctx_train", () => {
    const entry = {
      id: "Qwen3-30B-A3B",
      object: "model",
      owned_by: "llamacpp",
      meta: { n_vocab: 151936, n_ctx_train: 262144, n_embd: 2048 },
    };
    expect(contextWindowFromUpstreamModel(entry)).toBe(262144);
  });

  it("prefers meta.n_ctx over meta.n_ctx_train", () => {
    expect(contextWindowFromUpstreamModel({ meta: { n_ctx: 32768, n_ctx_train: 262144 } })).toBe(32768);
  });

  it("reads vLLM's max_model_len", () => {
    expect(contextWindowFromUpstreamModel({ id: "m", max_model_len: 131072 })).toBe(131072);
  });

  it("reads OpenRouter-style context_length and top_provider", () => {
    expect(contextWindowFromUpstreamModel({ context_length: 1000000 })).toBe(1000000);
    expect(contextWindowFromUpstreamModel({ top_provider: { context_length: 400000 } })).toBe(400000);
  });

  it("accepts numeric strings", () => {
    expect(contextWindowFromUpstreamModel({ context_length: "8192" })).toBe(8192);
  });

  it("returns null when the upstream advertises nothing usable", () => {
    expect(contextWindowFromUpstreamModel({ id: "m", object: "model" })).toBeNull();
    expect(contextWindowFromUpstreamModel({ context_length: 0 })).toBeNull();
    expect(contextWindowFromUpstreamModel({ context_length: -1 })).toBeNull();
    expect(contextWindowFromUpstreamModel({ context_length: "n/a" })).toBeNull();
    expect(contextWindowFromUpstreamModel(null)).toBeNull();
  });
});

describe("maxOutputFromUpstreamModel", () => {
  it("reads the common output-limit keys", () => {
    expect(maxOutputFromUpstreamModel({ max_output_tokens: 8192 })).toBe(8192);
    expect(maxOutputFromUpstreamModel({ limit: { output: 4096 } })).toBe(4096);
    expect(maxOutputFromUpstreamModel({ top_provider: { max_completion_tokens: 16384 } })).toBe(16384);
  });

  it("returns null when absent", () => {
    expect(maxOutputFromUpstreamModel({ id: "m" })).toBeNull();
  });
});

describe("mergeUpstreamCaps", () => {
  const base = { ...DEFAULT_CAPABILITIES };

  it("overrides the 200k default floor with what the upstream advertised", () => {
    expect(base.contextWindow).toBe(200000);
    const merged = mergeUpstreamCaps(base, { max_model_len: 131072 });
    expect(merged.contextWindow).toBe(131072);
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
