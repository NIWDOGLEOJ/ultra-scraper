import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { BusinessRecord } from './types.js';

export const CHECKPOINT_VERSION = 1;
export const CHECKPOINT_DIR = '.checkpoints';

export interface Checkpoint {
  version: number;
  query: string;
  limit: number;
  createdAt: string;
  updatedAt: string;
  /** True once the web-search fallback has already been attempted for every no_website row. */
  searchCompleted: boolean;
  records: BusinessRecord[];
}

/** A run is identified by what it set out to collect, so the same command finds its own checkpoint. */
export const checkpointKey = (query: string, limit: number) =>
  createHash('sha1').update(`${query.trim().toLowerCase()}::${limit}`).digest('hex').slice(0, 8);

/** Readable enough to recognise in a directory listing, and safe as a filename on every platform. */
export const checkpointSlug = (query: string) =>
  query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'scrape';

export const checkpointPath = (outputDir: string, query: string, limit: number) =>
  join(outputDir, CHECKPOINT_DIR, `${checkpointSlug(query)}-${checkpointKey(query, limit)}.json`);

/** Records still owed a website scan: they have somewhere to look and have not been looked at. */
export const pendingRecords = (records: readonly BusinessRecord[]) =>
  records.filter((record) => record.status === 'pending' && Boolean(record.website));

export const countScanned = (records: readonly BusinessRecord[]) =>
  records.filter((record) => record.status !== 'pending').length;

export async function readCheckpoint(path: string): Promise<Checkpoint | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as Partial<Checkpoint>;
    // A checkpoint written by a different version of the format is not worth guessing at.
    if (parsed.version !== CHECKPOINT_VERSION || !Array.isArray(parsed.records)) return null;
    return parsed as Checkpoint;
  } catch {
    return null;
  }
}

/** Written to a temporary name and renamed into place, so a crash mid-write cannot corrupt it. */
export async function writeCheckpoint(path: string, checkpoint: Checkpoint): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(checkpoint), 'utf8');
  await rename(temporary, path);
}

export const deleteCheckpoint = (path: string) => rm(path, { force: true });

/**
 * Saves progress without writing on every single completed scan. Throttled by elapsed time, and
 * always written when forced — at a phase boundary, or on the way out after Ctrl-C.
 */
export class CheckpointSaver {
  private lastWriteAt = Number.NEGATIVE_INFINITY;
  private dirty = false;

  constructor(
    private readonly path: string,
    private readonly base: { query: string; limit: number },
    private readonly minIntervalMs = 2000,
    private readonly now: () => number = Date.now,
  ) {}

  private createdAt = '';

  async save(records: readonly BusinessRecord[], searchCompleted: boolean, force = false): Promise<boolean> {
    this.dirty = true;
    if (!force && this.now() - this.lastWriteAt < this.minIntervalMs) return false;
    const stamp = new Date(this.now()).toISOString();
    if (!this.createdAt) this.createdAt = stamp;
    await writeCheckpoint(this.path, {
      version: CHECKPOINT_VERSION,
      query: this.base.query,
      limit: this.base.limit,
      createdAt: this.createdAt,
      updatedAt: stamp,
      searchCompleted,
      records: [...records],
    });
    this.lastWriteAt = this.now();
    this.dirty = false;
    return true;
  }

  /** Writes only if something has changed since the last write. */
  async flush(records: readonly BusinessRecord[], searchCompleted: boolean): Promise<boolean> {
    return this.dirty ? this.save(records, searchCompleted, true) : false;
  }
}
