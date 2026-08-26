import { basename } from 'node:path';
import { runScrape, type ContactFilter, type ProgressEvent } from '../run-scrape.js';
import type { ScrapeOptions } from '../types.js';

export type RunState = { status: 'idle' | 'running' | 'complete' | 'failed'; stage: string; message: string; processed: number; total: number; emailsFound: number; csvFilename: string; xlsxFilename: string; error: string };
export class RunManager {
  private state: RunState = { status: 'idle', stage: '', message: 'Ready to scrape.', processed: 0, total: 0, emailsFound: 0, csvFilename: '', xlsxFilename: '', error: '' };
  private listeners = new Set<(state: RunState) => void>();
  current = () => this.state;
  subscribe(listener: (state: RunState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(next: Partial<RunState>) { this.state = { ...this.state, ...next }; this.listeners.forEach((listener) => listener(this.state)); }
  async start(input: { query: string; limit: number; headed: boolean; contactFilter: ContactFilter }) {
    if (this.state.status === 'running') { const error = Object.assign(new Error('A scrape is already running.'), { statusCode: 409 }); throw error; }
    if (!input.query.trim() || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100 || !['both', 'emails', 'phones'].includes(input.contactFilter)) { const error = Object.assign(new Error('Enter a query, a result limit between 1 and 100, and a valid contact type.'), { statusCode: 400 }); throw error; }
    this.update({ status: 'running', stage: 'starting', message: 'Starting browser…', processed: 0, total: 0, emailsFound: 0, csvFilename: '', xlsxFilename: '', error: '' });
    void runScrape({ query: input.query.trim(), limit: input.limit, headed: input.headed, contactFilter: input.contactFilter, outputDir: 'output', delayMs: 1200, timeoutMs: 15000, maxEmails: 25, concurrency: 5, deep: true, webSearchFallback: false, resume: false, skipSeen: false, formats: ['csv', 'xlsx'], maxDelayMs: 30000, proxies: [] }, (event: ProgressEvent) => this.update({ stage: event.stage, message: event.message, processed: event.processed, total: event.total, emailsFound: event.emailsFound })).then((summary) => this.update({ status: 'complete', csvFilename: basename(summary.csvPath), xlsxFilename: basename(summary.xlsxPath) })).catch((error) => this.update({ status: 'failed', error: error instanceof Error ? error.message : 'Scrape failed.' }));
    return this.state;
  }
}
