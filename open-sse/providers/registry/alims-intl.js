// Model Studio Intl — standard DashScope API keys (sk-...), NOT Coding Plan keys.
// Sibling of alicode-intl (Coding Plan). Two key types use two different hosts.
export default {
  id: "alims-intl",
  priority: 11,
  alias: "alims-intl",
  display: {
    name: "Alibaba Studio",
    icon: "cloud",
    color: "#FF6A00",
    textIcon: "ALi",
    website: "https://modelstudio.console.alibabacloud.com",
    notice: {
      apiKeyUrl: "https://modelstudio.console.alibabacloud.com/?apiKey=1",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
    headers: {},
    quirks: { preserveCacheControl: true },
  },
  models: [
    { id: "qwen3.5-plus", name: "Qwen3.5 Plus" },
    { id: "kimi-k2.5", name: "Kimi K2.5" },
    { id: "glm-5", name: "GLM 5" },
    { id: "MiniMax-M2.5", name: "MiniMax M2.5" },
    { id: "qwen3-coder-next", name: "Qwen3 Coder Next" },
    { id: "qwen3-coder-plus", name: "Qwen3 Coder Plus" },
    { id: "glm-4.7", name: "GLM 4.7" },
  ],
  zdr: {
    mode: "account",
    note: "Prompts and responses are kept up to 30 days by default. Enterprise customers can ask their Alibaba Cloud account manager to turn on zero retention for a workspace; it covers only listed models (newer Qwen, DeepSeek and GLM series), and other models in that workspace still keep data for 30 days.",
    docs: "https://www.alibabacloud.com/help/en/model-studio/data-retention-policy",
  },
};
