/** The smallest useful pause once a host has pushed back, even if the run was going flat out. */
const BLOCKED_FLOOR_MS = 1000;
/** Even an explicit Retry-After is not worth obeying past this; failing the row is better. */
const RETRY_AFTER_CAP_MS = 5 * 60 * 1000;

/** `Retry-After` is either a number of seconds or an HTTP date. Anything else is ignored. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return Math.min(Number(trimmed) * 1000, 24 * 60 * 60 * 1000);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? 0 : Math.max(0, at - now);
}

export interface ThrottleOptions {
  /** The pace to run at while nothing is pushing back. */
  baseDelayMs: number;
  maxDelayMs?: number;
  /** How hard to back off on each refusal. */
  growthFactor?: number;
  /** Consecutive successes needed before easing back toward the base pace. */
  recoverAfter?: number;
}

/**
 * Paces requests, backing off when a host refuses us and easing back once it stops.
 *
 * Increase is multiplicative so a run that is being rate-limited slows down quickly; recovery is
 * stepwise so it does not immediately provoke the same refusal again. A base delay of zero is
 * allowed — the run costs nothing extra until something actually pushes back.
 */
export class Throttle {
  private current: number;
  private readonly base: number;
  private readonly max: number;
  private readonly growth: number;
  private readonly recoverAfter: number;
  private streak = 0;
  private blocked = 0;

  constructor(
    options: ThrottleOptions,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.base = Math.max(0, options.baseDelayMs);
    this.max = Math.max(this.base, options.maxDelayMs ?? Math.max(30_000, this.base * 10));
    this.growth = options.growthFactor ?? 2;
    this.recoverAfter = Math.max(1, options.recoverAfter ?? 5);
    this.current = this.base;
  }

  get delayMs(): number { return this.current; }
  get blockedCount(): number { return this.blocked; }
  /** True when the throttle is pacing more slowly than the run asked for. */
  get isBackedOff(): boolean { return this.current > this.base; }

  recordSuccess(): void {
    if (this.current <= this.base) return;
    this.streak += 1;
    if (this.streak < this.recoverAfter) return;
    this.streak = 0;
    this.current = Math.max(this.base, Math.floor(this.current / this.growth));
  }

  /**
   * A host refused us. `retryAfterMs` comes from a Retry-After header when the server sent one.
   *
   * Our own guess at how long to wait is capped by `maxDelayMs`. An explicit Retry-After is not:
   * it is the server stating exactly what it wants, and retrying earlier just earns another
   * refusal. It is still capped, because waiting a very long time is worse than failing the row.
   */
  recordBlocked(retryAfterMs = 0): void {
    this.blocked += 1;
    this.streak = 0;
    const guessed = Math.min(this.max, Math.max(Math.ceil(this.current * this.growth), BLOCKED_FLOOR_MS));
    this.current = Math.max(guessed, Math.min(retryAfterMs, RETRY_AFTER_CAP_MS));
  }

  wait(): Promise<void> {
    return this.current > 0 ? this.sleep(this.current) : Promise.resolve();
  }
}
