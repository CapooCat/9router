export default {
  id: "chutes",
  priority: 70,
  alias: "chutes",
  aliases: [
    "ch",
  ],
  uiAlias: "ch",
  display: {
    name: "Chutes AI",
    icon: "water_drop",
    color: "#ffffffff",
    textIcon: "CH",
    website: "https://chutes.ai",
    notice: {
      apiKeyUrl: "https://chutes.ai/app/api",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://llm.chutes.ai/v1/chat/completions",
    validateUrl: "https://llm.chutes.ai/v1/models",
  },
  zdr: {
    mode: "default",
    note: "Chutes says prompts and responses to its API are only held in memory while being processed and are never written to disk, a database or logs; only usage numbers like token counts are kept. Private or user-made chutes run third-party code Chutes doesn't control.",
    docs: "https://www.chutes.ai/privacy",
  },
};
