/** Number of parallel slots actually worth starting for a given workload. */
export const poolSize = (limit: number, itemCount: number) => Math.max(1, Math.min(Math.trunc(limit) || 1, itemCount));

/**
 * Runs `worker` over `items` with at most `limit` in flight, returning results in input order.
 * Workers are expected to handle their own failures; a throw aborts the whole pool.
 */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: poolSize(limit, items.length) }, async () => {
    for (let index = next++; index < items.length; index = next++) {
      results[index] = await worker(items[index] as T, index);
    }
  }));
  return results;
}

/**
 * Same, but each parallel slot gets its own reusable resource (a browser page, say) that is
 * created once and disposed when the slot drains.
 */
export async function mapWithWorkers<T, R, W>(
  items: readonly T[],
  limit: number,
  createWorker: () => Promise<W>,
  run: (worker: W, item: T, index: number) => Promise<R>,
  disposeWorker: (worker: W) => Promise<void>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: poolSize(limit, items.length) }, async () => {
    const worker = await createWorker();
    try {
      for (let index = next++; index < items.length; index = next++) {
        results[index] = await run(worker, items[index] as T, index);
      }
    } finally {
      await disposeWorker(worker);
    }
  }));
  return results;
}
