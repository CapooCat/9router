import { describe, expect, it } from "vitest";
import {
  architectureFromCaps,
  comboCapsFromMembers,
  decorateModelEntry,
  MODEL_CREATED_AT,
  pricingBlockFromRates,
  supportedParametersFromCaps,
} from "open-sse/providers/modelCatalogEntry.js";
import { getCapabilitiesForModel } from "open-sse/providers/capabilities.js";
import { contextWindowFromUpstreamModel, maxOutputFromUpstreamModel } from "open-sse/providers/upstreamCaps.js";

const caps = (over = {}) => ({
  vision: false, pdf: false, audioInput: false, videoInput: false,
  imageOutput: false, audioOutput: false,
  search: false, tools: true, reasoning: false,
  contextWindow: 200000, maxOutput: 64000,
  ...over,
});

describe("decorateModelEntry", () => {
  it("emits every context-window key family a client may read", () => {
    const entry = decorateModelEntry({ id: "anthropic/claude-opus-5" }, caps({ contextWindow: 1000000, maxOutput: 128000 }));
    expect(entry.context_length).toBe(1000000);
    expect(entry.max_input_tokens).toBe(1000000);
    expect(entry.max_output_tokens).toBe(128000);
    expect(entry.max_completion_tokens).toBe(128000);
    expect(entry.top_provider).toEqual({ context_length: 1000000, max_completion_tokens: 128000, is_moderated: false });
    expect(entry.limit).toEqual({ context: 1000000, output: 128000 });
  });

  it("fills the OpenAI-required object/created fields", () => {
    const entry = decorateModelEntry({ id: "x/y" }, null);
    expect(entry.object).toBe("model");
    expect(entry.created).toBe(MODEL_CREATED_AT);
  });

  it("keeps an explicitly set object/created", () => {
    const entry = decorateModelEntry({ id: "x/y", object: "model", created: 42 }, null);
    expect(entry.created).toBe(42);
  });

  it("never advertises a maxOutput above the context window", () => {
    const entry = decorateModelEntry({ id: "tiny/model" }, caps({ contextWindow: 8192, maxOutput: 64000 }));
    expect(entry.max_output_tokens).toBe(8192);
    expect(entry.limit).toEqual({ context: 8192, output: 8192 });
  });

  it("leaves the 9router capabilities block untouched", () => {
    const original = caps({ vision: true });
    const entry = decorateModelEntry({ id: "x/y", capabilities: original }, original);
    expect(entry.capabilities).toBe(original);
  });

  it("omits limit keys for kinds with no capabilities (web search/fetch)", () => {
    const entry = decorateModelEntry({ id: "exa/search", kind: "webSearch" }, null);
    expect(entry.context_length).toBeUndefined();
    expect(entry.architecture).toBeUndefined();
    expect(entry.limit).toBeUndefined();
  });

  it("round-trips through our own upstream readers (9router → 9router)", () => {
    const entry = decorateModelEntry({ id: "z/model" }, caps({ contextWindow: 262144, maxOutput: 32768 }));
    expect(contextWindowFromUpstreamModel(entry)).toBe(262144);
    expect(maxOutputFromUpstreamModel(entry)).toBe(32768);
  });

  it("never emits a bare max_tokens — ambiguous between context and output", () => {
    const entry = decorateModelEntry({ id: "z/model" }, caps());
    expect(entry.max_tokens).toBeUndefined();
  });

  it("survives a non-object entry", () => {
    expect(decorateModelEntry(null, caps())).toBeNull();
  });
});

describe("architectureFromCaps", () => {
  it("describes a text-only model", () => {
    expect(architectureFromCaps(caps())).toMatchObject({
      modality: "text->text",
      input_modalities: ["text"],
      output_modalities: ["text"],
    });
  });

  it("describes a multimodal model in OpenRouter's notation", () => {
    const arch = architectureFromCaps(caps({ vision: true, pdf: true, audioInput: true, imageOutput: true }));
    expect(arch.input_modalities).toEqual(["text", "image", "audio", "file"]);
    expect(arch.output_modalities).toEqual(["text", "image"]);
    expect(arch.modality).toBe("text+image+audio+file->text+image");
  });
});

describe("supportedParametersFromCaps", () => {
  it("advertises tool and reasoning params only when supported", () => {
    const plain = supportedParametersFromCaps(caps({ tools: false }));
    expect(plain).not.toContain("tools");
    expect(plain).not.toContain("reasoning");
    const rich = supportedParametersFromCaps(caps({ reasoning: true }));
    expect(rich).toContain("tools");
    expect(rich).toContain("reasoning_effort");
  });
});

describe("pricingBlockFromRates", () => {
  it("converts $/1M rates to $/token decimal strings", () => {
    const block = pricingBlockFromRates({ input: 5, output: 25, cached: 0.5, cache_creation: 6.25, reasoning: 25 });
    expect(block.prompt).toBe("0.000005");
    expect(block.completion).toBe("0.000025");
    expect(block.input_cache_read).toBe("0.0000005");
    expect(block.input_cache_write).toBe("0.00000625");
  });

  it("returns null when nothing is known", () => {
    expect(pricingBlockFromRates(null)).toBeNull();
    expect(pricingBlockFromRates({})).toBeNull();
  });

  it("keeps a free model at zero rather than dropping the block", () => {
    expect(pricingBlockFromRates({ input: 0, output: 0 })).toMatchObject({ prompt: "0", completion: "0" });
  });
});

describe("comboCapsFromMembers", () => {
  it("takes the smallest window and the intersection of features", () => {
    const merged = comboCapsFromMembers([
      caps({ vision: true, reasoning: true, contextWindow: 1000000, maxOutput: 128000 }),
      caps({ vision: false, reasoning: true, contextWindow: 128000, maxOutput: 16384 }),
    ]);
    expect(merged.contextWindow).toBe(128000);
    expect(merged.maxOutput).toBe(16384);
    expect(merged.vision).toBe(false);
    expect(merged.reasoning).toBe(true);
  });

  it("drops thinkingFormat when members disagree", () => {
    const merged = comboCapsFromMembers([
      caps({ reasoning: true, thinkingFormat: "claude-adaptive" }),
      caps({ reasoning: true, thinkingFormat: "openai" }),
    ]);
    expect(merged.thinkingFormat).toBeNull();
  });

  it("keeps a single member's capabilities as-is", () => {
    const only = getCapabilitiesForModel("anthropic", "claude-opus-5");
    expect(comboCapsFromMembers([only, null])).toEqual(only);
  });

  it("returns null when no member resolved", () => {
    expect(comboCapsFromMembers([])).toBeNull();
    expect(comboCapsFromMembers([null, undefined])).toBeNull();
  });
});
