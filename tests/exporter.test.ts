import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { expect, it } from 'vitest';
import { exportRecords } from '../src/exporter.js';
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
