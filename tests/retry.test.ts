import { expect, it } from 'vitest';
import { isTransient, retryOnce } from '../src/retry.js';

it('retries a transient operation once', async () => {
  let attempts = 0;
  await expect(retryOnce(async () => { attempts += 1; if (attempts === 1) throw new Error('timeout'); return 'ok'; }, 0)).resolves.toBe('ok');
  expect(attempts).toBe(2);
});

it('does not waste a second attempt on a permanent failure', async () => {
  let attempts = 0;
  await expect(retryOnce(async () => { attempts += 1; throw new Error('net::ERR_NAME_NOT_RESOLVED at https://nope.invalid'); }, 0)).rejects.toThrow('ERR_NAME_NOT_RESOLVED');
  expect(attempts).toBe(1);
});

it('separates transient network conditions from permanent ones', () => {
  expect(isTransient(new Error('Timeout 15000ms exceeded'))).toBe(true);
  expect(isTransient(new Error('net::ERR_CONNECTION_RESET'))).toBe(true);
  expect(isTransient(new Error('net::ERR_CERT_AUTHORITY_INVALID'))).toBe(false);
  expect(isTransient(new Error('something unexpected'))).toBe(false);
});

it('collapses a multi-line Playwright error into one readable cell', async () => {
  const { describeError } = await import('../src/errors.js');
  expect(describeError(new Error('page.goto: net::ERR_ABORTED at https://x.test/\nCall log:\n  - navigating'))).toBe('page.goto: net::ERR_ABORTED at https://x.test/');
  expect(describeError(new Error('  \n  '), 'fallback')).toBe('fallback');
  expect(describeError(new Error('x'.repeat(400))).length).toBe(198);
});
