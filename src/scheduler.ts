import type { DigestDeps } from "./digest";
import { sendDigests } from "./digest";

const DIGEST_HOUR_BRT = 6;
const META_KEY = "last_digest_date";

// Date (YYYY-MM-DD) and hour (0-23) of an instant in America/Sao_Paulo.
// BRT is UTC-3 with no DST since 2019.
export function brtParts(nowMs: number): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = Number(get("hour")) % 24; // some ICU builds render midnight as "24"
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour };
}

// Runs the digest at most once per BRT day, on or after 06:00 BRT. The guard date
// is written before sending so an overlapping tick or a restart cannot double-send.
export async function maybeRunDigest(deps: DigestDeps, nowMs: number): Promise<boolean> {
  const { date, hour } = brtParts(nowMs);
  if (hour < DIGEST_HOUR_BRT) return false;
  if (deps.db.getMeta(META_KEY) === date) return false;
  deps.db.setMeta(META_KEY, date);
  await sendDigests(deps);
  return true;
}

export function startDigestScheduler(
  deps: DigestDeps,
  clock: () => number = Date.now
): { stop(): void } {
  const handle = setInterval(() => void maybeRunDigest(deps, clock()), 60_000);
  void maybeRunDigest(deps, clock()); // check immediately on boot
  return { stop: () => clearInterval(handle) };
}
