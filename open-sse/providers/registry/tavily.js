export default {
  id: "tavily",
  alias: "tavily",
  display: {
    name: "Tavily",
    icon: "search",
    color: "#5B21B6",
    textIcon: "TV",
    website: "https://tavily.com",
    notice: {
      apiKeyUrl: "https://app.tavily.com/home"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webSearch",
    "webFetch"
  ],
  searchConfig: {
    baseUrl: "https://api.tavily.com/search",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.008,
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
  fetchConfig: {
    baseUrl: "https://api.tavily.com/extract",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.008,
    freeMonthlyQuota: 1000,
    formats: [
      "markdown",
      "text"
    ],
    maxCharacters: 100000,
    timeoutMs: 15000
  },
  zdr: {
    mode: "account",
    note: "Tavily may keep your search queries to improve its service while 'Allow use of query data' is on. Switch it off in your Tavily account settings and Tavily says your queries are not stored; no retention period is published.",
    docs: "https://help.tavily.com/articles/4205958832-understanding-the-allow-use-of-query-data-setting",
  },
};
