import type { Browser, BrowserContext, Page } from 'playwright';
import { extractEmails, selectBusinessEmails } from './email.js';
import { guessContactUrls, selectContactUrls } from './contact-links.js';
import type { WebsiteScanResult } from './types.js';
import { retryOnce } from './retry.js';
import { describeError } from './errors.js';
import { parseRetryAfter } from './throttle.js';
import type { ProxyConfig } from './proxy.js';

export const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SKIPPED_RESOURCES = new Set(['image', 'media', 'font']);
const CERT_ERROR = /ERR_CERT|ERR_SSL|SSL_ERROR|ERR_BAD_SSL/i;

export const FIRST_PASS_PAGES = 3;
/** Extra pages searched only for sites that yielded nothing on the obvious contact pages. */
export const DEEP_PASS_PAGES = 6;

/** Images, video and webfonts are never a source of contact details — and on Google Maps the
 *  map tiles and business photos are the bulk of the page weight. */
export const blockHeavyResources = (context: BrowserContext) =>
  context.route('**/*', (route) => SKIPPED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue());

export function classifyScanError(message: string): string {
  if (/timeout|timed out/i.test(message)) return 'website_timeout';
  if (/blocked|ERR_BLOCKED/i.test(message)) return 'website_blocked';
  return 'website_error';
}

type PageLink = { href: string; text: string };
type ScanOptions = { timeoutMs: number; maxEmails: number; deep: boolean; proxy?: ProxyConfig };

async function readPage(page: Page, url: string, timeoutMs: number, emails: Set<string>, contactPages: Set<string>): Promise<PageLink[]> {
  const response = await retryOnce(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }));
  if (response && [401, 403, 429].includes(response.status())) {
    // Carry the server's own instruction back up, so the run can pace itself by what it was told.
    throw Object.assign(new Error(`blocked (HTTP ${response.status()})`), { retryAfterMs: parseRetryAfter(response.headers()['retry-after']) });
  }
  // Client-rendered sites paint their contact details after DOMContentLoaded; give them a moment,
  // but never let a site that streams forever hold the run hostage.
  await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 5000) }).catch(() => {});
  const text = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 10_000) }).catch(() => '');
  const mailto = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href)).catch(() => [] as string[]);
  // Many sites publish the address as machine-readable structured data even when the visible
  // page only shows a contact form.
  const structured = await page.locator('script[type="application/ld+json"], [itemprop="email"], [data-email]')
    .evaluateAll((els) => els.map((el) => `${el.textContent ?? ''} ${el.getAttribute('data-email') ?? ''} ${el.getAttribute('content') ?? ''}`))
    .catch(() => [] as string[]);
  for (const email of extractEmails([text, ...structured].join('\n'), mailto)) emails.add(email);
  contactPages.add(page.url());
  return page.locator('a[href]').evaluateAll((els) => els.map((el) => ({ href: (el as HTMLAnchorElement).href, text: (el.textContent ?? '').trim().slice(0, 120) }))).catch(() => [] as PageLink[]);
}

async function scanOnce(browser: Browser, website: string, options: ScanOptions, ignoreHTTPSErrors: boolean): Promise<WebsiteScanResult> {
  // A fresh context per business keeps cookies, storage, popups and dialogs from one site
  // out of the next one's results, and guarantees they are torn down when the site is done.
  const context = await browser.newContext({ userAgent: DESKTOP_USER_AGENT, locale: 'en-US', viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors, proxy: options.proxy });
  const emails = new Set<string>();
  const contactPages = new Set<string>();
  const visited = new Set<string>();
  try {
    await blockHeavyResources(context);
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    page.on('dialog', (dialog) => void dialog.dismiss().catch(() => {}));

    let firstError = '';
    const visit = async (url: string): Promise<PageLink[]> => {
      visited.add(url.replace(/\/$/, ''));
      return readPage(page, url, options.timeoutMs, emails, contactPages);
    };

    let links: PageLink[];
    try {
      links = await visit(website);
    } catch (error) {
      const message = describeError(error, 'Website scan failed');
      const retryAfterMs = (error as { retryAfterMs?: number }).retryAfterMs;
      return { emails: [], contactPages: [], status: classifyScanError(message), errorMessage: message, ...(retryAfterMs ? { retryAfterMs } : {}) };
    }

    // Rank contact links against the URL we actually landed on: a site that redirects
    // apex -> www would otherwise have every one of its own links rejected as off-site.
    const landedUrl = page.url();
    visited.add(landedUrl.replace(/\/$/, ''));

    for (const url of selectContactUrls(landedUrl, links, FIRST_PASS_PAGES)) {
      if (visited.has(url.replace(/\/$/, ''))) continue;
      // A failing contact page must not discard the emails the homepage already gave us.
      try { await visit(url); }
      catch (error) { if (!firstError) firstError = describeError(error, 'Contact page failed'); }
    }

    const found = () => selectBusinessEmails([...emails], landedUrl, options.maxEmails);

    // Second pass, only for the sites that published nothing where we looked first. Widens the
    // link patterns and tries contact pages that exist but are only linked from JavaScript menus.
    if (options.deep && found().length === 0) {
      const wider = selectContactUrls(landedUrl, links, DEEP_PASS_PAGES, true);
      const candidates = [...wider, ...guessContactUrls(landedUrl, visited)].filter((url) => !visited.has(url.replace(/\/$/, '')));
      for (const url of candidates.slice(0, DEEP_PASS_PAGES)) {
        try { await visit(url); }
        catch (error) { if (!firstError) firstError = describeError(error, 'Contact page failed'); }
        if (found().length > 0) break;   // any address beats none; stop paying for more pages
      }
    }

    const selected = found();
    return {
      emails: selected,
      contactPages: [...contactPages],
      status: selected.length > 0 ? 'success' : 'no_email_found',
      errorMessage: firstError,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function scanWebsite(browser: Browser, website: string, options: ScanOptions): Promise<WebsiteScanResult> {
  const result = await scanOnce(browser, website, options, false);
  // An expired or mismatched certificate is common on small business sites and otherwise costs the
  // whole listing. Retry those — and only those — without verification, and say so in the export.
  if (result.status === 'website_error' && CERT_ERROR.test(result.errorMessage)) {
    const relaxed = await scanOnce(browser, website, options, true);
    if (relaxed.status === 'success' || relaxed.status === 'no_email_found') {
      return { ...relaxed, errorMessage: `Certificate not valid; page read without TLS verification (${result.errorMessage})` };
    }
    // The certificate was not the real obstacle — report whatever actually stopped us instead.
    if (relaxed.status !== 'website_error') return relaxed;
  }
  return result;
}
