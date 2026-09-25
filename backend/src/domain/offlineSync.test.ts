import { describe, expect, it } from 'vitest';
import { CLOCK_SKEW_MS, MAX_OFFLINE_AGE_MS, resolveSoldAt } from './offlineSync';

const now = new Date('2026-09-25T21:00:00Z');
const shift = (ms: number) => new Date(now.getTime() + ms);

describe('resolveSoldAt', () => {
  it('defaults to the server clock when the till sends nothing', () => {
    expect(resolveSoldAt(undefined, now)).toEqual({ ok: true, at: now });
  });

  it('keeps the original time of a sale queued while offline', () => {
    const soldAt = shift(-45 * 60 * 1000);
    expect(resolveSoldAt(soldAt, now)).toEqual({ ok: true, at: soldAt });
  });

  it('clamps a till running slightly fast to the server clock', () => {
    expect(resolveSoldAt(shift(CLOCK_SKEW_MS - 1000), now)).toEqual({ ok: true, at: now });
  });

  it('rejects a timestamp clearly in the future', () => {
    const res = resolveSoldAt(shift(CLOCK_SKEW_MS + 1000), now);
    expect(res.ok).toBe(false);
  });

  it('rejects a sale older than the offline window', () => {
    expect(resolveSoldAt(shift(-MAX_OFFLINE_AGE_MS + 1000), now).ok).toBe(true);
    expect(resolveSoldAt(shift(-MAX_OFFLINE_AGE_MS - 1000), now).ok).toBe(false);
  });

  it('rejects an unparseable date', () => {
    expect(resolveSoldAt(new Date('nope'), now).ok).toBe(false);
  });
});
