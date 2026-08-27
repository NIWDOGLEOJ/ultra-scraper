import { chromium } from 'playwright';
import { collectMapsBusinesses } from './maps-collector.js';
import { DESKTOP_USER_AGENT, blockHeavyResources, scanWebsite } from './website-scanner.js';
import { exportRecords } from './exporter.js';
import { mapWithConcurrency } from './concurrency.js';
import { findWebsiteBySearch } from './web-search.js';
import { CheckpointSaver, checkpointPath, countScanned, deleteCheckpoint, pendingRecords, readCheckpoint } from './checkpoint.js';
import { businessKey, loadSeenKeys } from './seen.js';
import { Throttle } from './throttle.js';
import { ProxyRotation } from './proxy.js';
import type { BusinessRecord, ScrapeOptions } from './types.js';

export type ProgressEvent = { stage: 'starting' | 'collecting_maps' | 'searching_websites' | 'scanning_websites' | 'exporting' | 'complete' | 'interrupted' | 'failed'; message: string; processed: number; total: number; emailsFound: number };
export type RunSummary = { businessesProcessed: number; emailsFound: number; listingsCollected: number; skippedSeen: number; csvPath: string; xlsxPath: string; paths: string[] };
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

  const rotation = new ProxyRotation(options.proxies);
  // Chromium only honours a per-context proxy when the browser itself was launched with one.
  const browser = await chromium.launch({ headless: !options.headed, args: launchArgs(), proxy: rotation.first() }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not start Chromium. Run "npx playwright install chromium" first (on Linux use "npx playwright install --with-deps chromium").\n\nOriginal error: ${message}`);
  });

  const savePath = checkpointPath(options.outputDir, options.query, options.limit);
  const saver = new CheckpointSaver(savePath, { query: options.query, limit: options.limit });
  let records: BusinessRecord[] = [];
  let searchCompleted = false;
  let skippedSeen = 0;
  // Maps starts at full speed and only slows if Google pushes back; business sites start at the
  // pace the run asked for and back off from there.
  const mapsThrottle = new Throttle({ baseDelayMs: 0, maxDelayMs: options.maxDelayMs });
  const siteThrottle = new Throttle({ baseDelayMs: options.delayMs, maxDelayMs: options.maxDelayMs });

  // Ctrl-C must not throw away everything the run has already paid for.
  let aborting = false;
  const onSignal = () => {
    if (aborting) return;               // a second Ctrl-C should not race the first
    aborting = true;
    void (async () => {
      // Save once now, then again after the browser closes: shutting it down settles the scans
      // still in flight, and the second save captures whichever of them finished in time.
      await saver.save(records, searchCompleted, true).catch(() => {});
      await browser.close().catch(() => {});
      await saver.save(records, searchCompleted, true).catch(() => {});
      emit('interrupted', `Stopped. Progress saved — continue with:\n  npm run scrape -- "${options.query}" --limit ${options.limit} --resume`, countScanned(records), records.length);
      process.exit(130);
    })();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    let resumed = false;
    if (options.resume) {
      const saved = await readCheckpoint(savePath);
      if (saved) {
        records = saved.records;
        searchCompleted = saved.searchCompleted;
        resumed = true;
        emit('collecting_maps', `Resuming: ${countScanned(records)} of ${records.length} listings already done.`, countScanned(records), records.length);
      } else {
        emit('collecting_maps', 'No saved progress found for this query and limit — starting a fresh run.');
      }
    }

    if (!resumed) {
      const mapsContext = await browser.newContext({ userAgent: DESKTOP_USER_AGENT, locale: 'en-US', viewport: { width: 1366, height: 900 }, proxy: rotation.next() });
      await blockHeavyResources(mapsContext);
      emit('collecting_maps', 'Collecting Google Maps listings…');
      records = await collectMapsBusinesses(mapsContext, options, (done, total) => emit('collecting_maps', `Read listing ${done} of ${total}…`, done, total), mapsThrottle);
      await mapsContext.close().catch(() => {});

      // Drop businesses an earlier export in this folder already settled, before paying to scan
      // them again. Rows that failed last time are not treated as settled, so they get retried.
      if (options.skipSeen) {
        const seen = await loadSeenKeys(options.outputDir);
        const collected = records.length;
        records = records.filter((record) => !seen.has(businessKey(record)));
        skippedSeen = collected - records.length;
        emit('collecting_maps', skippedSeen > 0
          ? `Skipping ${skippedSeen} of ${collected} businesses already in earlier exports; ${records.length} new to scan.`
          : `No businesses from earlier exports to skip; all ${collected} are new.`, 0, records.length);
      }
      // The listing pass is the expensive part to repeat, so bank it before scanning starts.
      await saver.save(records, searchCompleted, true);
    }

    for (const record of records) if (record.status !== 'maps_error' && !record.website) record.status = 'no_website';

    if (options.webSearchFallback && !searchCompleted) {
      const missing = records.filter((record) => record.status === 'no_website');
      if (missing.length > 0) {
        let searched = 0;
        emit('searching_websites', `Looking up ${missing.length} businesses with no website in Maps…`, 0, missing.length, 0);
        await mapWithConcurrency(missing, Math.min(options.concurrency, MAX_SEARCH_CONCURRENCY), async (record) => {
          const { website, error } = await findWebsiteBySearch(browser, record.businessName, record.address, { ...options, proxy: rotation.next() });
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
      searchCompleted = true;
      await saver.save(records, searchCompleted, true);
    }

    let emailsFound = records.reduce((total, record) => total + record.emails.length, 0);
    let scanned = 0;
    const scannable = pendingRecords(records);

    emit('scanning_websites', `Scanning ${scannable.length} websites (${options.concurrency} at a time)…`, 0, scannable.length, emailsFound);
    await mapWithConcurrency(scannable, options.concurrency, async (record) => {
      if (aborting) return;             // queued work stops starting the moment Ctrl-C lands
      const scan = await scanWebsite(browser, record.website, { ...options, proxy: rotation.next() });
      Object.assign(record, scan);
      if (scan.status === 'website_blocked') siteThrottle.recordBlocked(scan.retryAfterMs);
      else siteThrottle.recordSuccess();
      emailsFound += record.emails.length;
      scanned += 1;
      const paced = siteThrottle.isBackedOff ? ` · backing off to ${(siteThrottle.delayMs / 1000).toFixed(1)}s` : '';
      emit('scanning_websites', `Scanned ${scanned} of ${scannable.length} websites…${paced}`, scanned, scannable.length, emailsFound);
      await saver.save(records, searchCompleted);
      // Politeness delay, applied per worker rather than globally, and widened if sites push back.
      await siteThrottle.wait();
    });
    await saver.flush(records, searchCompleted);

    const exportedRecords = filterRecords(records, options.contactFilter);
    emit('exporting', `Writing ${options.formats.join(', ')} files…`, exportedRecords.length, records.length, emailsFound);

    // One timestamp, so every format from a run sorts and reads as a set.
    const stampedAt = new Date();
    // One file per requested format. The status column makes every earlier "group" file — contacts,
    // no-contact, failures — a filter away, so writing them separately only duplicated the data.
    const files = await exportRecords(exportedRecords, options.outputDir, stampedAt, 'maps-emails', {
      formats: options.formats,
      meta: { query: options.query, limit: options.limit, contactFilter: options.contactFilter, listingsCollected: records.length, skippedSeen },
    });

    // The run's output is on disk now, so the saved progress has nothing left to protect.
    await deleteCheckpoint(savePath).catch(() => {});
    const summary = { ...createRunSummary(exportedRecords, records.length), skippedSeen, csvPath: files.csvPath, xlsxPath: files.xlsxPath, paths: files.paths };
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
