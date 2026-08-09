export default {
  id: "cerebras",
  priority: 60,
  alias: "cerebras",
  display: {
    name: "Cerebras",
    icon: "memory",
    color: "#FF4F00",
    textIcon: "CB",
    website: "https://www.cerebras.ai",
    notice: {
      apiKeyUrl: "https://cloud.cerebras.ai/platform",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    validateUrl: "https://api.cerebras.ai/v1/models",
    quirks: {
      dropClientMetadata: true,
    },
  },
  models: [
    { id: "gpt-oss-120b", name: "GPT OSS 120B" },
    { id: "zai-glm-4.7", name: "ZAI GLM 4.7" },
    { id: "llama-3.3-70b", name: "Llama 3.3 70B" },
    { id: "llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout" },
    { id: "qwen-3-235b-a22b-instruct-2507", name: "Qwen3 235B A22B" },
    { id: "qwen-3-32b", name: "Qwen3 32B" },
  ],
  zdr: {
    mode: "default",
    note: "Prompt content, API requests/responses and chat logs are not retained — data is processed for the response and discarded, never stored, logged or reused for training. Nothing to enable.",
    docs: "https://support.cerebras.net/articles/1811589793-does-cerebras-retain-my-data",
  },
};
