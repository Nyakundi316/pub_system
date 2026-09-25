/**
 * Rules for accepting a sale rung up while the till was offline. Pure — the
 * sales router feeds it the client's timestamp and the server clock.
 */

/** Tills drift; a couple of minutes ahead of the server is still "now". */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;

/** Past this, a queued sale is stale enough that a manager should look at it. */
export const MAX_OFFLINE_AGE_MS = 72 * 60 * 60 * 1000;

export type SoldAtResult = { ok: true; at: Date } | { ok: false; reason: string };

export function resolveSoldAt(soldAt: Date | undefined, now: Date): SoldAtResult {
  if (!soldAt) return { ok: true, at: now };
  if (Number.isNaN(soldAt.getTime())) return { ok: false, reason: 'soldAt is not a valid date' };

  const ahead = soldAt.getTime() - now.getTime();
  if (ahead > CLOCK_SKEW_MS) return { ok: false, reason: 'soldAt is in the future — check the till clock' };
  // Within the skew window we trust the server clock; a sale can't postdate its own sync.
  if (ahead > 0) return { ok: true, at: now };

  if (-ahead > MAX_OFFLINE_AGE_MS) {
    return { ok: false, reason: `Offline sale is older than ${MAX_OFFLINE_AGE_MS / 3_600_000}h — record it manually` };
  }
  return { ok: true, at: soldAt };
}
