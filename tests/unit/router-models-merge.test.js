import { describe, expect, it } from "vitest";
import {
  countByKind,
  mergeModelLists,
  MODEL_SOURCES,
} from "../../src/app/(dashboard)/dashboard/endpoint/routerModels.js";

const src = (kind) => MODEL_SOURCES.find((s) => s.kind === kind);

const listResult = (kind, ids) => ({
  source: src(kind),
  data: { object: "list", data: ids.map((id) => (typeof id === "string" ? { id } : id)) },
});

describe("MODEL_SOURCES", () => {
  it("covers the base list plus every kind slug the router accepts", () => {
    expect(MODEL_SOURCES.map((s) => s.path)).toEqual([
      "/v1/models",
      "/v1/models/embedding",
      "/v1/models/image",
      "/v1/models/image-to-text",
      "/v1/models/tts",
      "/v1/models/stt",
      "/v1/models/web",
    ]);
  });
});

describe("mergeModelLists", () => {
  it("tags each model with the kind of the source it came from", () => {
    const merged = mergeModelLists([
      listResult("llm", ["anthropic/claude-sonnet-5"]),
      listResult("embedding", ["openai/text-embedding-3-large"]),
    ]);
    expect(merged.map((m) => [m.id, m.kind])).toEqual([
      ["openai/text-embedding-3-large", "embedding"],
      ["anthropic/claude-sonnet-5", "llm"],
    ]);
  });

  it("prefers the model's own kind over the source kind", () => {
    // /v1/models emits webSearch/webFetch entries inside the LLM list.
    const merged = mergeModelLists([
      listResult("llm", [{ id: "exa/search", kind: "webSearch" }]),
    ]);
    expect(merged[0].kind).toBe("webSearch");
  });

  it("dedupes a model served by both the base list and its kind endpoint", () => {
    const merged = mergeModelLists([
      listResult("llm", [{ id: "exa/search", kind: "webSearch" }]),
      listResult("web", [{ id: "exa/search", kind: "webSearch" }]),
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps the same id under two different kinds", () => {
    const merged = mergeModelLists([
      listResult("llm", ["google/gemini-2.5-pro"]),
      listResult("stt", ["google/gemini-2.5-pro"]),
    ]);
    expect(merged.map((m) => m.kind).sort()).toEqual(["llm", "stt"]);
  });

  it("derives owned_by from the id prefix when absent, and keeps it when given", () => {
    const merged = mergeModelLists([
      listResult("llm", ["anthropic/claude-sonnet-5", { id: "solo", owned_by: "custom" }]),
    ]);
    expect(merged.find((m) => m.id === "anthropic/claude-sonnet-5").owned_by).toBe("anthropic");
    expect(merged.find((m) => m.id === "solo").owned_by).toBe("custom");
  });

  it("carries capabilities through untouched", () => {
    const caps = { vision: true, reasoning: true, contextWindow: 1000000, maxOutput: 128000 };
    const merged = mergeModelLists([
      listResult("llm", [{ id: "anthropic/claude-opus-5", capabilities: caps }]),
    ]);
    expect(merged[0].capabilities).toEqual(caps);
    expect(mergeModelLists([listResult("llm", ["x/y"])])[0].capabilities).toBeNull();
  });

  it("ignores malformed sources instead of throwing", () => {
    const merged = mergeModelLists([
      null,
      { source: src("llm"), data: null },
      { source: src("llm"), data: { data: "not-an-array" } },
      { source: undefined, data: { data: [{ id: "orphan" }] } },
      listResult("llm", [{ noId: true }, "real/model"]),
    ]);
    expect(merged.map((m) => m.id)).toEqual(["real/model"]);
  });

  it("returns an empty list for no input", () => {
    expect(mergeModelLists([])).toEqual([]);
    expect(mergeModelLists(undefined)).toEqual([]);
  });

  it("sorts by kind then id", () => {
    const merged = mergeModelLists([
      listResult("llm", ["z/model", "a/model"]),
      listResult("embedding", ["m/embed"]),
    ]);
    expect(merged.map((m) => `${m.kind}:${m.id}`)).toEqual([
      "embedding:m/embed",
      "llm:a/model",
      "llm:z/model",
    ]);
  });
});

describe("countByKind", () => {
  it("counts per kind, biggest first, with display labels", () => {
    const counts = countByKind([
      { id: "a", kind: "llm" },
      { id: "b", kind: "llm" },
      { id: "c", kind: "embedding" },
      { id: "d", kind: "webSearch" },
    ]);
    expect(counts).toEqual([
      { kind: "llm", label: "LLM", count: 2 },
      { kind: "embedding", label: "Embedding", count: 1 },
      { kind: "webSearch", label: "Web Search", count: 1 },
    ]);
  });

  it("handles an empty list", () => {
    expect(countByKind([])).toEqual([]);
  });
});
