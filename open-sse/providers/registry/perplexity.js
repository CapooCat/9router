export default {
  id: "perplexity",
  priority: 180,
  alias: "perplexity",
  aliases: [
    "pplx",
  ],
  uiAlias: "pplx",
  display: {
    name: "Perplexity",
    icon: "search",
    color: "#20808D",
    textIcon: "PP",
    website: "https://www.perplexity.ai",
    notice: {
      apiKeyUrl: "https://www.perplexity.ai/settings/api",
    },
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.perplexity.ai/chat/completions",
    validateUrl: "https://api.perplexity.ai/models",
  },
  models: [
    { id: "sonar-pro", name: "Sonar Pro" },
    { id: "sonar", name: "Sonar" },
  ],
  serviceKinds: ["llm","webSearch"],
  searchViaChat: {
    defaultModel: "sonar",
    endpoint: "https://api.perplexity.ai/chat/completions",
    pricingUrl: "https://docs.perplexity.ai/guides/pricing",
  },
  zdr: {
    mode: "account",
    restrictsRouting: true,
    note: "Not on by default, and Perplexity says not to assume zero retention unless it's enabled for your account. It's available only to eligible customers under a written agreement; once on, models whose providers don't support it return an error.",
    docs: "https://docs.perplexity.ai/docs/resources/privacy-security",
  },
};
