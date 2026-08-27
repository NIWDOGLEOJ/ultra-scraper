import type { Browser } from 'playwright';
import { registrableDomain } from './domain.js';
import { DESKTOP_USER_AGENT, blockHeavyResources } from './website-scanner.js';
import { describeError } from './errors.js';
import type { ProxyConfig } from './proxy.js';

/**
 * Hosts that describe businesses rather than being them: directories, aggregators, review
 * sites, marketplaces and social profiles. Add to this list as new ones turn up.
 * Site builders (wixsite.com, wordpress.com, blogspot.com) are deliberately absent — a small
 * business's real site often lives on one.
 */
export const BLOCKED_HOSTS = [
  // Directories and aggregators
  'justdial.com', 'yellowpages.com', 'yellowpages.in', 'indiamart.com', 'sulekha.com', 'tradeindia.com',
  'indiacom.com', 'grotal.com', 'asklaila.com', 'yellowpages.co.in', 'indianyellowpages.com',
  // Reviews and travel
  'yelp.com', 'tripadvisor.com', 'tripadvisor.in', 'zomato.com', 'swiggy.com', 'makemytrip.com',
  'goibibo.com', 'booking.com', 'agoda.com', 'trustpilot.com',
  // Social
  'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com',
  'pinterest.com', 'tumblr.com', 'whatsapp.com', 't.me', 'telegram.me', 'threads.net',
  // Search engines and maps
  'google.com', 'google.co.in', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'mapquest.com', 'foursquare.com',
  // Reference and forums
  'wikipedia.org', 'wikimedia.org', 'quora.com', 'reddit.com', 'medium.com',
  // Sector aggregators
  'practo.com', 'lybrate.com', 'shiksha.com', 'collegedunia.com', 'careers360.com', 'getmyuni.com',
  'collegesearch.in', 'indiastudychannel.com', 'urbanpro.com', 'ambitionbox.com', 'glassdoor.com',
  'indeed.com', 'naukri.com', 'olx.in', 'quikr.com', 'magicbricks.com', '99acres.com',
  'amazon.in', 'amazon.com', 'flipkart.com', 'indiatimes.com',
];

/** Words that carry no identifying weight when comparing a business name to a search result. */
const GENERIC_WORDS = new Set([
  'the', 'and', 'of', 'in', 'at', 'for', 'a', 'an', 'on', 'to', 'by', 'with',
  'pvt', 'ltd', 'private', 'limited', 'llp', 'inc', 'co', 'corp', 'company', 'org',
  'official', 'website', 'home', 'homepage', 'welcome', 'best', 'top',
]);

export type SearchResult = { title: string; href: string };

export const isBlockedHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return BLOCKED_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
};

/** Splits a name into lowercase alphanumeric tokens, dropping words that identify nothing. */
export function nameTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token.length > 1 && !GENERIC_WORDS.has(token));
}

/**
 * Fraction of the business name's distinctive words that appear in a search result's title or
 * domain. Domains are also matched as substrings, since "Loyola College" lives at loyolacollege.edu.
 */
export function nameMatchScore(businessName: string, candidateText: string): number {
  const wanted = nameTokens(businessName);
  if (wanted.length === 0) return 0;
  const haystackTokens = new Set(nameTokens(candidateText));
  const haystackRun = candidateText.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const hits = wanted.filter((token) => haystackTokens.has(token) || (token.length >= 4 && haystackRun.includes(token)));
  return hits.length / wanted.length;
}

/**
 * Accepts a candidate only when the name genuinely lines up: at least half of the business's
 * distinctive words present, and at least one substantial word among them. A weak match is
 * rejected outright rather than guessed at.
 */
export function isConfidentMatch(businessName: string, title: string, hostname: string): boolean {
  const wanted = nameTokens(businessName);
  if (wanted.length === 0) return false;
  const candidateText = `${title} ${hostname.replace(/[.-]/g, ' ')} ${hostname}`;
  if (nameMatchScore(businessName, candidateText) < 0.5) return false;
  const haystackRun = candidateText.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const haystackTokens = new Set(nameTokens(candidateText));
  return wanted.some((token) => token.length >= 4 && (haystackTokens.has(token) || haystackRun.includes(token)));
}

export const buildSearchQuery = (businessName: string, address: string) => `"${businessName}" ${address}`.trim();
export const searchUrl = (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=en-IN`;
export const RESULT_SELECTOR = '#b_results li.b_algo h2 a';
export const BRAVE_API_URL = 'https://api.search.brave.com/res/v1/web/search';

const fromBase64Url = (value: string) => {
  try { return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
  catch { return ''; }
};

/** Search engines wrap their result links in click-tracking redirects. */
export function unwrapRedirect(href: string): string {
  const trimmed = href.trim();
  // An organic result is always an absolute link or a wrapped one. Anything relative would only
  // resolve against the search engine's own domain, which is never the answer we want.
  if (!/^(?:https?:)?\/\//i.test(trimmed)) return '';
  try {
    const url = new URL(trimmed, 'https://www.bing.com');
    // DuckDuckGo: /l/?uddg=<percent-encoded target>
    const ddg = url.searchParams.get('uddg');
    if (ddg) return /^https?:\/\//i.test(ddg) ? ddg : '';
    // Bing: /ck/a?...&u=a1<base64url target>
    const bing = url.searchParams.get('u');
    if (bing) {
      const decoded = fromBase64Url(bing.startsWith('a1') ? bing.slice(2) : bing);
      return /^https?:\/\//i.test(decoded) ? decoded : '';
    }
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

/**
 * Takes the first organic result that is not a directory or social host, and returns it only if
 * the name check passes. A failed check means no website, not a different guess.
 */
export function chooseCandidate(businessName: string, results: readonly SearchResult[]): string {
  for (const result of results) {
    const url = unwrapRedirect(result.href);
    if (!url) continue;
    let hostname: string;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      hostname = parsed.hostname;
    } catch {
      continue;
    }
    if (isBlockedHost(hostname) || registrableDomain(hostname) === '') continue;
    // First non-blocked result only: if it does not match, we stop rather than reach further down
    // the page for something that merely looks plausible.
    return isConfidentMatch(businessName, result.title, hostname) ? url : '';
  }
  return '';
}

/**
 * Reads organic results from a search API. Free search engines block automated queries
 * (DuckDuckGo answers 403; Bing serves degraded results to a headless browser), so an API key
 * is the only way to get dependable results. Set BRAVE_SEARCH_API_KEY to use this path.
 */
export async function fetchApiResults(query: string, apiKey: string, timeoutMs: number): Promise<SearchResult[]> {
  const response = await fetch(`${BRAVE_API_URL}?q=${encodeURIComponent(query)}&count=5`, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`search API returned HTTP ${response.status}`);
  const body = await response.json() as { web?: { results?: Array<{ title?: string; url?: string }> } };
  return (body.web?.results ?? []).map((result) => ({ title: result.title ?? '', href: result.url ?? '' }));
}

/** Fallback path with no API key: read a results page in the browser we already have running. */
export async function fetchBrowserResults(browser: Browser, query: string, timeoutMs: number, proxy?: ProxyConfig): Promise<SearchResult[]> {
  const context = await browser.newContext({ userAgent: DESKTOP_USER_AGENT, locale: 'en-IN', viewport: { width: 1366, height: 900 }, proxy });
  try {
    await blockHeavyResources(context);
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);
    await page.goto(searchUrl(query), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    return await page.locator(RESULT_SELECTOR)
      .evaluateAll((els) => els.slice(0, 5).map((el) => ({ title: (el.textContent ?? '').trim(), href: el.getAttribute('href') ?? '' })))
      .catch(() => [] as SearchResult[]);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function findWebsiteBySearch(browser: Browser, businessName: string, address: string, options: { timeoutMs: number; proxy?: ProxyConfig }): Promise<{ website: string; error: string }> {
  if (!businessName.trim()) return { website: '', error: '' };
  const query = buildSearchQuery(businessName, address);
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  try {
    const results = apiKey
      ? await fetchApiResults(query, apiKey, options.timeoutMs)
      : await fetchBrowserResults(browser, query, options.timeoutMs, options.proxy);
    if (results.length === 0) return { website: '', error: 'search returned no results' };
    return { website: chooseCandidate(businessName, results), error: '' };
  } catch (error) {
    return { website: '', error: describeError(error, 'Web search failed') };
  }
}
