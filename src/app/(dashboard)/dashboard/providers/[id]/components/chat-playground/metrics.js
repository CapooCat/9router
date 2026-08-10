// Pure helpers for the provider chat playground.
// No React, no fetch — everything here is directly unit-testable.

// Re-exported so playground components keep a single import surface; the router
// models modal on /dashboard/endpoint uses the shared copy too.
export { formatTokens } from "@/shared/utils/formatTokens";

/** Coerce an OpenAI content value (string | array of parts | null) to plain text. */
export function textValue(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("");
  }
  if (value && typeof value === "object" && typeof value.text === "string") return value.text;
  return "";
}

/** Rough token count used when the provider reports no usage. Skews low for CJK. */
export function estimateTokens(text) {
  const len = textValue(text).length;
  if (!len) return 0;
  return Math.max(1, Math.ceil(len / 4));
}

/**
 * Pull the visible + reasoning deltas out of one stream chunk.
 * Shapes seen in the wild: OpenAI delta, non-stream message, Responses output_text, bare text.
 */
export function readDelta(chunk) {
  if (!chunk || typeof chunk !== "object") return { content: "", reasoning: "" };
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};

  const content = [delta.content, choice?.message?.content, chunk.output_text, chunk.text]
    .map(textValue)
    .find(Boolean) || "";

  const reasoning = [
    delta.reasoning_content,
    delta.reasoning,
    choice?.message?.reasoning_content,
    chunk.reasoning_content,
  ]
    .map(textValue)
    .find(Boolean) || "";

  return { content, reasoning };
}

const THINK_OPEN = /<think(?:ing)?>/i;
const THINK_CLOSE = /<\/think(?:ing)?>/i;

/**
 * Split inline <think>...</think> blocks out of visible content.
 * Some models emit chain-of-thought as tags in the content stream instead of a reasoning field;
 * an unclosed tag means the block is still arriving, so everything after it counts as reasoning.
 */
export function splitInlineThinking(text) {
  if (!text || !THINK_OPEN.test(text)) return { content: text || "", reasoning: "" };

  let content = "";
  let reasoning = "";
  let rest = text;

  while (rest) {
    const open = rest.match(THINK_OPEN);
    if (!open) {
      content += rest;
      break;
    }
    content += rest.slice(0, open.index);
    rest = rest.slice(open.index + open[0].length);

    const close = rest.match(THINK_CLOSE);
    if (!close) {
      reasoning += rest;
      break;
    }
    reasoning += rest.slice(0, close.index);
    rest = rest.slice(close.index + close[0].length);
  }

  return { content, reasoning };
}

/** Merge a provider's reasoning field with any inline <think> block found in the content. */
export function mergeThinking(content, reasoning = "") {
  const split = splitInlineThinking(content);
  return { text: split.content, reasoning: `${reasoning}${split.reasoning}` };
}

/**
 * Normalize a usage payload across OpenAI / Claude / Gemini field names.
 * Mirrors extractUsageFromResponse() in open-sse/handlers/chatCore/requestDetail.js —
 * kept as a client-side copy so no server module is pulled into the bundle.
 * Returns null when the chunk carries no usable usage.
 */
export function readUsage(chunk) {
  if (!chunk || typeof chunk !== "object") return null;
  const u = chunk.usage || chunk.usageMetadata || null;
  if (!u || typeof u !== "object") return null;

  const prompt = u.prompt_tokens ?? u.input_tokens ?? u.promptTokenCount;
  const completion = u.completion_tokens ?? u.output_tokens ?? u.candidatesTokenCount;

  if (prompt == null && completion == null) return null;
  return {
    prompt_tokens: Number(prompt) || 0,
    completion_tokens: Number(completion) || 0,
  };
}

/**
 * Turn raw stream timings into the numbers shown under an assistant message.
 * Generation speed excludes TTFT on purpose — that is the standard "output tok/s",
 * so a provider that is slow to connect does not read as slow to generate.
 */
export function computeMetrics({ t0, tFirst, tEnd, usage, text = "", reasoning = "" }) {
  const end = tEnd ?? t0;
  const first = tFirst ?? end;
  const totalMs = Math.max(0, Math.round(end - t0));
  const ttftMs = Math.max(0, Math.round(first - t0));
  const genMs = Math.max(1, end - first);

  const exact = Number(usage?.completion_tokens) > 0;
  const outTokens = exact
    ? Number(usage.completion_tokens)
    : estimateTokens(`${textValue(text)}${textValue(reasoning)}`);
  const inTokens = Number(usage?.prompt_tokens) || 0;

  return {
    ttftMs,
    totalMs,
    inTokens,
    outTokens,
    exact,
    tps: outTokens > 0 ? outTokens / (genMs / 1000) : 0,
  };
}

/** ms → "820ms" / "6.7s" */
export function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "—";
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(1)}s`;
}
