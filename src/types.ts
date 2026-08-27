import type { ExportFormat } from './exporter.js';
import type { ProxyConfig } from './proxy.js';

export interface ScrapeOptions {
  query: string;
  limit: number;
  outputDir: string;
  headed: boolean;
  delayMs: number;
  timeoutMs: number;
  maxEmails: number;
  concurrency: number;
  deep: boolean;
  webSearchFallback: boolean;
  resume: boolean;
  skipSeen: boolean;
  formats: ExportFormat[];
  maxDelayMs: number;
  proxies: ProxyConfig[];
  contactFilter: 'both' | 'emails' | 'phones';
}

export interface BusinessRecord {
  businessName: string;
  mapsUrl: string;
  category: string;
  address: string;
  phone: string;
  website: string;
  websiteSource: 'maps' | 'search';
  emails: string[];
  contactPages: string[];
  status: string;
  errorMessage: string;
}

export interface WebsiteScanResult {
  emails: string[];
  contactPages: string[];
  status: string;
  errorMessage: string;
  /** Set when the site sent a Retry-After along with its refusal. */
  retryAfterMs?: number;
}
