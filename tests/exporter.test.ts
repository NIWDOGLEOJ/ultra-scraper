import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportRecords, parseFormats } from '../src/exporter.js';
import type { BusinessRecord } from '../src/types.js';

const record = (over: Partial<BusinessRecord> = {}): BusinessRecord => ({
  businessName: 'Café Périyar', mapsUrl: 'https://maps.example/x', category: 'College', address: 'Chennai',
  phone: '+91 44 1234 5678', website: 'https://cafe.in', websiteSource: 'maps', emails: ['info@cafe.in'], contactPages: [],
  status: 'success', errorMessage: '', ...over,
});

it('writes CSV that Excel on Windows reads as UTF-8, with RFC 4180 line endings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { csvPath } = await exportRecords([record()], dir);
  const csv = await readFile(csvPath, 'utf8');
  expect(csv.startsWith('﻿')).toBe(true);
  expect(csv).toContain('\r\n');
  expect(csv).toContain('Café Périyar');
});

it('keeps international phone numbers intact in the spreadsheet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { csvPath, xlsxPath } = await exportRecords([record()], dir);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const phoneCell = workbook.getWorksheet('Businesses')?.getRow(2).getCell(5).value;
  expect(phoneCell).toBe('+91 44 1234 5678');

  // The CSV still needs the text-forcing prefix, because a bare +... is a formula there.
  expect(await readFile(csvPath, 'utf8')).toContain(`"'+91 44 1234 5678"`);
});

it('quotes embedded quotes and newlines so multi-line addresses stay in one field', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { csvPath } = await exportRecords([record({ address: 'Line "A"\nLine B' })], dir);
  expect(await readFile(csvPath, 'utf8')).toContain('"Line ""A""\nLine B"');
});

it('records how each website was found, in both output formats', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { csvPath, xlsxPath } = await exportRecords([record(), record({ businessName: 'Found by search', websiteSource: 'search' })], dir);

  const csv = await readFile(csvPath, 'utf8');
  expect(csv).toContain('"website_source"');
  expect(csv).toContain('"maps"');
  expect(csv).toContain('"search"');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(xlsxPath);
  const sheet = workbook.getWorksheet('Businesses');
  expect(sheet?.getRow(1).getCell(7).value).toBe('website_source');
  expect(sheet?.getRow(3).getCell(7).value).toBe('search');
});

it('writes only the formats that were asked for', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const result = await exportRecords([record()], dir, new Date(), 'maps-emails', { formats: ['json'] });
  expect(result.jsonPath).not.toBe('');
  expect(result.csvPath).toBe('');
  expect(result.xlsxPath).toBe('');
  expect(result.paths).toEqual([result.jsonPath]);
  await expect(readFile(`${result.jsonPath.replace('.json', '.csv')}`, 'utf8')).rejects.toThrow();
});

it('defaults to CSV and Excel, as before', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const result = await exportRecords([record()], dir);
  expect(result.paths).toEqual([result.csvPath, result.xlsxPath]);
});

it('writes a Markdown table with a heading describing the run', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const rows = [record({ businessName: 'Cafe One', emails: ['a@cafe.in', 'b@cafe.in'] })];
  const { mdPath } = await exportRecords(rows, dir, new Date(), 'maps-emails', { formats: ['md'], meta: { query: 'cafes in Madurai' } });

  const md = await readFile(mdPath, 'utf8');
  expect(md).toContain('# Ultra Scraper — cafes in Madurai');
  expect(md).toContain('1 business · 2 public emails');
  expect(md).toContain('| business_name | maps_url |');
  expect(md).toContain('| Cafe One |');
  expect(md).toContain('a@cafe.in; b@cafe.in');
});

it('renders link columns compactly so the table stays readable, without losing the URL', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const rows = [record({
    mapsUrl: 'https://www.google.com/maps/place/X/data=!4m7!3m6!1s0x3ba8591de6346f05:0xbeded3630a59adc5!8m2!3d11.01!4d76.94?authuser=0&hl=en',
    website: 'https://www.drruchidental.com/',
    contactPages: ['https://drruchidental.com/', 'https://drruchidental.com/contact-us/'],
  })];
  const { mdPath } = await exportRecords(rows, dir, new Date(), 'maps-emails', { formats: ['md'] });

  const md = await readFile(mdPath, 'utf8');
  expect(md).toContain('[Maps](https://www.google.com/maps/place/X/data=');
  expect(md).toContain('[drruchidental.com](https://www.drruchidental.com/)');
  expect(md).toContain('[1](https://drruchidental.com/) [2](https://drruchidental.com/contact-us/)');
});

it('escapes pipes and newlines so a messy address cannot break the table', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const rows = [record({ address: 'Unit 3 | Rear\nChennai' })];
  const { mdPath } = await exportRecords(rows, dir, new Date(), 'maps-emails', { formats: ['md'] });

  const md = await readFile(mdPath, 'utf8');
  expect(md).toContain('Unit 3 \\| Rear<br>Chennai');
  // Every row must still be exactly one line of the table.
  const rowLines = md.split('\n').filter((line) => line.startsWith('|'));
  expect(rowLines).toHaveLength(3);           // header, separator, one record
});

it('falls back to a generic Markdown heading when no query was recorded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { mdPath } = await exportRecords([record()], dir, new Date(), 'maps-emails', { formats: ['md'] });
  expect(await readFile(mdPath, 'utf8')).toContain('# Ultra Scraper results');
});

it('keeps emails and contact pages as real arrays in JSON, with run metadata', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const rows = [record({ emails: ['a@cafe.in', 'b@cafe.in'], contactPages: ['https://cafe.in/contact'] })];
  const { jsonPath } = await exportRecords(rows, dir, new Date(), 'maps-emails', { formats: ['json'], meta: { query: 'cafes in Madurai', skippedSeen: 3 } });

  const parsed = JSON.parse(await readFile(jsonPath, 'utf8'));
  expect(parsed.query).toBe('cafes in Madurai');
  expect(parsed.skippedSeen).toBe(3);
  expect(parsed.count).toBe(1);
  expect(typeof parsed.generatedAt).toBe('string');
  expect(parsed.businesses[0].emails).toEqual(['a@cafe.in', 'b@cafe.in']);
  expect(parsed.businesses[0].contactPages).toEqual(['https://cafe.in/contact']);
  // The CSV formula guard is a CSV concern; JSON must carry the real value.
  expect(parsed.businesses[0].phone).toBe('+91 44 1234 5678');
});

it('writes one self-contained JSON object per line for jsonl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const rows = [record({ businessName: 'One' }), record({ businessName: 'Two' })];
  const { jsonlPath } = await exportRecords(rows, dir, new Date(), 'maps-emails', { formats: ['jsonl'] });

  const text = await readFile(jsonlPath, 'utf8');
  expect(text.endsWith('\n')).toBe(true);
  const lines = text.trimEnd().split('\n');
  expect(lines).toHaveLength(2);
  expect(lines.map((line) => JSON.parse(line).businessName)).toEqual(['One', 'Two']);
});

it('writes an empty jsonl file rather than a stray blank line when there is nothing to export', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scraper-'));
  const { jsonlPath } = await exportRecords([], dir, new Date(), 'maps-emails', { formats: ['jsonl'] });
  expect(await readFile(jsonlPath, 'utf8')).toBe('');
});

describe('format parsing', () => {
  it('accepts a comma-separated list, trims it and drops duplicates', () => {
    expect(parseFormats('csv')).toEqual(['csv']);
    expect(parseFormats(' JSON , csv ,json')).toEqual(['json', 'csv']);
  });

  it('accepts the long names people reach for', () => {
    expect(parseFormats('ndjson')).toEqual(['jsonl']);
    expect(parseFormats('markdown')).toEqual(['md']);
  });

  it('rejects an unknown format and names it', () => {
    expect(() => parseFormats('csv,pdf')).toThrow('Not recognised: pdf');
    expect(() => parseFormats('')).toThrow('at least one');
  });
});
