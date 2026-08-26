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
}
