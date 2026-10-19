export default {
  id: "exa",
  alias: "exa",
  display: {
    name: "Exa",
    icon: "manage_search",
    color: "#2563EB",
    textIcon: "EX",
    website: "https://exa.ai",
    notice: {
      apiKeyUrl: "https://dashboard.exa.ai/api-keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webSearch",
    "webFetch"
  ],
  searchConfig: {
    baseUrl: "https://api.exa.ai/search",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 0.007,
    freeMonthlyQuota: 1000,
    searchTypes: [
      "web",
      "news"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 100,
    timeoutMs: 10000,
    cacheTTLMs: 300000
  },
  fetchConfig: {
    baseUrl: "https://api.exa.ai/contents",
    method: "POST",
    authType: "apikey",
    authHeader: "x-api-key",
    costPerQuery: 0.001,
    freeMonthlyQuota: 1000,
    formats: [
      "text",
      "markdown"
    ],
    maxCharacters: 100000,
    timeoutMs: 15000
  },
  zdr: {
    mode: "account",
    note: "Not on by default, and Exa does not publish how long it otherwise keeps queries. Zero retention is an Enterprise-plan option that Exa turns on for your team; contact sales@exa.ai.",
    docs: "https://exa.ai/docs/admin/security/zero-data-retention",
  },
};
