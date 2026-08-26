import { expect, it } from 'vitest';
import { MAX_MAPS_CONCURRENCY, addressSelector, consentButtonSelector, mapsSearchUrl, phoneSelector, websiteSelector } from '../src/maps-collector.js';

it('pins the Maps UI to English so field labels and the consent wall are readable on any OS locale', () => {
  const url = new URL(mapsSearchUrl('colleges in chennai'));
  expect(url.pathname).toBe('/maps/search/colleges%20in%20chennai');
  expect(url.searchParams.get('hl')).toBe('en');
});

it('has a non-binding Google consent fallback before waiting for Maps', () => {
  expect(consentButtonSelector).toContain('Reject all');
});

it('reads listing fields through language-independent data-item-id hooks', () => {
  expect(addressSelector).toContain('data-item-id="address"');
  expect(phoneSelector).toContain('data-item-id^="phone:tel:"');
  expect(websiteSelector).toContain('data-item-id="authority"');
});

it('keeps parallel Maps tabs to a modest number regardless of --concurrency', () => {
  expect(MAX_MAPS_CONCURRENCY).toBeLessThanOrEqual(6);
});
