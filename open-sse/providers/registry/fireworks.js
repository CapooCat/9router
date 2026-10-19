export default {
  id: "fireworks",
  priority: 50,
  alias: "fireworks",
  display: {
    name: "Fireworks AI",
    icon: "local_fire_department",
    color: "#7B2EF2",
    textIcon: "FW",
    website: "https://fireworks.ai",
    notice: {
      apiKeyUrl: "https://fireworks.ai/account/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.fireworks.ai/inference/v1/chat/completions",
    validateUrl: "https://api.fireworks.ai/inference/v1/models",
  },
  models: [
    { id: "accounts/fireworks/models/deepseek-v3p1", name: "DeepSeek V3.1" },
    { id: "accounts/fireworks/models/llama-v3p3-70b-instruct", name: "Llama 3.3 70B" },
    { id: "accounts/fireworks/models/qwen3-235b-a22b", name: "Qwen3 235B" },
    { id: "nomic-ai/nomic-embed-text-v1.5", name: "Nomic Embed Text v1.5", kind: "embedding" },
  ],
  serviceKinds: ["llm", "embedding"],
  embeddingConfig: { baseUrl: "https://api.fireworks.ai/inference/v1/embeddings" },
  zdr: {
    mode: "default",
    note: "Open models keep no prompts or responses by default; only usage data like token counts is logged. The Responses API is the exception and saves conversations for 30 days unless the app turns storage off; Enterprise admins can block every feature that stores data under Settings → Governances → Zero Data Retention.",
    docs: "https://docs.fireworks.ai/guides/security_compliance/data_handling",
  },
};
