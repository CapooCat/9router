export default {
  id: "brave-search",
  alias: "brave",
  display: {
    name: "Brave Search",
    icon: "travel_explore",
    color: "#FB542B",
    textIcon: "BR",
    website: "https://brave.com/search/api",
    notice: {
      apiKeyUrl: "https://api-dashboard.search.brave.com/app/keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webSearch"
  ],
  searchConfig: {
    baseUrl: "https://api.search.brave.com/res/v1",
    method: "GET",
    authType: "apikey",
    authHeader: "x-subscription-token",
    costPerQuery: 0.005,
    freeMonthlyQuota: 1000,
    searchTypes: [
      "web",
      "news"
    ],
    defaultMaxResults: 5,
    maxMaxResults: 20,
    timeoutMs: 10000,
    cacheTTLMs: 300000
  },
  zdr: {
    mode: "account",
    note: "Not on by default: search queries are kept for up to 90 days for billing, troubleshooting and abuse prevention. Customers on a custom Enterprise plan can ask Brave API support to turn on zero retention.",
    docs: "https://api-dashboard.search.brave.com/privacy-policy",
  },
};
