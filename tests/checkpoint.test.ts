import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_VERSION, CheckpointSaver, checkpointKey, checkpointPath, checkpointSlug, countScanned, deleteCheckpoint, pendingRecords, readCheckpoint, writeCheckpoint } from '../src/checkpoint.js';
import type { BusinessRecord } from '../src/types.js';

const record = (over: Partial<BusinessRecord> = {}): BusinessRecord => ({
  businessName: 'Cafe', mapsUrl: 'https://maps.example/1', category: '', address: '', phone: '',
  website: 'https://cafe.in', websiteSource: 'maps', emails: [], contactPages: [],
  status: 'pending', errorMessage: '', ...over,
});

const scratch = () => mkdtemp(join(tmpdir(), 'scraper-cp-'));

describe('checkpoint identity', () => {
  it('is the same for the same query and limit, and differs otherwise', () => {
    expect(checkpointKey('cafes in Madurai', 20)).toBe(checkpointKey('  Cafes In Madurai  ', 20));
    expect(checkpointKey('cafes in Madurai', 20)).not.toBe(checkpointKey('cafes in Madurai', 50));
    expect(checkpointKey('cafes in Madurai', 20)).not.toBe(checkpointKey('dentists in Madurai', 20));
  });

  it('builds a filename that is safe on every platform', () => {
    expect(checkpointSlug('Cafés in Madurai / "best"')).toBe('caf-s-in-madurai-best');
    expect(checkpointSlug('!!!')).toBe('scrape');
    const path = checkpointPath('output', 'cafes in Madurai', 20);
    expect(path).toContain('.checkpoints');
    expect(path.endsWith('.json')).toBe(true);
    expect(/[<>:"|?*]/.test(path.replace(/^[A-Za-z]:/, ''))).toBe(false);
  });
});

describe('reading and writing', () => {
  it('round-trips a checkpoint, creating the directory as needed', async () => {
    const path = join(await scratch(), '.checkpoints', 'run.json');
    await writeCheckpoint(path, { version: CHECKPOINT_VERSION, query: 'cafes', limit: 20, createdAt: 'a', updatedAt: 'b', searchCompleted: true, records: [record({ status: 'success', emails: ['a@cafe.in'] })] });
    const loaded = await readCheckpoint(path);
    expect(loaded?.records).toHaveLength(1);
    expect(loaded?.records[0]?.emails).toEqual(['a@cafe.in']);
    expect(loaded?.searchCompleted).toBe(true);
  });

  it('returns null rather than throwing for a missing, corrupt or stale-format file', async () => {
    const dir = await scratch();
    expect(await readCheckpoint(join(dir, 'nope.json'))).toBeNull();

    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{ not json', 'utf8');
    expect(await readCheckpoint(broken)).toBeNull();

    const oldFormat = join(dir, 'old.json');
    await writeFile(oldFormat, JSON.stringify({ version: CHECKPOINT_VERSION + 1, records: [] }), 'utf8');
    expect(await readCheckpoint(oldFormat)).toBeNull();
  });

  it('leaves no temporary file behind, so a crash cannot be mistaken for progress', async () => {
    const path = join(await scratch(), 'run.json');
    await writeCheckpoint(path, { version: CHECKPOINT_VERSION, query: 'q', limit: 1, createdAt: 'a', updatedAt: 'b', searchCompleted: false, records: [] });
    await expect(readFile(`${path}.tmp`, 'utf8')).rejects.toThrow();
  });

  it('deleting is safe when there is nothing to delete', async () => {
    await expect(deleteCheckpoint(join(await scratch(), 'absent.json'))).resolves.not.toThrow();
  });
});

describe('what still needs doing', () => {
  it('selects only unscanned rows that have somewhere to look', () => {
    const rows = [
      record({ status: 'pending' }),
      record({ status: 'success' }),
      record({ status: 'pending', website: '' }),
      record({ status: 'no_website', website: '' }),
      record({ status: 'website_timeout' }),
    ];
    expect(pendingRecords(rows)).toEqual([rows[0]]);
    // Rows 1, 3 and 4 have moved off 'pending'; rows 0 and 2 have not.
    expect(countScanned(rows)).toBe(3);
  });
});

describe('throttled saving', () => {
  it('writes immediately, then skips writes inside the interval, then writes again after it', async () => {
    const path = join(await scratch(), 'run.json');
    let clock = 10_000;
    const saver = new CheckpointSaver(path, { query: 'q', limit: 5 }, 2000, () => clock);

    expect(await saver.save([record()], false)).toBe(true);
    clock += 500;
    expect(await saver.save([record()], false)).toBe(false);
    clock += 2000;
    expect(await saver.save([record()], false)).toBe(true);
  });

  it('forces a write regardless of the interval', async () => {
    const path = join(await scratch(), 'run.json');
    let clock = 10_000;
    const saver = new CheckpointSaver(path, { query: 'q', limit: 5 }, 60_000, () => clock);
    await saver.save([record()], false, true);
    clock += 1;
    expect(await saver.save([record({ status: 'success' })], false, true)).toBe(true);
    expect((await readCheckpoint(path))?.records[0]?.status).toBe('success');
  });

  it('flushes only when there is unsaved work', async () => {
    const path = join(await scratch(), 'run.json');
    let clock = 10_000;
    const saver = new CheckpointSaver(path, { query: 'q', limit: 5 }, 60_000, () => clock);
    await saver.save([record()], false, true);
    expect(await saver.flush([record()], false)).toBe(false);   // nothing changed since
    await saver.save([record()], false);                        // throttled, so still dirty
    expect(await saver.flush([record()], false)).toBe(true);
  });

  it('keeps the original createdAt across later writes', async () => {
    const path = join(await scratch(), 'run.json');
    let clock = 1_000_000;
    const saver = new CheckpointSaver(path, { query: 'q', limit: 5 }, 0, () => clock);
    await saver.save([record()], false, true);
    const first = await readCheckpoint(path);
    clock += 60_000;
    await saver.save([record()], false, true);
    const second = await readCheckpoint(path);
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(second?.updatedAt).not.toBe(first?.updatedAt);
  });
});
