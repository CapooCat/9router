// llama.cpp behind an OpenAI- / Anthropic-compatible connection: /v1/models must
// publish what llama-server says it can do (vision via mmproj, reasoning via the
// chat template), not only what the model id happens to pattern-match.
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAIN_TEMPLATE, startFakeLlamaServer } from "./llamacppFakeServer.mjs";

const db = vi.hoisted(() => ({
  getProviderConnections: vi.fn(),
  getCombos: vi.fn(async () => []),
  getCustomModels: vi.fn(async () => []),
  getModelAliases: vi.fn(async () => ({})),
}));

vi.mock("@/lib/localDb", () => db);
vi.mock("@/lib/disabledModelsDb", () => ({
  getDisabledModels: vi.fn(async () => ({})),
}));

const { buildModelsList } = await import("../../src/app/api/v1/models/route.js");

const servers = [];
afterEach(() => {
  while (servers.length) servers.pop().close();
});

async function publishedCaps(provider, serverOpts) {
  const server = await startFakeLlamaServer(serverOpts);
  servers.push(server);
  db.getProviderConnections.mockResolvedValue([{
    id: provider,
    provider,
    isActive: true,
    apiKey: "sk-local",
    providerSpecificData: { baseUrl: server.baseUrl },
  }]);
  const models = await buildModelsList(["llm"]);
  const entry = models.find((m) => m.id.endsWith(`/${serverOpts.modelId}`));
  return { caps: entry?.capabilities, server };
}

describe("llama.cpp behind a compatible connection — /v1/models", () => {
  it.each([
    "openai-compatible-llama-single",
    "anthropic-compatible-llama-single",
  ])("%s publishes vision (mmproj) and reasoning (thinking template)", async (provider) => {
    // `--alias` name: matches no capability pattern, so only the server can tell.
    const { caps } = await publishedCaps(provider, { modelId: "local-mm-think" });
    expect(caps).toMatchObject({ vision: true, reasoning: true, contextWindow: 32768 });
  });

  it("takes the server's word over the name: a -vl model without mmproj is text-only", async () => {
    const { caps } = await publishedCaps("openai-compatible-llama-nommproj", {
      modelId: "qwen2.5-vl-7b-instruct",
      vision: false,
      template: PLAIN_TEMPLATE,
      templateCaps: { supports_tools: true },
    });
    expect(caps.vision).toBe(false);
  });

  it("a plain server stays text-only and non-reasoning", async () => {
    const { caps } = await publishedCaps("openai-compatible-llama-plain", {
      modelId: "local-plain",
      vision: false,
      template: PLAIN_TEMPLATE,
      templateCaps: { supports_tools: true },
    });
    expect(caps).toMatchObject({ vision: false, reasoning: false });
  });

  it("detects reasoning from chat_template_caps alone (template without markers)", async () => {
    const { caps } = await publishedCaps("openai-compatible-llama-effort", {
      modelId: "local-effort",
      template: PLAIN_TEMPLATE,
      templateCaps: { supports_reasoning_effort: true },
    });
    expect(caps.reasoning).toBe(true);
  });

  it("router mode: vision from the listing, reasoning from the loaded model, no autoload", async () => {
    const { caps, server } = await publishedCaps("openai-compatible-llama-router", {
      mode: "router",
      modelId: "router-mm-think",
    });
    expect(caps).toMatchObject({ vision: true, reasoning: true });
    expect(server.autoloadHits).toEqual([]);
  });

  it("router mode: an unloaded model is never spawned just to read its caps", async () => {
    const { caps, server } = await publishedCaps("openai-compatible-llama-router-idle", {
      mode: "router",
      modelId: "router-idle",
      status: "unloaded",
    });
    expect(caps.vision).toBe(true);
    expect(server.autoloadHits).toEqual([]);
  });
});
