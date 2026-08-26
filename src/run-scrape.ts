import { chromium } from 'playwright';
import { collectMapsBusinesses } from './maps-collector.js';
import { DESKTOP_USER_AGENT, blockHeavyResources, scanWebsite } from './website-scanner.js';
import { exportRecords, splitRecordsByOutcome } from './exporter.js';
import { mapWithConcurrency } from './concurrency.js';
import { findWebsiteBySearch } from './web-search.js';
import type { BusinessRecord, ScrapeOptions } from './types.js';

export type ProgressEvent = { stage: 'starting' | 'collecting_maps' | 'searching_websites' | 'scanning_websites' | 'exporting' | 'complete' | 'failed'; message: string; processed: number; total: number; emailsFound: number };
export type RunSummary = { businessesProcessed: number; emailsFound: number; listingsCollected: number; csvPath: string; xlsxPath: string };
export type ContactFilter = 'both' | 'emails' | 'phones';

export const createRunSummary = (records: Array<Pick<BusinessRecord, 'emails'>>, listingsCollected = records.length) => ({ businessesProcessed: records.length, emailsFound: records.reduce((total, record) => total + record.emails.length, 0), listingsCollected });
export const filterRecords = <T extends Pick<BusinessRecord, 'emails' | 'phone'>>(records: T[], filter: ContactFilter) => filter === 'emails' ? records.filter((record) => record.emails.length > 0) : filter === 'phones' ? records.filter((record) => Boolean(record.phone.trim())) : records;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One search engine serving every lookup deserves a lighter touch than a spread of business sites. */
export const MAX_SEARCH_CONCURRENCY = 3;

/**
 * Chromium's setuid sandbox cannot start as root (Docker, CI, some WSL setups), so it is disabled
 * only in that case — an ordinary Linux user keeps the sandbox while browsing unknown sites.
 * `--disable-dev-shm-usage` avoids renderer crashes where /dev/shm is tiny, which is the container default.
 */
export function launchArgs(platform: NodeJS.Platform = process.platform, uid: number | undefined = process.getuid?.()): string[] {
  if (platform !== 'linux') return [];
  return uid === 0 ? ['--disable-dev-shm-usage', '--no-sandbox'] : ['--disable-dev-shm-usage'];
}

export async function runScrape(options: ScrapeOptions, onProgress: (event: ProgressEvent) => void = () => {}): Promise<RunSummary> {
  const emit = (stage: ProgressEvent['stage'], message: string, processed = 0, total = 0, emailsFound = 0) => onProgress({ stage, message, processed, total, emailsFound });
  emit('starting', 'Starting browser…');

  const browser = await chromium.launch({ headless: !options.headed, args: launchArgs() }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not start Chromium. Run "npx playwright install chromium" first (on Linux use "npx playwright install --with-deps chromium").\n\nOriginal error: ${message}`);
  });

  // Without this, Ctrl-C leaves an orphaned Chromium process behind on every platform.
  const onSignal = () => { void browser.close().catch(() => {}).finally(() => process.exit(130)); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    const mapsContext = await browser.newContext({ userAgent: DESKTOP_USER_AGENT, locale: 'en-US', viewport: { width: 1366, height: 900 } });
    await blockHeavyResources(mapsContext);
    emit('collecting_maps', 'Collecting Google Maps listings…');
    const records = await collectMapsBusinesses(mapsContext, options, (done, total) => emit('collecting_maps', `Read listing ${done} of ${total}…`, done, total));
    await mapsContext.close().catch(() => {});

    for (const record of records) if (record.status !== 'maps_error' && !record.website) record.status = 'no_website';

    if (options.webSearchFallback) {
      const missing = records.filter((record) => record.status === 'no_website');
      if (missing.length > 0) {
        let searched = 0;
        emit('searching_websites', `Looking up ${missing.length} businesses with no website in Maps…`, 0, missing.length, 0);
        await mapWithConcurrency(missing, Math.min(options.concurrency, MAX_SEARCH_CONCURRENCY), async (record) => {
          const { website, error } = await findWebsiteBySearch(browser, record.businessName, record.address, options);
          if (website) {
            record.website = website;
            record.websiteSource = 'search';
            record.status = 'pending';          // rejoins the normal scanning pipeline
          } else if (error) {
            record.errorMessage = error;
          }
          searched += 1;
          emit('searching_websites', `Looked up ${searched} of ${missing.length}…`, searched, missing.length, 0);
          await pause(options.delayMs);
        });
      }
    }

    let emailsFound = 0;
    let scanned = 0;
    const scannable = records.filter((record) => record.status !== 'maps_error' && record.website);

    emit('scanning_websites', `Scanning ${scannable.length} websites (${options.concurrency} at a time)…`, 0, scannable.length, 0);
    await mapWithConcurrency(scannable, options.concurrency, async (record) => {
      Object.assign(record, await scanWebsite(browser, record.website, options));
      emailsFound += record.emails.length;
      scanned += 1;
      emit('scanning_websites', `Scanned ${scanned} of ${scannable.length} websites…`, scanned, scannable.length, emailsFound);
      // Politeness delay, applied per worker rather than globally.
      await pause(options.delayMs);
    });

    const exportedRecords = filterRecords(records, options.contactFilter);
    emit('exporting', 'Creating CSV and Excel files…', exportedRecords.length, records.length, emailsFound);

    // One timestamp for the whole run, so a run's four files sort and read as a set.
    const stampedAt = new Date();
    const groups = splitRecordsByOutcome(records);
    const [files] = await Promise.all([
      exportRecords(exportedRecords, options.outputDir, stampedAt),
      exportRecords(groups.contacts, options.outputDir, stampedAt, 'contacts'),
      exportRecords(groups.noContact, options.outputDir, stampedAt, 'no-contact'),
      exportRecords(groups.failures, options.outputDir, stampedAt, 'failures'),
    ]);

    const summary = { ...createRunSummary(exportedRecords, records.length), ...files };
    emit('complete', `Finished. ${summary.businessesProcessed} of ${summary.listingsCollected} listings matched your filter.`, summary.businessesProcessed, summary.listingsCollected, emailsFound);
    return summary;
  } catch (error) {
    emit('failed', error instanceof Error ? error.message : 'Scrape failed.');
    throw error;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await browser.close().catch(() => {});
  }
}
