import { sameSite } from './domain.js';

const FILE_EXTENSION = /\.(pdf|docx?|xlsx?|pptx?|zip|rar|png|jpe?g|gif|svg|webp|mp[34]|mov)$/i;

// Lower rank wins: a real contact page beats an "about us" page for a small page budget.
const CONTACT_RANK: Array<[RegExp, number]> = [
  [/contact/i, 0],
  [/reach|connect|enquir|inquir|get.?in.?touch|write.?to.?us/i, 1],
  [/support|help.?desk|helpline/i, 2],
  [/about/i, 3],
];

// Only searched on the second pass, for sites that published nothing on the obvious pages.
// Indian college and clinic sites in particular tend to hide the address on an admissions
// or departments page rather than a contact page.
const DEEP_RANK: Array<[RegExp, number]> = [
  [/admission|apply.?now|prospectus/i, 4],
  [/location|branch|campus|find.?us|address|office/i, 5],
  [/team|staff|faculty|people|directory|department|management/i, 6],
  [/career|jobs|recruit|vacanc/i, 7],
  [/feedback|grievance|complaint/i, 8],
];

// Pages that commonly exist but are only linked from JavaScript menus, so they never appear
// in the anchor list we scraped.
export const COMMON_CONTACT_PATHS = ['/contact', '/contact-us', '/contactus', '/contact.html', '/contact.php', '/about-us', '/reach-us', '/get-in-touch'];

const rankOf = (haystack: string, deep: boolean): number => {
  for (const [pattern, rank] of deep ? [...CONTACT_RANK, ...DEEP_RANK] : CONTACT_RANK) {
    if (pattern.test(haystack)) return rank;
  }
  return Number.POSITIVE_INFINITY;
};

export function selectContactUrls(baseUrl: string, links: Array<{ href: string; text: string }>, maxPages = 3, deep = false): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const ranked = new Map<string, number>();
  for (const { href, text } of links) {
    try {
      const url = new URL(href, base);
      if (!['http:', 'https:'].includes(url.protocol) || !sameSite(url.hostname, base.hostname) || FILE_EXTENSION.test(url.pathname)) continue;
      const rank = rankOf(`${text} ${url.pathname}`, deep);
      if (!Number.isFinite(rank)) continue;
      url.hash = '';
      const key = url.toString();
      if (rank < (ranked.get(key) ?? Number.POSITIVE_INFINITY)) ranked.set(key, rank);
    } catch { /* an unparseable href is not a contact page */ }
  }
  return [...ranked.entries()].sort((a, b) => a[1] - b[1]).slice(0, maxPages).map(([url]) => url);
}

/** Guesses at contact pages that exist on many sites but are not linked from the homepage HTML. */
export function guessContactUrls(baseUrl: string, alreadySeen: Iterable<string> = []): string[] {
  let base: URL;
  try { base = new URL(baseUrl); } catch { return []; }
  const seen = new Set([...alreadySeen].map((url) => url.replace(/\/$/, '')));
  const guesses: string[] = [];
  for (const path of COMMON_CONTACT_PATHS) {
    const url = new URL(path, base).toString();
    if (!seen.has(url.replace(/\/$/, ''))) guesses.push(url);
  }
  return guesses;
}
