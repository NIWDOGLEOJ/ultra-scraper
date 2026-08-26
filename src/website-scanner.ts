import type { Browser, BrowserContext, Page } from 'playwright';
import { extractEmails, selectBusinessEmails } from './email.js';
import { selectContactUrls } from './contact-links.js';
import type { WebsiteScanResult } from './types.js';
import { retryOnce } from './retry.js';
import { describeError } from './errors.js';

export const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SKIPPED_RESOURCES = new Set(['image', 'media', 'font']);

/** Images, video and webfonts are never a source of contact details — and on Google Maps the
 *  map tiles and business photos are the bulk of the page weight. */
export const blockHeavyResources = (context: BrowserContext) =>
  context.route('**/*', (route) => SKIPPED_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue());
const CERT_ERROR = /ERR_CERT|ERR_SSL|SSL_ERROR|ERR_BAD_SSL/i;

export function classifyScanError(message: string): string {
  if (/timeout|timed out/i.test(message)) return 'website_timeout';
  if (/blocked|ERR_BLOCKED/i.test(message)) return 'website_blocked';
  return 'website_error';
}

type PageLink = { href: string; text: string };
type ScanOptions = { timeoutMs: number; maxEmails: number };

async function readPage(page: Page, url: string, timeoutMs: number, emails: Set<string>, contactPages: Set<string>): Promise<PageLink[]> {
  const response = await retryOnce(() => page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }));
  if (response && [401, 403, 429].includes(response.status())) throw new Error(`blocked (HTTP ${response.status()})`);
  // Client-rendered sites paint their contact details after DOMContentLoaded; give them a moment,
  // but never let a site that streams forever hold the run hostage.
  await page.waitForLoadState('load', { timeout: Math.min(timeoutMs, 5000) }).catch(() => {});
  const text = await page.locator('body').innerText({ timeout: Math.min(timeoutMs, 10_000) }).catch(() => '');
  const mailto = await page.locator('a[href^="mailto:"]').evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href)).catch(() => [] as string[]);
  for (const email of extractEmails(text, mailto)) emails.add(email);
  contactPages.add(page.url());
  return page.locator('a[href]').evaluateAll((els) => els.map((el) => ({ href: (el as HTMLAnchorElement).href, text: (el.textContent ?? '').trim().slice(0, 120) }))).catch(() => [] as PageLink[]);
}

async function scanOnce(browser: Browser, website: string, options: ScanOptions, ignoreHTTPSErrors: boolean): Promise<WebsiteScanResult> {
  // A fresh context per business keeps cookies, storage, popups and dialogs from one site
  // out of the next one's results, and guarantees they are torn down when the site is done.
  const context = await browser.newContext({ userAgent: DESKTOP_USER_AGENT, locale: 'en-US', viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors });
  const emails = new Set<string>();
  const contactPages = new Set<string>();
  try {
    await blockHeavyResources(context);
    const page = await context.newPage();
    page.setDefaultTimeout(options.timeoutMs);
    page.on('dialog', (dialog) => void dialog.dismiss().catch(() => {}));

    let links: PageLink[];
    try {
      links = await readPage(page, website, options.timeoutMs, emails, contactPages);
    } catch (error) {
      const message = describeError(error, 'Website scan failed');
      return { emails: [], contactPages: [], status: classifyScanError(message), errorMessage: message };
    }

    // Rank contact links against the URL we actually landed on: a site that redirects
    // apex -> www would otherwise have every one of its own links rejected as off-site.
    const landedUrl = page.url();
    let firstContactError = '';
    for (const url of selectContactUrls(landedUrl, links)) {
      if (url === page.url()) continue;
      // A failing contact page must not discard the emails the homepage already gave us.
      try { await readPage(page, url, options.timeoutMs, emails, contactPages); }
      catch (error) { if (!firstContactError) firstContactError = describeError(error, 'Contact page failed'); }
    }

    const selected = selectBusinessEmails([...emails], landedUrl, options.maxEmails);
    return {
      emails: selected,
      contactPages: [...contactPages],
      status: selected.length > 0 ? 'success' : 'no_email_found',
      errorMessage: firstContactError,
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
