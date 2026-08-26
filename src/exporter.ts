import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { BusinessRecord } from './types.js';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'jsonl';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'json', 'jsonl'];
export const DEFAULT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx'];
/** ndjson is the same thing as jsonl, and people ask for it by either name. */
const FORMAT_ALIASES: Record<string, ExportFormat> = { ndjson: 'jsonl' };

export function parseFormats(value: string): ExportFormat[] {
  const requested = value.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (requested.length === 0) throw new Error(`format must list at least one of: ${EXPORT_FORMATS.join(', ')}.`);
  const resolved = requested.map((part) => FORMAT_ALIASES[part] ?? part);
  const unknown = resolved.filter((part) => !EXPORT_FORMATS.includes(part as ExportFormat));
  if (unknown.length > 0) throw new Error(`format must be one or more of: ${EXPORT_FORMATS.join(', ')}. Not recognised: ${unknown.join(', ')}.`);
  return [...new Set(resolved)] as ExportFormat[];
}

const columns: Array<[keyof BusinessRecord, string]> = [['businessName','business_name'],['mapsUrl','maps_url'],['category','category'],['address','address'],['phone','phone'],['website','website'],['websiteSource','website_source'],['emails','emails'],['contactPages','contact_pages'],['status','status'],['errorMessage','error_message']];

/** Spreadsheets treat a leading =, +, - or @ as a formula, so CSV cells get a text-forcing prefix. */
const csvSafe = (value: string) => /^[=+\-@]/.test(value) ? `'${value}` : value;
/** ExcelJS stores JS strings as text cells, so the prefix is unnecessary there — and it would
 *  permanently corrupt every international phone number, which starts with "+". */
const rawValue = (record: BusinessRecord, key: keyof BusinessRecord) => {
  const value = record[key];
  return Array.isArray(value) ? value.join('; ') : String(value);
};
const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

export const fileStamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');

export interface ExportOptions {
  formats?: readonly ExportFormat[];
  /** Recorded alongside the rows in the JSON output, so a downstream job knows what produced them. */
  meta?: Record<string, unknown>;
}

export interface ExportResult {
  csvPath: string;
  xlsxPath: string;
  jsonPath: string;
  jsonlPath: string;
  paths: string[];
}

export async function exportRecords(records: BusinessRecord[], outputDir: string, now = new Date(), prefix = 'maps-emails', options: ExportOptions = {}): Promise<ExportResult> {
  const formats = options.formats ?? DEFAULT_FORMATS;
  await mkdir(outputDir, { recursive: true });
  const stamp = fileStamp(now);
  const pathFor = (extension: string) => join(outputDir, `${prefix}-${stamp}.${extension}`);
  const result: ExportResult = { csvPath: '', xlsxPath: '', jsonPath: '', jsonlPath: '', paths: [] };

  if (formats.includes('csv')) {
    const rows = [
      columns.map(([, header]) => csvCell(header)).join(','),
      ...records.map((record) => columns.map(([key]) => csvCell(csvSafe(rawValue(record, key)))).join(',')),
    ];
    // BOM so Excel on Windows reads the file as UTF-8 instead of the local ANSI code page,
    // and CRLF because that is what RFC 4180 specifies.
    result.csvPath = pathFor('csv');
    await writeFile(result.csvPath, '\ufeff' + rows.join('\r\n') + '\r\n', 'utf8');
  }

  if (formats.includes('xlsx')) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Businesses');
    sheet.columns = columns.map(([, header]) => ({ header, key: header }));
    for (const record of records) sheet.addRow(Object.fromEntries(columns.map(([key, header]) => [header, rawValue(record, key)])));
    result.xlsxPath = pathFor('xlsx');
    await workbook.xlsx.writeFile(result.xlsxPath);
  }

  // JSON keeps emails and contact pages as real arrays instead of collapsing them into one
  // semicolon-joined cell, which is the whole reason to use it for a downstream pipeline.
  if (formats.includes('json')) {
    result.jsonPath = pathFor('json');
    const document = { generatedAt: now.toISOString(), count: records.length, ...options.meta, businesses: records };
    await writeFile(result.jsonPath, JSON.stringify(document, null, 2) + '\n', 'utf8');
  }

  if (formats.includes('jsonl')) {
    result.jsonlPath = pathFor('jsonl');
    const body = records.map((record) => JSON.stringify(record)).join('\n');
    await writeFile(result.jsonlPath, records.length > 0 ? body + '\n' : '', 'utf8');
  }

  result.paths = [result.csvPath, result.xlsxPath, result.jsonPath, result.jsonlPath].filter(Boolean);
  return result;
}

export function splitRecordsByOutcome<T extends Pick<BusinessRecord, 'phone' | 'emails' | 'status'>>(records: T[]) {
  const contacts: T[] = []; const noContact: T[] = []; const failures: T[] = [];
  for (const record of records) {
    // A usable contact wins over a failed website scan: the README promises that `contacts-`
    // holds every business with at least one public email or phone number.
    if (record.phone.trim() || record.emails.length) contacts.push(record);
    else if (/error|timeout|blocked/.test(record.status)) failures.push(record);
    else noContact.push(record);
  }
  return { contacts, noContact, failures };
}
