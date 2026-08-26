import type { BrowserContext, Page } from 'playwright';
import type { BusinessRecord } from './types.js';
import { extractPublicPhone, phoneFromDataItemId } from './phone.js';
import { describeError } from './errors.js';
import { mapWithWorkers } from './concurrency.js';

const empty = (): BusinessRecord => ({ businessName: '', mapsUrl: '', category: '', address: '', phone: '', website: '', emails: [], contactPages: [], status: 'pending', errorMessage: '' });

export const mapsSearchSelector = '#searchboxinput, input[aria-label*="Search"], input[placeholder*="Search"]';
export const consentButtonSelector = 'button:has-text("Reject all"), button:has-text("Accept all"), button:has-text("I agree")';
// `hl=en` pins the UI language so the consent wall and field labels are the ones we know how to read,
// regardless of the operating system's locale.
export const mapsSearchUrl = (query: string) => `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;

// `data-item-id` is Maps' own stable hook for these rows and does not change with UI language.
export const addressSelector = '[data-item-id="address"]';
export const phoneSelector = '[data-item-id^="phone:tel:"]';
export const websiteSelector = 'a[data-item-id="authority"], a[aria-label*="Website"]';
export const categorySelector = 'button[jsaction*="category"], .DkEaL';

// Google is one host doing one job here; a handful of parallel tabs is plenty and stays well
// short of the request rate that gets a client throttled.
export const MAX_MAPS_CONCURRENCY = 6;

const textOf = async (page: Page, selector: string, timeout: number) =>
  (await page.locator(selector).first().innerText({ timeout }).catch(() => '')).trim();

const attrOf = async (page: Page, selector: string, attribute: string, timeout: number) =>
  (await page.locator(selector).first().getAttribute(attribute, { timeout }).catch(() => null)) ?? '';

async function readListing(page: Page, mapsUrl: string, timeoutMs: number, fieldTimeout: number): Promise<BusinessRecord> {
  const record = empty();
  record.mapsUrl = mapsUrl;
  try {
    await page.goto(mapsUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    record.businessName = await textOf(page, 'h1', fieldTimeout);
    record.category = await textOf(page, categorySelector, fieldTimeout);
    const addressLabel = await attrOf(page, addressSelector, 'aria-label', fieldTimeout);
    record.address = addressLabel ? addressLabel.replace(/^[^:]*:\s*/, '').trim() : await textOf(page, addressSelector, fieldTimeout);
    const phoneItemId = await attrOf(page, phoneSelector, 'data-item-id', fieldTimeout);
    record.phone = phoneFromDataItemId(phoneItemId) || extractPublicPhone(await attrOf(page, phoneSelector, 'aria-label', fieldTimeout));
    record.website = await attrOf(page, websiteSelector, 'href', fieldTimeout);
  } catch (error) {
    record.status = 'maps_error';
    record.errorMessage = describeError(error, 'Could not read Maps listing');
  }
  return record;
}

export async function collectMapsBusinesses(
  context: BrowserContext,
  options: { query: string; limit: number; timeoutMs: number; concurrency: number },
  onListing: (done: number, total: number) => void = () => {},
): Promise<BusinessRecord[]> {
  const searchPage = await context.newPage();
  // Without this every locator falls back to Playwright's 30 s default and ignores --timeout entirely.
  searchPage.setDefaultTimeout(options.timeoutMs);
  const fieldTimeout = Math.min(options.timeoutMs, 5000);

  let links: string[];
  try {
    await searchPage.goto(mapsSearchUrl(options.query), { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    const search = searchPage.locator(mapsSearchSelector).first();
    if (!await search.isVisible({ timeout: fieldTimeout }).catch(() => false)) {
      const consent = searchPage.locator(consentButtonSelector).first();
      if (await consent.isVisible({ timeout: fieldTimeout }).catch(() => false)) await consent.click({ timeout: fieldTimeout });
    }

    const feed = searchPage.locator('[role="feed"]');
    await feed.waitFor({ timeout: options.timeoutMs }).catch(() => {
      throw new Error('Google Maps did not return a results list. Try --headed to see what the page is showing, or run the search again.');
    });

    let stale = 0; let last = 0;
    while (stale < 3) {
      const count = await feed.locator('a[href*="/maps/place/"]').count();
      if (count >= options.limit) break;
      await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight));
      await searchPage.waitForTimeout(800);
      stale = count === last ? stale + 1 : 0;
      last = count;
    }

    links = await feed.locator('a[href*="/maps/place/"]')
      .evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLAnchorElement).href))])
      .then((urls) => urls.slice(0, options.limit));
  } finally {
    await searchPage.close().catch(() => {});
  }

  // Silently exporting an empty file looks like "this category has no businesses" when it really means
  // the page never loaded listings.
  if (links.length === 0) throw new Error(`Google Maps returned no listings for "${options.query}". Check the spelling, try a broader search, or run with --headed to see the page.`);

  let done = 0;
  return mapWithWorkers(
    links,
    Math.min(options.concurrency, MAX_MAPS_CONCURRENCY),
    async () => { const page = await context.newPage(); page.setDefaultTimeout(options.timeoutMs); return page; },
    async (page, mapsUrl) => {
      const record = await readListing(page, mapsUrl, options.timeoutMs, fieldTimeout);
      onListing(++done, links.length);
      return record;
    },
    async (page) => { await page.close().catch(() => {}); },
  );
}
