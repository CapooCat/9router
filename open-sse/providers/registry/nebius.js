export default {
  id: "nebius",
  priority: 70,
  alias: "nebius",
  display: {
    name: "Nebius AI",
    icon: "cloud",
    color: "#6C5CE7",
    textIcon: "NB",
    website: "https://nebius.com",
    notice: {
      apiKeyUrl: "https://studio.nebius.com/settings/api-keys",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.studio.nebius.ai/v1/chat/completions",
    validateUrl: "https://api.studio.nebius.ai/v1/models",
  },
  models: [
    { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct" },
    { id: "Qwen/Qwen3-Embedding-8B", name: "Qwen3 Embedding 8B", kind: "embedding" },
  ],
  serviceKinds: ["llm", "embedding"],
  embeddingConfig: { baseUrl: "https://api.tokenfactory.nebius.com/v1/embeddings" },
  zdr: {
    mode: "account",
    note: "Off unless you switch it on in your account profile page. Until you do, Nebius KEEPS your inputs and outputs to speed up inference via speculative decoding (never for training). With ZDR on, nothing is stored after the request.",
    docs: "https://docs.tokenfactory.nebius.com/legal/legal-quick-guide",
  },
};
