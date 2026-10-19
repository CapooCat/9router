// [fork] Per-kind probe timeouts for /api/models/test. Media probes run a real
// generation/transcription upstream — slow-but-healthy providers (image models,
// cold-start embedding/STT hosts) blow past the 15s chat-probe cap and show as down.
export const MEDIA_PING_TIMEOUT_MS = {
  embedding: 60_000,
  stt: 60_000,
  systemone: 60_000,
  image: 120_000,
};
