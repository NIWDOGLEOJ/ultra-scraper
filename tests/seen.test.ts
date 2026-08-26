import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { businessKey, isSettled, loadSeenKeys } from '../src/seen.js';

const PLACE_URL = 'https://www.google.com/maps/place/SRM+Easwari/data=!4m7!3m6!1s0x3a5260d62bc6942b:0x8cd23707b2ddfb87!8m2!3d13.03!4d80.17!16s%2Fm%2F0g5!19sChIJK5TGK9ZgUjoRh_vdsgc30ow?authuser=0&hl=en';

const csv = (rows: string[][]) => `﻿${rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(',')).join('\r\n')}\r\n`;
const HEADER = ['business_name', 'maps_url', 'address', 'status'];

describe('business identity', () => {
  it('uses the place id, so changing URL parameters do not look like a new business', () => {
    const a = businessKey({ mapsUrl: PLACE_URL, businessName: 'SRM Easwari', address: 'Chennai' });
    const b = businessKey({ mapsUrl: PLACE_URL.replace('authuser=0&hl=en', 'authuser=2&hl=ta&g_ep=XYZ&rclk=1'), businessName: 'SRM Easwari', address: 'Chennai' });
    expect(a).toBe(b);
    expect(a).toBe('place:ChIJK5TGK9ZgUjoRh_vdsgc30ow');
  });

  it('falls back to the feature id when no place id is present', () => {
    const url = 'https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x3a5260d62bc6942b:0x8cd23707b2ddfb87!8m2';
    expect(businessKey({ mapsUrl: url, businessName: 'X', address: 'Y' })).toBe('feature:0x3a5260d62bc6942b:0x8cd23707b2ddfb87');
  });

  it('falls back to name and address when the URL carries no id', () => {
    const key = businessKey({ mapsUrl: 'https://example.com/', businessName: "Joe's Cafe!", address: '12 Main Rd' });
    expect(key).toBe('name:joescafe|12mainrd');
    expect(businessKey({ mapsUrl: '', businessName: 'JOES CAFE', address: '12 Main  Rd.' })).toBe(key);
  });

  it('keeps genuinely different businesses apart', () => {
    expect(businessKey({ mapsUrl: '', businessName: 'A Cafe', address: 'Road 1' }))
      .not.toBe(businessKey({ mapsUrl: '', businessName: 'B Cafe', address: 'Road 1' }));
  });
});

describe('which rows count as already handled', () => {
  it('treats settled outcomes as done and failures as worth retrying', () => {
    expect(isSettled('success')).toBe(true);
    expect(isSettled('no_email_found')).toBe(true);
    expect(isSettled('no_website')).toBe(true);
    expect(isSettled('website_timeout')).toBe(false);
    expect(isSettled('website_blocked')).toBe(false);
    expect(isSettled('website_error')).toBe(false);
    expect(isSettled('maps_error')).toBe(false);
  });
});

describe('loading earlier exports', () => {
  it('collects settled businesses and leaves failures out, across every CSV in the folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scraper-seen-'));
    await writeFile(join(dir, 'maps-emails-1.csv'), csv([HEADER, ['Cafe A', PLACE_URL, 'Chennai', 'success']]), 'utf8');
    await writeFile(join(dir, 'failures-1.csv'), csv([HEADER, ['Cafe B', '', 'Road 2', 'website_timeout']]), 'utf8');
    await writeFile(join(dir, 'no-contact-1.csv'), csv([HEADER, ['Cafe C', '', 'Road 3', 'no_website']]), 'utf8');

    const seen = await loadSeenKeys(dir);
    expect(seen.has('place:ChIJK5TGK9ZgUjoRh_vdsgc30ow')).toBe(true);
    expect(seen.has('name:cafec|road3')).toBe(true);
    expect(seen.has('name:cafeb|road2')).toBe(false);
    expect(seen.size).toBe(2);
  });

  it('returns an empty set for a missing folder rather than throwing', async () => {
    expect((await loadSeenKeys(join(tmpdir(), 'definitely-not-here-xyz'))).size).toBe(0);
  });

  it('skips an unparseable file instead of failing the run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scraper-seen-'));
    await writeFile(join(dir, 'junk.csv'), 'not,really\na csv"""with junk', 'utf8');
    await writeFile(join(dir, 'good.csv'), csv([HEADER, ['Cafe D', '', 'Road 4', 'success']]), 'utf8');
    const seen = await loadSeenKeys(dir);
    expect(seen.has('name:cafed|road4')).toBe(true);
  });

  it('ignores non-CSV files such as the spreadsheets and checkpoints', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scraper-seen-'));
    await writeFile(join(dir, 'maps-emails-1.xlsx'), 'binary junk', 'utf8');
    expect((await loadSeenKeys(dir)).size).toBe(0);
  });
});
