export default {
  id: "groq",
  priority: 60,
  hasFree: true,
  alias: "groq",
  display: {
    name: "Groq",
    icon: "speed",
    color: "#F55036",
    textIcon: "GQ",
    website: "https://groq.com",
    notice: {
      apiKeyUrl: "https://console.groq.com/keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    validateUrl: "https://api.groq.com/openai/v1/models",
  },
  models: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B" },
    { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick" },
    { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B" },
    { id: "whisper-large-v3", name: "Whisper Large v3", params: ["language","response_format","temperature","prompt"], kind: "stt" },
    { id: "whisper-large-v3-turbo", name: "Whisper Large v3 Turbo", params: ["language","response_format","temperature","prompt"], kind: "stt" },
    { id: "distil-whisper-large-v3-en", name: "Distil Whisper Large v3 EN", params: ["language","response_format","temperature","prompt"], kind: "stt" },
  ],
  serviceKinds: ["llm","imageToText","stt"],
  sttConfig: {
    baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
    authType: "apikey",
    authHeader: "bearer",
    format: "openai",
  },
  zdr: {
    mode: "default",
    note: "No inference data retained by default and no training on inputs/outputs. Prompts may still be logged (max 30 days) while troubleshooting or investigating abuse; opt out of that — and enable full ZDR — self-serve under Console → Data Controls.",
    docs: "https://console.groq.com/docs/legal",
  },
};
