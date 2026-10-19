export default {
  id: "cartesia",
  alias: "cartesia",
  display: {
    name: "Cartesia",
    icon: "spatial_audio",
    color: "#FF4F8B",
    textIcon: "CA",
    website: "https://cartesia.ai",
    notice: {
      apiKeyUrl: "https://play.cartesia.ai/keys"
    }
  },
  category: "apikey",
  authType: "apikey",
  serviceKinds: [
    "tts"
  ],
  ttsConfig: {
    baseUrl: "https://api.cartesia.ai/tts/bytes",
    authType: "apikey",
    authHeader: "x-api-key",
    format: "cartesia",
    models: [
      {
        id: "sonic-2",
        name: "Sonic 2"
      },
      {
        id: "sonic-3",
        name: "Sonic 3"
      }
    ]
  },
  hidden: true,
  zdr: {
    mode: "account",
    note: "Not on by default. Enterprise customers can turn on zero retention in the Cartesia dashboard's organization privacy settings; your text and audio are then not kept, though voice cloning is not covered.",
    docs: "https://docs.cartesia.ai/enterprise/zero-data-retention",
  },
};
