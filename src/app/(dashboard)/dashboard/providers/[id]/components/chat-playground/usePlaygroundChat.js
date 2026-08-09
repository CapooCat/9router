"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamChat } from "./streamChat";
import { computeMetrics, estimateTokens } from "./metrics";

let messageSeq = 0;
const nextId = () => `pg-${++messageSeq}`;

/**
 * All the state and orchestration behind the playground card.
 * The components above it stay presentational; streamChat below it stays framework-free.
 */
export function usePlaygroundChat({
  requestModel,
  systemPrompt = "",
  temperature = "",
  maxTokens = "",
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [lastUsage, setLastUsage] = useState(null);

  const abortRef = useRef(null);
  // Models whose upstream rejected stream_options — do not send it again this session.
  const noStreamOptionsRef = useRef(new Set());

  useEffect(() => {
    let alive = true;
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || "");
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchMessage = useCallback((id, patch) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const buildBody = useCallback((history, withStreamOptions) => {
    const body = {
      model: requestModel,
      messages: [
        ...(systemPrompt.trim() ? [{ role: "system", content: systemPrompt.trim() }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
    };
    if (withStreamOptions) body.stream_options = { include_usage: true };

    const temp = Number(temperature);
    if (temperature !== "" && Number.isFinite(temp)) body.temperature = temp;
    const max = Number(maxTokens);
    if (maxTokens !== "" && Number.isFinite(max) && max > 0) body.max_tokens = Math.floor(max);

    return body;
  }, [requestModel, systemPrompt, temperature, maxTokens]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || !requestModel) return;

    const userMessage = { id: nextId(), role: "user", content: text };
    const assistantId = nextId();
    const history = [...messages, userMessage];

    setMessages([...history, { id: assistantId, role: "assistant", content: "", reasoning: "" }]);
    setInput("");
    setStreaming(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const run = (withStreamOptions) => streamChat({
      apiKey,
      body: buildBody(history, withStreamOptions),
      signal: controller.signal,
      onDelta: ({ text: content, reasoning }) => patchMessage(assistantId, { content, reasoning }),
    });

    try {
      let result;
      const allowStreamOptions = !noStreamOptionsRef.current.has(requestModel);
      try {
        result = await run(allowStreamOptions);
      } catch (error) {
        // Some upstreams reject the unknown field outright — retry once without it.
        if (allowStreamOptions && error?.status === 400 && /stream_options/i.test(error.message || "")) {
          noStreamOptionsRef.current.add(requestModel);
          result = await run(false);
        } else {
          throw error;
        }
      }

      const metrics = computeMetrics({
        t0: result.t0,
        tFirst: result.tFirst,
        tEnd: result.tEnd,
        usage: result.usage,
        text: result.text,
        reasoning: result.reasoning,
      });
      if (result.usage) setLastUsage(result.usage);

      patchMessage(assistantId, {
        content: result.text,
        reasoning: result.reasoning,
        metrics,
        stopped: result.aborted,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        patchMessage(assistantId, { stopped: true });
      } else {
        patchMessage(assistantId, { error: error?.message || "Request failed" });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, requestModel, messages, apiKey, buildBody, patchMessage]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setLastUsage(null);
  }, []);

  // Prefer the provider's own numbers; fall back to a chars/4 estimate over the whole thread.
  const context = useMemo(() => {
    if (lastUsage) {
      return {
        used: (lastUsage.prompt_tokens || 0) + (lastUsage.completion_tokens || 0),
        estimated: false,
      };
    }
    const all = messages.map((m) => `${m.content || ""}${m.reasoning || ""}`).join("");
    return { used: estimateTokens(`${systemPrompt}${all}`), estimated: true };
  }, [lastUsage, messages, systemPrompt]);

  return { messages, input, setInput, send, stop, clear, streaming, context };
}
