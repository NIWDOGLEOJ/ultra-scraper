import { describe, expect, it } from 'vitest';
import { Throttle, parseRetryAfter } from '../src/throttle.js';

const noSleep = async () => {};

describe('Retry-After', () => {
  it('reads a seconds value', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(parseRetryAfter(' 5 ')).toBe(5000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30_000);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', now + 5000)).toBe(0);
  });

  it('ignores anything it cannot read, and caps an absurd value', () => {
    expect(parseRetryAfter(null)).toBe(0);
    expect(parseRetryAfter('')).toBe(0);
    expect(parseRetryAfter('soon')).toBe(0);
    expect(parseRetryAfter('999999999')).toBe(24 * 60 * 60 * 1000);
  });
});

describe('backing off', () => {
  it('runs at the requested pace until something pushes back', () => {
    const throttle = new Throttle({ baseDelayMs: 1200 }, noSleep);
    expect(throttle.delayMs).toBe(1200);
    expect(throttle.isBackedOff).toBe(false);
    throttle.recordSuccess();
    expect(throttle.delayMs).toBe(1200);
  });

  it('slows down multiplicatively on each refusal', () => {
    const throttle = new Throttle({ baseDelayMs: 1000 }, noSleep);
    throttle.recordBlocked();
    expect(throttle.delayMs).toBe(2000);
    throttle.recordBlocked();
    expect(throttle.delayMs).toBe(4000);
    expect(throttle.blockedCount).toBe(2);
    expect(throttle.isBackedOff).toBe(true);
  });

  it('backs off from a zero base too, so a fast phase still reacts', () => {
    const throttle = new Throttle({ baseDelayMs: 0 }, noSleep);
    expect(throttle.delayMs).toBe(0);
    throttle.recordBlocked();
    expect(throttle.delayMs).toBe(1000);
  });

  it('caps its own guesswork at the ceiling', () => {
    const throttle = new Throttle({ baseDelayMs: 1000, maxDelayMs: 5000 }, noSleep);
    for (let i = 0; i < 10; i += 1) throttle.recordBlocked();
    expect(throttle.delayMs).toBe(5000);
  });

  it('obeys an explicit Retry-After past its own ceiling, since retrying sooner just gets refused again', () => {
    const throttle = new Throttle({ baseDelayMs: 1000, maxDelayMs: 5000 }, noSleep);
    throttle.recordBlocked(45_000);
    expect(throttle.delayMs).toBe(45_000);
  });

  it('will not obey a Retry-After of hours — failing the row beats stalling the run', () => {
    const throttle = new Throttle({ baseDelayMs: 1000 }, noSleep);
    throttle.recordBlocked(6 * 60 * 60 * 1000);
    expect(throttle.delayMs).toBe(5 * 60 * 1000);
  });
});

describe('recovering', () => {
  it('eases back only after a run of successes, and never below the base pace', () => {
    const throttle = new Throttle({ baseDelayMs: 1000, recoverAfter: 3 }, noSleep);
    throttle.recordBlocked();
    throttle.recordBlocked();
    expect(throttle.delayMs).toBe(4000);

    throttle.recordSuccess();
    throttle.recordSuccess();
    expect(throttle.delayMs).toBe(4000);      // not yet
    throttle.recordSuccess();
    expect(throttle.delayMs).toBe(2000);      // one step down

    for (let i = 0; i < 3; i += 1) throttle.recordSuccess();
    expect(throttle.delayMs).toBe(1000);
    for (let i = 0; i < 9; i += 1) throttle.recordSuccess();
    expect(throttle.delayMs).toBe(1000);      // the base is the floor
    expect(throttle.isBackedOff).toBe(false);
  });

  it('a refusal restarts the run of successes', () => {
    const throttle = new Throttle({ baseDelayMs: 1000, recoverAfter: 2 }, noSleep);
    throttle.recordBlocked();
    throttle.recordSuccess();
    throttle.recordBlocked();                  // streak reset
    throttle.recordSuccess();
    expect(throttle.delayMs).toBe(4000);
    throttle.recordSuccess();
    expect(throttle.delayMs).toBe(2000);
  });
});

describe('waiting', () => {
  it('sleeps for the current delay, and not at all when there is none', async () => {
    const slept: number[] = [];
    const throttle = new Throttle({ baseDelayMs: 0 }, async (ms) => { slept.push(ms); });
    await throttle.wait();
    expect(slept).toEqual([]);
    throttle.recordBlocked();
    await throttle.wait();
    expect(slept).toEqual([1000]);
  });
});
