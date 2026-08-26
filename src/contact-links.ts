import { sameSite } from './domain.js';

const FILE_EXTENSION = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|png|jpe?g|gif|svg|webp|mp[34]|mov)$/i;
// Lower rank wins: a real contact page beats an "about us" page for the small page budget.
const CONTACT_RANK: Array<[RegExp, number]> = [[/contact/i, 0], [/reach|connect|enquir|inquir/i, 1], [/support|help/i, 2], [/about/i, 3]];

const rankOf = (haystack: string): number => {
  for (const [pattern, rank] of CONTACT_RANK) if (pattern.test(haystack)) return rank;
  return Number.POSITIVE_INFINITY;
};

export function selectContactUrls(baseUrl: string, links: Array<{ href: string; text: string }>, maxPages = 3): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const ranked = new Map<string, number>();
  for (const { href, text } of links) {
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol) || !sameSite(url.hostname, base.hostname) || FILE_EXTENSION.test(url.pathname)) continue;
      const rank = rankOf(`${text} ${url.pathname}`);
      if (!Number.isFinite(rank)) continue;
      url.hash = '';
      const key = url.toString();
      if (rank < (ranked.get(key) ?? Number.POSITIVE_INFINITY)) ranked.set(key, rank);
    } catch { /* an unparseable href is not a contact page */ }
  }
  return [...ranked.entries()].sort((a, b) => a[1] - b[1]).slice(0, maxPages).map(([url]) => url);
}
