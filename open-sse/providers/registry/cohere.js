export default {
  id: "cohere",
  priority: 90,
  alias: "cohere",
  display: {
    name: "Cohere",
    icon: "hub",
    color: "#39594D",
    textIcon: "CO",
    website: "https://cohere.com",
    notice: {
      apiKeyUrl: "https://dashboard.cohere.com/api-keys",
    },
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.cohere.ai/v1/chat/completions",
    validateUrl: "https://api.cohere.ai/v1/models",
  },
  models: [
    { id: "command-r-plus-08-2024", name: "Command R+ (Aug 2024)" },
    { id: "command-r-08-2024", name: "Command R (Aug 2024)" },
    { id: "command-a-03-2025", name: "Command A (Mar 2025)" },
  ],
  zdr: {
    mode: "account",
    note: "Logged prompts and responses are deleted after 30 days, and you can stop them being used for training under Dashboard → Settings → Data Controls. Zero retention is only for approved enterprise customers: email support@cohere.com (copy your sales rep).",
    docs: "https://cohere.com/data-usage-policy",
  },
};
