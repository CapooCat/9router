// Request path for llama.cpp behind a compatible connection: images must reach
// llama-server when it runs with --mmproj, and thinking params must survive when
// its chat template can reason — even for an `--alias` name no pattern knows.
// The real capability + modality modules run; only the upstream call is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLAIN_TEMPLATE, startFakeLlamaServer } from "./llamacppFakeServer.mjs";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(),
}));

vi.mock("../../open-sse/executors/index.js", () => ({
  getExecutor: vi.fn(() => ({
    execute: executeMock,
    refreshCredentials: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock("../../open-sse/utils/requestLogger.js", () => ({
  createRequestLogger: vi.fn(async () => ({
    logClientRawRequest: vi.fn(),
    logRawRequest: vi.fn(),
    logTargetRequest: vi.fn(),
    logError: vi.fn(),
  })),
}));

vi.mock("../../open-sse/utils/streamHandler.js", () => ({
  createStreamController: vi.fn(() => ({
    signal: undefined,
    handleComplete: vi.fn(),
    handleError: vi.fn(),
  })),
}));

vi.mock("@/lib/usageDb.js", () => ({
  trackPendingRequest: vi.fn(),
  appendRequestLog: vi.fn(() => Promise.resolve()),
  saveRequestDetail: vi.fn(() => Promise.resolve()),
}));

const IMAGE = { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } };

const servers = [];
afterEach(() => {
  while (servers.length) servers.pop().close();
});

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockRejectedValue(new Error("stop after capture"));
});

async function upstreamBodyFor(provider, serverOpts) {
  const server = await startFakeLlamaServer(serverOpts);
  servers.push(server);
  const body = {
    model: serverOpts.modelId,
    stream: false,
    reasoning_effort: "high",
    messages: [{ role: "user", content: [{ type: "text", text: "What is in this image?" }, IMAGE] }],
  };
  const { handleChatCore } = await import("../../open-sse/handlers/chatCore.js");
  await handleChatCore({
    body,
    modelInfo: { provider, model: serverOpts.modelId },
    credentials: { apiKey: "sk-local", providerSpecificData: { baseUrl: server.baseUrl } },
    clientRawRequest: { endpoint: "/v1/chat/completions", body, headers: { "content-type": "application/json" } },
    connectionId: provider,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), line: vi.fn() },
  });
  expect(executeMock).toHaveBeenCalledTimes(1);
  return executeMock.mock.calls[0][0].body;
}

const partTypes = (sent) => sent.messages.at(-1).content.map((p) => p.type);

describe("llama.cpp behind a compatible connection — request path", () => {
  it("forwards the image and the thinking ask to a vision + thinking server", async () => {
    const sent = await upstreamBodyFor("openai-compatible-llama-rt", { modelId: "local-mm-think" });
    expect(partTypes(sent)).toContain("image_url");
    expect(sent.reasoning_effort).toBe("high");
  });

  it("still strips the image when the server has no mmproj", async () => {
    const sent = await upstreamBodyFor("openai-compatible-llama-rt-text", {
      modelId: "local-text",
      vision: false,
      template: PLAIN_TEMPLATE,
      templateCaps: { supports_tools: true },
    });
    expect(partTypes(sent)).not.toContain("image_url");
    expect(sent.reasoning_effort).toBeUndefined();
  });
});
