
export function parseTtlToSeconds(
  ttl: string | number | undefined,
  fallbackSec: number
): number {
  if (ttl == null) return fallbackSec;

  // Si ya es número, lo tratamos como segundos
  if (typeof ttl === "number" && Number.isFinite(ttl)) {
    return Math.max(0, Math.floor(ttl));
  }

  if (typeof ttl === "string") {
    const raw = ttl.trim().replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, ""); // quita comillas del .env
    const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w)$/i);
    if (!match) return fallbackSec;

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    // multiplicadores a segundos
    const mult: Record<string, number> = {
      ms: 1 / 1000,
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 60 * 60 * 24,
      w: 60 * 60 * 24 * 7,
    };

    const sec = value * mult[unit];
    if (!Number.isFinite(sec) || sec < 0) return fallbackSec;
    return Math.floor(sec);
  }

  return fallbackSec;
}
