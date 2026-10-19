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
    note: "Prompts flagged by Microsoft's abuse checks can be stored for staff to review, and features like the Responses API, Assistants and stored completions keep data until you delete it. To stop abuse-review storage, apply for 'modified abuse monitoring' (aka.ms/oai/modifiedaccess); only customers managed by a Microsoft account team qualify, and there is no switch in the portal.",
    docs: "https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/openai/data-privacy",
  },
};
