import { Command, CommanderError } from 'commander';
import type { ScrapeOptions } from './types.js';
import { DEFAULT_FORMATS, parseFormats } from './exporter.js';

const HELP_CODES = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

function positiveInteger(value: string, optionName: string): number {
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${optionName} must be a positive whole number.`);
  return parsed;
}

function nonNegativeInteger(value: string, optionName: string): number {
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${optionName} must be a non-negative whole number.`);
  return parsed;
}

/**
 * Bigger jobs keep more parallel slots busy, so the useful default rises with --limit.
 * Capped at 10 to stay a polite number of simultaneous requests to any one site's neighbours.
 */
export const autoConcurrency = (limit: number) => Math.min(10, Math.max(4, Math.ceil(limit / 4)));

function boundedInteger(value: string, optionName: string, max: number): number {
  const parsed = positiveInteger(value, optionName);
  if (parsed > max) throw new Error(`${optionName} must be ${max} or less.`);
  return parsed;
}

export function parseOptions(argv: string[]): ScrapeOptions {
  const command = new Command();
  command
    .name('npm run scrape --')
    .description('Search Google Maps and export public business emails and phone numbers.')
    .argument('<query>', 'Google Maps search query, for example "colleges in Chennai"')
    .option('--limit <number>', 'maximum number of listings', '20')
    .option('--output <directory>', 'export directory', 'output')
    .option('--headed', 'show the browser window')
    .option('--delay <milliseconds>', 'delay between website scans', '1200')
    .option('--timeout <milliseconds>', 'page navigation timeout', '15000')
    .option('--max-emails <number>', 'maximum emails kept per business', '25')
    .option('--concurrency <number>', 'websites scanned in parallel, 1-16 (default: automatic, 4-10 based on --limit)')
    .option('--no-deep', 'skip the extra search on sites that show no email on their obvious pages')
    .option('--web-search-fallback', 'for businesses with no website in Maps, look one up with a web search')
    .option('--resume', 'continue the last interrupted run of this same query and limit')
    .option('--skip-seen', 'skip businesses that earlier exports in the output folder already settled')
    .option('--format <formats>', 'comma-separated output formats: csv, xlsx, json, jsonl', DEFAULT_FORMATS.join(','))
    .option('--contact <type>', 'export businesses with both, emails, or phones', 'both')
    // commander writes its own error text before we ever see the exception, which would print
    // every usage error twice. Help and version still go to stdout normally.
    .configureOutput({ writeErr: () => {} })
    .exitOverride();

  try {
    command.parse(['node', 'scrape', ...argv]);
  } catch (error) {
    if (error instanceof CommanderError && HELP_CODES.has(error.code)) process.exit(0);
    const message = error instanceof Error ? error.message : 'Could not read the command options.';
    throw new Error(`${message.replace(/^error:\s*/i, '')}\nRun "npm run scrape -- --help" to see the available options.`);
  }

  const query = (command.args[0] ?? '').trim();
  if (!query) throw new Error('A Google Maps search query is required.');
  const options = command.opts<Record<string, unknown>>();
  const contactFilter = String(options.contact).toLowerCase();
  if (!['both', 'emails', 'phones'].includes(contactFilter)) throw new Error('contact must be one of: both, emails, phones.');
  const limit = positiveInteger(String(options.limit), 'limit');
  return {
    query,
    limit,
    outputDir: String(options.output).trim() || 'output',
    headed: Boolean(options.headed),
    delayMs: nonNegativeInteger(String(options.delay), 'delay'),
    timeoutMs: positiveInteger(String(options.timeout), 'timeout'),
    maxEmails: positiveInteger(String(options.maxEmails), 'max-emails'),
    concurrency: options.concurrency === undefined ? autoConcurrency(limit) : boundedInteger(String(options.concurrency), 'concurrency', 16),
    deep: options.deep !== false,
    webSearchFallback: Boolean(options.webSearchFallback),
    resume: Boolean(options.resume),
    skipSeen: Boolean(options.skipSeen),
    formats: parseFormats(String(options.format)),
    contactFilter: contactFilter as ScrapeOptions['contactFilter'],
  };
}
