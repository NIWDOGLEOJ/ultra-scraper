import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseCsvRecords } from './csv.js';
import type { BusinessRecord } from './types.js';

/** Google's own place identifier, and the older feature id, both embedded in a Maps place URL. */
const PLACE_ID = /!19s([A-Za-z0-9_-]{10,})/;
const FEATURE_ID = /!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i;

/**
 * A status that means the business was dealt with. Failures are deliberately absent: a site that
 * timed out or blocked us last time deserves another attempt, not a permanent skip.
 */
const SETTLED = new Set(['success', 'no_email_found', 'no_website']);

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Identifies a business across runs. Maps place URLs carry query parameters that change between
 * runs, so the stable id is pulled out of the path rather than comparing whole URLs. Falls back to
 * name and address for a row whose URL carries neither.
 */
export function businessKey(record: Pick<BusinessRecord, 'mapsUrl' | 'businessName' | 'address'>): string {
  const place = PLACE_ID.exec(record.mapsUrl);
  if (place) return `place:${place[1]}`;
  const feature = FEATURE_ID.exec(record.mapsUrl);
  if (feature) return `feature:${feature[1]?.toLowerCase()}`;
  return `name:${normalise(record.businessName)}|${normalise(record.address)}`;
}

export const isSettled = (status: string) => SETTLED.has(status);

/**
 * Collects the businesses that earlier exports in this folder already settled. Anything
 * unreadable is skipped rather than failing the run — a stray CSV should not stop a scrape.
 */
export async function loadSeenKeys(outputDir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let entries: string[];
  try { entries = await readdir(outputDir); } catch { return keys; }

  for (const entry of entries.filter((name) => name.toLowerCase().endsWith('.csv'))) {
    let rows: Array<Record<string, string>>;
    try { rows = parseCsvRecords(await readFile(join(outputDir, entry), 'utf8')); } catch { continue; }
    for (const row of rows) {
      if (!isSettled(row.status ?? '')) continue;
      keys.add(businessKey({
        mapsUrl: row.maps_url ?? '',
        businessName: row.business_name ?? '',
        address: row.address ?? '',
      }));
    }
  }
  return keys;
}
