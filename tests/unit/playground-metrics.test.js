import { describe, expect, it } from "vitest";
import {
  computeMetrics,
  estimateTokens,
  formatDuration,
  formatTokens,
  readDelta,
  readUsage,
} from "../../src/app/(dashboard)/dashboard/providers/[id]/components/chat-playground/metrics.js";

describe("readDelta", () => {
  it("reads an OpenAI streaming delta", () => {
    expect(readDelta({ choices: [{ delta: { content: "hi" } }] })).toEqual({ content: "hi", reasoning: "" });
  });

  it("reads a non-stream message body", () => {
    expect(readDelta({ choices: [{ message: { content: "done" } }] }).content).toBe("done");
  });

  it("reads Responses-style output_text and bare text", () => {
    expect(readDelta({ output_text: "a" }).content).toBe("a");
    expect(readDelta({ text: "b" }).content).toBe("b");
  });

  it("separates reasoning from visible content", () => {
    const out = readDelta({ choices: [{ delta: { content: "x", reasoning_content: "why" } }] });
    expect(out).toEqual({ content: "x", reasoning: "why" });
  });

  it("flattens array content parts", () => {
    const out = readDelta({ choices: [{ delta: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }] });
    expect(out.content).toBe("ab");
  });

  it("returns empty strings for junk", () => {
    expect(readDelta(null)).toEqual({ content: "", reasoning: "" });
    expect(readDelta({ choices: [] })).toEqual({ content: "", reasoning: "" });
  });
});

describe("readUsage", () => {
  it("reads OpenAI field names", () => {
    expect(readUsage({ usage: { prompt_tokens: 12, completion_tokens: 30 } }))
      .toEqual({ prompt_tokens: 12, completion_tokens: 30 });
  });

  it("reads Claude field names", () => {
    expect(readUsage({ usage: { input_tokens: 5, output_tokens: 7 } }))
      .toEqual({ prompt_tokens: 5, completion_tokens: 7 });
  });

  it("reads Gemini usageMetadata", () => {
    expect(readUsage({ usageMetadata: { promptTokenCount: 9, candidatesTokenCount: 4 } }))
      .toEqual({ prompt_tokens: 9, completion_tokens: 4 });
  });

  it("returns null when there is nothing usable", () => {
    expect(readUsage({ choices: [] })).toBeNull();
    expect(readUsage({ usage: {} })).toBeNull();
    expect(readUsage(null)).toBeNull();
  });
});

describe("estimateTokens", () => {
  it("approximates four characters per token", () => {
    expect(estimateTokens("12345678")).toBe(2);
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
  });
});

describe("computeMetrics", () => {
  it("uses provider usage when present", () => {
    const m = computeMetrics({
      t0: 0, tFirst: 200, tEnd: 1200,
      usage: { prompt_tokens: 10, completion_tokens: 50 },
      text: "ignored because usage is authoritative",
    });
    expect(m.exact).toBe(true);
    expect(m.ttftMs).toBe(200);
    expect(m.totalMs).toBe(1200);
    expect(m.inTokens).toBe(10);
    expect(m.outTokens).toBe(50);
    expect(m.tps).toBeCloseTo(50); // 50 tokens over the 1000ms generation window
  });

  it("falls back to an estimate when the provider reports no usage", () => {
    const m = computeMetrics({ t0: 0, tFirst: 0, tEnd: 1000, usage: null, text: "x".repeat(40) });
    expect(m.exact).toBe(false);
    expect(m.outTokens).toBe(10);
    expect(m.inTokens).toBe(0);
  });

  it("counts reasoning tokens in the estimate", () => {
    const m = computeMetrics({ t0: 0, tFirst: 0, tEnd: 1000, text: "x".repeat(4), reasoning: "y".repeat(4) });
    expect(m.outTokens).toBe(2);
  });

  it("never divides by a zero-length generation window", () => {
    const m = computeMetrics({ t0: 0, tFirst: 500, tEnd: 500, usage: { completion_tokens: 3 } });
    expect(Number.isFinite(m.tps)).toBe(true);
    expect(m.tps).toBe(3000); // 3 tokens over the 1ms floor
  });

  it("survives a stream that produced no tokens at all", () => {
    const m = computeMetrics({ t0: 0, tFirst: null, tEnd: 800, usage: null, text: "" });
    expect(m.outTokens).toBe(0);
    expect(m.tps).toBe(0);
    expect(m.ttftMs).toBe(800);
  });
});

describe("formatTokens", () => {
  it("formats across magnitudes", () => {
    expect(formatTokens(948)).toBe("948");
    expect(formatTokens(12400)).toBe("12.4k");
    expect(formatTokens(200000)).toBe("200k");
    expect(formatTokens(1000000)).toBe("1M");
    expect(formatTokens(1048576)).toBe("1M");
  });

  it("renders a dash for missing values", () => {
    expect(formatTokens(0)).toBe("—");
    expect(formatTokens(undefined)).toBe("—");
    expect(formatTokens(NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("switches from ms to seconds at one second", () => {
    expect(formatDuration(240)).toBe("240ms");
    expect(formatDuration(6700)).toBe("6.7s");
    expect(formatDuration(-1)).toBe("—");
  });
});
