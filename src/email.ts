import { registrableDomain } from './domain.js';

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,24}/gi;
const VALID_EMAIL = /^[A-Z0-9](?:[A-Z0-9._%+-]*[A-Z0-9_%+-])?@[A-Z0-9][A-Z0-9.-]*\.[A-Z]{2,24}$/i;
// "logo@2x.png" and friends match the email shape but are asset filenames.
const ASSET_LIKE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|css|js|mjs|cjs|json|xml|pdf|zip|rar|mp[34]|mov|avi|webm|woff2?|ttf|eot)$/i;
const NOISE_DOMAINS = new Set(['example.com', 'example.org', 'example.net', 'domain.com', 'yourdomain.com', 'your-domain.com', 'email.com', 'test.com', 'mysite.com', 'website.com', 'company.com', 'sentry.io', 'wixpress.com']);
const NOISE_SUFFIX = /\.(wixpress\.com|sentry\.io|cloudfront\.net|googleusercontent\.com)$/i;
// innerText concatenates adjacent inline nodes, so a phone number printed beside an address
// arrives glued to it: "044-12345678enquiry@yahoo.com". Strip the number, keep the address.
const GLUED_PHONE_PREFIX = /^[+(]?\d[\d\-+().\s]{4,}(?=[a-z])/i;

const FREEMAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'yahoo.co.uk', 'ymail.com', 'hotmail.com', 'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com', 'protonmail.com', 'proton.me', 'rediffmail.com', 'zoho.com', 'zohomail.in', 'mail.com', 'gmx.com', 'yandex.com']);
const ROLE_ADDRESS = /^(?:info|contact|contactus|admin|administration|admission|admissions|office|enquiry|enquiries|inquiry|inquiries|mail|email|hello|help|support|principal|director|hr|careers|jobs|sales|marketing|reception|frontdesk|secretary|registrar|dean|manager|service|customercare|care)\b/i;

const domainOf = (email: string) => email.slice(email.indexOf('@') + 1);

// Only the bracketed forms are treated as obfuscation. A bare " at " is far too common in
// ordinary prose ("meet us at noon") to rewrite safely.
const OBFUSCATED_AT = /\s*[[({<]\s*(?:at|@)\s*[\])}>]\s*/gi;
const OBFUSCATED_DOT = /\s*[[({<]\s*(?:dot|\.)\s*[\])}>]\s*/gi;
const NUMERIC_ENTITY = /&#(\d{1,7});/g;
const HEX_ENTITY = /&#x([0-9a-f]{1,6});/gi;

const codePoint = (value: number) => (value > 0 && value <= 0x10FFFF ? String.fromCodePoint(value) : '');

/**
 * Restores addresses a site published for human readers rather than for parsers:
 * "info [at] college [dot] edu" and "info&#64;college.edu" are both plainly visible on the page.
 */
export function readableText(text: string): string {
  return text
    .replace(NUMERIC_ENTITY, (_, digits: string) => codePoint(Number(digits)))
    .replace(HEX_ENTITY, (_, hex: string) => codePoint(parseInt(hex, 16)))
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(OBFUSCATED_AT, '@')
    .replace(OBFUSCATED_DOT, '.');
}

function expandMailto(href: string): string[] {
  let raw = href.replace(/^mailto:/i, '').split('?')[0] ?? '';
  try { raw = decodeURIComponent(raw); } catch { /* a malformed escape is still worth scanning as-is */ }
  return raw.split(/[,;]/);
}

function normalise(candidate: string): string {
  const trimmed = candidate.trim().toLowerCase().replace(/^[<("']+/, '').replace(/[>)"'.,;:]+$/, '');
  const at = trimmed.indexOf('@');
  const value = at > 0 ? trimmed.slice(0, at).replace(GLUED_PHONE_PREFIX, '') + trimmed.slice(at) : trimmed;
  if (!VALID_EMAIL.test(value) || ASSET_LIKE.test(value)) return '';
  const domain = domainOf(value);
  return NOISE_DOMAINS.has(domain) || NOISE_SUFFIX.test(domain) ? '' : value;
}

export function extractEmails(text: string, mailtoHrefs: string[] = []): string[] {
  const candidates = [...mailtoHrefs.flatMap(expandMailto), ...(readableText(text).match(EMAIL_PATTERN) ?? [])];
  return [...new Set(candidates.map(normalise).filter(Boolean))];
}

/**
 * Keeps the addresses that plausibly belong to the business being scanned.
 * Third-party domains are dropped when the business's own or a freemail address was found,
 * and the total is capped so one staff-directory page cannot flood a row.
 */
export function selectBusinessEmails(emails: string[], siteUrl: string, maxEmails = 25): string[] {
  const limit = Math.max(1, maxEmails);
  let site = '';
  try { site = registrableDomain(new URL(siteUrl).hostname); } catch { /* unparseable site URL: fall back to freemail/other */ }
  const own: string[] = []; const freemail: string[] = []; const other: string[] = [];
  for (const email of emails) {
    const domain = domainOf(email);
    if (site && (domain === site || domain.endsWith(`.${site}`))) own.push(email);
    else if (FREEMAIL.has(domain)) freemail.push(email);
    else other.push(email);
  }
  const preferred = [...own, ...freemail];
  const pool = preferred.length > 0 ? preferred : other.slice(0, 5);
  return [...pool].sort((a, b) => Number(ROLE_ADDRESS.test(b)) - Number(ROLE_ADDRESS.test(a))).slice(0, limit);
}
