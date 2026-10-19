export default {
  id: "anthropic",
  priority: 30,
  alias: "anthropic",
  display: {
    name: "Anthropic",
    icon: "smart_toy",
    color: "#D97757",
    textIcon: "AN",
    website: "https://console.anthropic.com",
    notice: {
      apiKeyUrl: "https://console.anthropic.com/settings/keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    format: "claude",
    headers: {
      "anthropic-version": "2023-06-01",
      "Anthropic-Beta": "claude-code-20250219,interleaved-thinking-2025-05-14",
    },
  },
  models: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  ],
  serviceKinds: ["llm","imageToText"],
  zdr: {
    mode: "account",
    note: "Prompts and responses are deleted within 30 days by default (chats flagged for policy violations can be kept up to 2 years). Zero retention needs a signed agreement through Anthropic sales, and even then Claude Fable and Mythos models keep data for 30 days.",
    docs: "https://platform.claude.com/docs/en/manage-claude/api-and-data-retention",
  },
};
