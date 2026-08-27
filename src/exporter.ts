import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { BusinessRecord } from './types.js';

export type ExportFormat = 'csv' | 'xlsx' | 'json' | 'jsonl' | 'md';
export const EXPORT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx', 'json', 'jsonl', 'md'];
export const DEFAULT_FORMATS: readonly ExportFormat[] = ['csv', 'xlsx'];
/** ndjson is the same thing as jsonl, and people ask for it by either name. */
const FORMAT_ALIASES: Record<string, ExportFormat> = { ndjson: 'jsonl', markdown: 'md' };

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
// A pipe would end the column and a newline would end the row, so both have to go.
const mdCell = (value: string) => value.replaceAll('|', '\\|').replaceAll(/\r?\n/g, '<br>').trim();
const mdLink = (label: string, url: string) => (url ? `[${label}](${url})` : '');
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/**
 * Markdown is meant to be read. A raw Maps URL is 250 characters and makes the table unusable, so
 * link-shaped columns become compact links — the full URL is still there, just behind the label.
 */
function mdValue(record: BusinessRecord, key: keyof BusinessRecord): string {
  if (key === 'mapsUrl') return mdLink('Maps', record.mapsUrl);
  if (key === 'website') return mdLink(hostOf(record.website), record.website);
  if (key === 'contactPages') return record.contactPages.map((url, index) => mdLink(String(index + 1), url)).join(' ');
  return mdCell(rawValue(record, key));
}

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
  mdPath: string;
  paths: string[];
}

export async function exportRecords(records: BusinessRecord[], outputDir: string, now = new Date(), prefix = 'maps-emails', options: ExportOptions = {}): Promise<ExportResult> {
  const formats = options.formats ?? DEFAULT_FORMATS;
  await mkdir(outputDir, { recursive: true });
  const stamp = fileStamp(now);
  const pathFor = (extension: string) => join(outputDir, `${prefix}-${stamp}.${extension}`);
  const result: ExportResult = { csvPath: '', xlsxPath: '', jsonPath: '', jsonlPath: '', mdPath: '', paths: [] };

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

  // Markdown is for reading and pasting somewhere — a heading with the run's shape, then a table.
  if (formats.includes('md')) {
    result.mdPath = pathFor('md');
    const emails = records.reduce((total, record) => total + record.emails.length, 0);
    const title = typeof options.meta?.query === 'string' ? `Ultra Scraper — ${options.meta.query}` : 'Ultra Scraper results';
    const heading = [
      `# ${title}`,
      '',
      `${now.toISOString()} · ${records.length} ${records.length === 1 ? 'business' : 'businesses'} · ${emails} public ${emails === 1 ? 'email' : 'emails'}`,
      '',
    ];
    const table = [
      `| ${columns.map(([, header]) => header).join(' | ')} |`,
      `| ${columns.map(() => '---').join(' | ')} |`,
      ...records.map((record) => `| ${columns.map(([key]) => mdValue(record, key)).join(' | ')} |`),
    ];
    await writeFile(result.mdPath, [...heading, ...table, ''].join('\n'), 'utf8');
  }

  result.paths = [result.csvPath, result.xlsxPath, result.jsonPath, result.jsonlPath, result.mdPath].filter(Boolean);
  return result;
}
