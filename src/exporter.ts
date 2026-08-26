import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { BusinessRecord } from './types.js';

const columns: Array<[keyof BusinessRecord, string]> = [['businessName','business_name'],['mapsUrl','maps_url'],['category','category'],['address','address'],['phone','phone'],['website','website'],['emails','emails'],['contactPages','contact_pages'],['status','status'],['errorMessage','error_message']];

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

export async function exportRecords(records: BusinessRecord[], outputDir: string, now = new Date(), prefix = 'maps-emails') {
  await mkdir(outputDir, { recursive: true });
  const stamp = fileStamp(now);
  const csvPath = join(outputDir, `${prefix}-${stamp}.csv`);
  const xlsxPath = join(outputDir, `${prefix}-${stamp}.xlsx`);

  const rows = [
    columns.map(([, header]) => csvCell(header)).join(','),
    ...records.map((record) => columns.map(([key]) => csvCell(csvSafe(rawValue(record, key)))).join(',')),
  ];
  // BOM so Excel on Windows reads the file as UTF-8 instead of the local ANSI code page,
  // and CRLF because that is what RFC 4180 specifies.
  await writeFile(csvPath, `﻿${rows.join('\r\n')}\r\n`, 'utf8');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Businesses');
  sheet.columns = columns.map(([, header]) => ({ header, key: header }));
  for (const record of records) sheet.addRow(Object.fromEntries(columns.map(([key, header]) => [header, rawValue(record, key)])));
  await workbook.xlsx.writeFile(xlsxPath);

  return { csvPath, xlsxPath };
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
