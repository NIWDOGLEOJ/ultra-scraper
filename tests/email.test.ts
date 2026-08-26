import { expect, it } from 'vitest';
import { extractEmails, selectBusinessEmails } from '../src/email.js';
import { registrableDomain, sameSite } from '../src/domain.js';

it('extracts addresses from text and mailto links, and drops asset filenames', () => {
  const text = 'Write to Info@College.edu.in or admissions@college.edu.in. Logo: logo@2x.png';
  expect(extractEmails(text)).toEqual(['info@college.edu.in', 'admissions@college.edu.in']);
});

it('expands multi-recipient and percent-encoded mailto links instead of discarding them', () => {
  expect(extractEmails('', ['mailto:a@school.edu.in,b@school.edu.in?subject=Hi'])).toEqual(['a@school.edu.in', 'b@school.edu.in']);
  expect(extractEmails('', ['mailto:office%40school.edu.in'])).toEqual(['office@school.edu.in']);
});

it('strips surrounding punctuation that innerText glues onto an address', () => {
  expect(extractEmails('Contact (hello@cafe.in), or visit us.')).toEqual(['hello@cafe.in']);
});

it('ignores placeholder and analytics domains', () => {
  expect(extractEmails('you@example.com abc@sentry.io real@bakery.in')).toEqual(['real@bakery.in']);
});

it('reduces a hostname to the domain the business owns', () => {
  expect(registrableDomain('www.citycollege.edu.in')).toBe('citycollege.edu.in');
  expect(registrableDomain('mail.bakery.in')).toBe('bakery.in');
  expect(registrableDomain('bbc.co.uk')).toBe('bbc.co.uk');
  expect(sameSite('www.cafe.com', 'cafe.com')).toBe(true);
  expect(sameSite('cafe.com', 'other.com')).toBe(false);
});

it('drops unrelated third-party addresses once the business own or freemail ones are found', () => {
  const found = ['admin@othercollege.edu.in', 'helpline@statehelpline.in', 'principal@citycollege.ac.in', 'citycollege@gmail.com'];
  expect(selectBusinessEmails(found, 'https://www.citycollege.ac.in/')).toEqual(['principal@citycollege.ac.in', 'citycollege@gmail.com']);
});

it('falls back to third-party addresses only when nothing better was found', () => {
  expect(selectBusinessEmails(['someone@elsewhere.org'], 'https://cafe.in')).toEqual(['someone@elsewhere.org']);
});

it('caps a staff-directory page and puts role addresses first', () => {
  const staff = Array.from({ length: 60 }, (_, i) => `person${i}@college.edu.in`);
  const selected = selectBusinessEmails([...staff, 'info@college.edu.in'], 'https://college.edu.in', 25);
  expect(selected).toHaveLength(25);
  expect(selected[0]).toBe('info@college.edu.in');
});

it('unglues a phone number that innerText concatenated onto an address', () => {
  expect(extractEmails('Ph 044-12345678enquiry@yahoo.com')).toEqual(['enquiry@yahoo.com']);
  expect(extractEmails('call 1800-123-4567support@firm.in')).toEqual(['support@firm.in']);
});

it('does not mangle addresses that legitimately contain digits', () => {
  expect(extractEmails('schooladmission2023@gmail.com 123@college.edu.in 2023admissions@school.in')).toEqual(['schooladmission2023@gmail.com', '123@college.edu.in', '2023admissions@school.in']);
});
