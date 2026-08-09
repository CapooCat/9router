/** 948 · 12.4k · 1M — compact token counts for badges, meters and model lists. */
export function formatTokens(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 100 && k % 1 >= 0.05 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = value / 1_000_000;
  return `${m % 1 >= 0.05 ? m.toFixed(1) : Math.round(m)}M`;
}
