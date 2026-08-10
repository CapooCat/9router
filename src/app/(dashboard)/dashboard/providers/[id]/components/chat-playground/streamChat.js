import { mergeThinking, readDelta, readUsage } from "./metrics";

const CHAT_ENDPOINT = "/api/v1/chat/completions";

function now() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Pull a human-readable message out of an error body, same order as api/models/test/ping.js. */
function extractErrorMessage(parsed, rawText, status) {
  const detail =
    parsed?.error?.message || parsed?.error || parsed?.msg || parsed?.message || rawText;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail || "");
  return `HTTP ${status}${text ? `: ${text.slice(0, 400)}` : ""}`;
}

/**
 * POST one chat completion and consume its SSE stream.
 * Framework-free on purpose: no React, no shared state — the caller owns both.
 *
 * Resolves to { text, reasoning, usage, t0, tFirst, tEnd, aborted }.
 * Throws only on a non-OK response; the thrown Error carries `.status`.
 */
export async function streamChat({ apiKey, body, signal, onDelta, url = CHAT_ENDPOINT }) {
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const t0 = now();
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    let parsed = null;
    try { parsed = rawText ? JSON.parse(rawText) : null; } catch {}
    const error = new Error(extractErrorMessage(parsed, rawText, res.status));
    error.status = res.status;
    error.raw = rawText;
    throw error;
  }

  let text = "";
  let reasoning = "";
  let usage = null;
  let tFirst = null;
  let aborted = false;

  const reader = res.body?.getReader();

  // No readable body (some proxies buffer): fall back to a single JSON payload.
  if (!reader) {
    const data = await res.json().catch(() => ({}));
    const delta = readDelta(data);
    const merged = mergeThinking(delta.content, delta.reasoning);
    usage = readUsage(data);
    const tEnd = now();
    return { ...merged, usage, t0, tFirst: tEnd, tEnd, aborted };
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        let chunk;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue; // malformed frame — ignore, the stream may still recover
        }

        // Usage normally rides the final chunk, which has empty choices.
        const chunkUsage = readUsage(chunk);
        if (chunkUsage) usage = chunkUsage;

        const delta = readDelta(chunk);
        if (!delta.content && !delta.reasoning) continue;

        if (tFirst === null) tFirst = now();
        text += delta.content;
        reasoning += delta.reasoning;
        onDelta?.(mergeThinking(text, reasoning));
      }
    }
  } catch (error) {
    if (error?.name !== "AbortError") throw error;
    aborted = true;
  }

  return { ...mergeThinking(text, reasoning), usage, t0, tFirst, tEnd: now(), aborted };
}
