export default {
  id: "azure",
  priority: 40,
  alias: "azure",
  display: {
    name: "Azure OpenAI",
    icon: "cloud",
    color: "#0078D4",
    textIcon: "AZ",
    website: "https://azure.microsoft.com/en-us/products/ai-services/openai-service",
    notice: {
      apiKeyUrl: "https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI",
    },
  },
  category: "apikey",
  hasProviderSpecificData: true,
  transport: {
    baseUrl: "",
    headers: {},
  },
  zdr: {
    mode: "account",
    note: "No portal toggle: ZDR comes from the Limited Access \"modified abuse monitoring\" approval (aka.ms/oai/modifiedaccess), EA/MCA customers only. Until approved, prompts and completions are retained up to 30 days for abuse review.",
    docs: "https://learn.microsoft.com/en-us/legal/cognitive-services/openai/data-privacy",
  },
};
