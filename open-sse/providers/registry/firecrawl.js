export default {
  id: "firecrawl",
  alias: "firecrawl",
  display: {
    name: "Firecrawl",
    icon: "local_fire_department",
    color: "#F59E0B",
    textIcon: "FC",
    website: "https://firecrawl.dev",
    notice: {
      apiKeyUrl: "https://www.firecrawl.dev/app/api-keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "webFetch"
  ],
  fetchConfig: {
    baseUrl: "https://api.firecrawl.dev/v1/scrape",
    method: "POST",
    authType: "apikey",
    authHeader: "bearer",
    costPerQuery: 0.002,
    freeMonthlyQuota: 500,
    formats: [
      "markdown",
      "html",
      "text"
    ],
    maxCharacters: 200000,
    timeoutMs: 30000
  },
  zdr: {
    mode: "account",
    note: "Not on by default. Zero retention is an Enterprise-plan option that Firecrawl must enable for your team, and it then has to be requested on each call inside the request itself, which the router does not change.",
    docs: "https://docs.firecrawl.dev/features/scrape#zero-data-retention-zdr",
  },
};
