import { expect, it } from 'vitest';
import { mapWithConcurrency, mapWithWorkers, poolSize } from '../src/concurrency.js';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it('never starts more slots than there is work for', () => {
  expect(poolSize(5, 2)).toBe(2);
  expect(poolSize(5, 20)).toBe(5);
  expect(poolSize(0, 20)).toBe(1);
});

it('returns results in input order regardless of completion order', async () => {
  const out = await mapWithConcurrency([30, 5, 20, 1], 4, async (ms, i) => { await tick(ms); return `${i}:${ms}`; });
  expect(out).toEqual(['0:30', '1:5', '2:20', '3:1']);
});

it('honours the concurrency ceiling', async () => {
  let running = 0; let peak = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
    running += 1; peak = Math.max(peak, running);
    await tick(5);
    running -= 1;
  });
  expect(peak).toBe(3);
});

it('empties the queue even when slots finish at different speeds', async () => {
  const seen: number[] = [];
  await mapWithConcurrency(Array.from({ length: 9 }, (_, i) => i), 2, async (i) => { await tick(i % 2 ? 1 : 6); seen.push(i); });
  expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

it('creates one reusable worker per slot and disposes every one', async () => {
  const created: number[] = []; const disposed: number[] = [];
  let id = 0;
  const out = await mapWithWorkers(
    [1, 2, 3, 4, 5, 6], 2,
    async () => { const w = id++; created.push(w); return w; },
    async (worker, item) => { await tick(1); return `w${worker}:${item}`; },
    async (worker) => { disposed.push(worker); },
  );
  expect(created).toHaveLength(2);
  expect(disposed.sort()).toEqual(created.sort());
  expect(out).toHaveLength(6);
});

it('disposes slot resources even when a worker throws', async () => {
  const disposed: string[] = [];
  await expect(mapWithWorkers([1, 2], 1, async () => 'page', async () => { throw new Error('boom'); }, async (w) => { disposed.push(w); }))
    .rejects.toThrow('boom');
  expect(disposed).toEqual(['page']);
});
