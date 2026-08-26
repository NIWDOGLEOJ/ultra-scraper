import { expect, it } from 'vitest';
import { createRunSummary, filterRecords, launchArgs } from '../src/run-scrape.js';

it('summarizes processed records and public emails', () => {
  expect(createRunSummary([{ emails: ['a@example.com', 'b@example.com'] }, { emails: ['c@example.com'] }])).toEqual({ businessesProcessed: 2, emailsFound: 3, listingsCollected: 2 });
});

it('keeps only records with the requested public contact type', () => {
  const records = [{ phone: '+91 1', emails: [] }, { phone: '', emails: ['hello@example.com'] }, { phone: '+91 2', emails: ['team@example.com'] }];
  expect(filterRecords(records, 'emails')).toEqual([records[1], records[2]]);
  expect(filterRecords(records, 'phones')).toEqual([records[0], records[2]]);
  expect(filterRecords(records, 'both')).toEqual(records);
});

it('reports collected listings separately from filtered export rows', () => {
  expect(createRunSummary([{ emails: ['a@example.com'] }, { emails: [] }], 8)).toEqual({ businessesProcessed: 2, emailsFound: 1, listingsCollected: 8 });
});

it('adds Chromium flags only where Linux needs them, keeping the sandbox for ordinary users', () => {
  expect(launchArgs('darwin', 501)).toEqual([]);
  expect(launchArgs('win32', undefined)).toEqual([]);
  expect(launchArgs('linux', 1000)).toEqual(['--disable-dev-shm-usage']);
  expect(launchArgs('linux', 0)).toEqual(['--disable-dev-shm-usage', '--no-sandbox']);
});
