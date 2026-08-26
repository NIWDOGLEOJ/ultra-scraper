import { expect, it } from 'vitest';
import { parseCsv, parseCsvRecords } from '../src/csv.js';

it('reads plain rows split on CRLF or LF', () => {
  expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
  expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
});

it('unwraps quoted fields and doubled quotes', () => {
  expect(parseCsv('"a","b""c"')).toEqual([['a', 'b"c']]);
});

it('keeps a newline that lives inside a quoted field', () => {
  expect(parseCsv('"Line A\nLine B","x"\r\n"y","z"')).toEqual([['Line A\nLine B', 'x'], ['y', 'z']]);
});

it('preserves empty fields, including trailing ones', () => {
  expect(parseCsv('a,,c\r\n,,\r\n')).toEqual([['a', '', 'c'], ['', '', '']]);
});

it('strips a UTF-8 byte-order mark, which is how this tool writes CSV', () => {
  expect(parseCsv('﻿"business_name"\r\n"Cafe"\r\n')).toEqual([['business_name'], ['Cafe']]);
});

it('reads a header row into objects and drops blank lines', () => {
  const csv = '"name","status"\r\n"Cafe","success"\r\n\r\n"Bakery","no_website"\r\n';
  expect(parseCsvRecords(csv)).toEqual([
    { name: 'Cafe', status: 'success' },
    { name: 'Bakery', status: 'no_website' },
  ]);
});

it('survives an empty file or a header with no rows', () => {
  expect(parseCsvRecords('')).toEqual([]);
  expect(parseCsvRecords('"name"\r\n')).toEqual([]);
});

it('tolerates a short row rather than throwing', () => {
  expect(parseCsvRecords('"a","b","c"\r\n"1"\r\n')).toEqual([{ a: '1', b: '', c: '' }]);
});
