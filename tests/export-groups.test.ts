import { expect, it } from 'vitest';
import { splitRecordsByOutcome } from '../src/exporter.js';

it('splits records into contacts, no-contact, and failures', () => {
  const rows = [{ phone: '+91 1', emails: [], status: 'success' }, { phone: '', emails: [], status: 'no_email_found' }, { phone: '', emails: [], status: 'website_timeout' }];
  expect(splitRecordsByOutcome(rows)).toEqual({ contacts: [rows[0]], noContact: [rows[1]], failures: [rows[2]] });
});

it('keeps a business whose website failed but whose Maps phone is usable in the contacts export', () => {
  const rows = [{ phone: '+91 44 1234 5678', emails: [], status: 'website_timeout' }];
  expect(splitRecordsByOutcome(rows)).toEqual({ contacts: [rows[0]], noContact: [], failures: [] });
});
