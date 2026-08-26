import { expect, it } from 'vitest';
import { selectContactUrls } from '../src/contact-links.js';

const link = (href: string, text = '') => ({ href, text });

it('prefers a real contact page over an about page for the small page budget', () => {
  const links = [link('https://cafe.in/about-us', 'About us'), link('https://cafe.in/support', 'Support'), link('https://cafe.in/contact', 'Contact')];
  expect(selectContactUrls('https://cafe.in/', links, 2)).toEqual(['https://cafe.in/contact', 'https://cafe.in/support']);
});

it('keeps www and apex on the same site so a redirect does not drop every link', () => {
  expect(selectContactUrls('https://cafe.in/', [link('https://www.cafe.in/contact', 'Contact')])).toEqual(['https://www.cafe.in/contact']);
});

it('rejects other sites, downloads and non-http links', () => {
  const links = [link('https://facebook.com/contact', 'Contact'), link('https://cafe.in/brochure.pdf', 'Contact'), link('javascript:void(0)', 'Contact'), link('mailto:hi@cafe.in', 'Contact'), link('tel:+914412345678', 'Contact')];
  expect(selectContactUrls('https://cafe.in/', links)).toEqual([]);
});

it('ignores pages with no contact signal at all', () => {
  expect(selectContactUrls('https://cafe.in/', [link('https://cafe.in/menu', 'Our menu'), link('https://cafe.in/gallery', 'Gallery')])).toEqual([]);
});
