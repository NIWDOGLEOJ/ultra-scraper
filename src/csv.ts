/**
 * A small RFC 4180 reader, enough to read back the files this tool writes: quoted fields,
 * doubled quotes for a literal quote, and embedded newlines inside a quoted field.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let touched = false;                 // distinguishes an empty final line from a trailing field

  const endField = () => { row.push(field); field = ''; touched = true; };
  const endRow = () => { endField(); rows.push(row); row = []; touched = false; };

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] as string;
    if (quoted) {
      if (char !== '"') { field += char; continue; }
      if (input[index + 1] === '"') { field += '"'; index += 1; continue; }
      quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; touched = true; continue; }
    if (char === ',') { endField(); continue; }
    if (char === '\r') { if (input[index + 1] === '\n') index += 1; endRow(); continue; }
    if (char === '\n') { endRow(); continue; }
    field += char;
    touched = true;
  }
  if (touched || field !== '' || row.length > 0) endRow();
  return rows;
}

/** Reads a CSV with a header row into objects keyed by column name. */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
}
