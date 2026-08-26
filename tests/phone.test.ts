import { expect, it } from 'vitest';
import { extractPublicPhone, phoneFromDataItemId } from '../src/phone.js';

it('reads the number from the data-item-id attribute regardless of UI language', () => {
  expect(phoneFromDataItemId('phone:tel:+914412345678')).toBe('+914412345678');
  expect(phoneFromDataItemId('phone:tel:%2B91%2044%201234%205678')).toBe('+91 44 1234 5678');
  expect(phoneFromDataItemId('address')).toBe('');
  expect(phoneFromDataItemId(null)).toBe('');
});

it('keeps a public phone value and rejects Maps action labels', () => {
  expect(extractPublicPhone('Phone: +91 44 1234 5678')).toBe('+91 44 1234 5678');
  expect(extractPublicPhone('Send to phone')).toBe('');
});
