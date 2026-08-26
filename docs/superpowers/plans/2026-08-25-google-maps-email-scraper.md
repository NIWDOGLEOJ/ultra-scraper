# Google Maps Public Email Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Playwright CLI that collects public Google Maps business details, scans listed business websites for publicly posted emails, and exports CSV and Excel files.

**Architecture:** A command-line entry point validates configuration and coordinates a Google Maps collector, a bounded same-domain website scanner, and a safe exporter. Pure parsing and exporting modules have fixture-based tests; browser-facing code is isolated behind small collector/scanner interfaces.

**Tech Stack:** Node.js 20+, TypeScript, Playwright, Commander, ExcelJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-google-maps-email-scraper-design.md`

## Global Constraints

- Collect only business details publicly visible in Maps and email addresses actually published on the business's public website.
- Do not sign in, solve or bypass CAPTCHAs, circumvent access controls, or infer email addresses.
- Default result limit is exactly `20`; failures must be isolated to one listing.
- Exports must be timestamped CSV and `.xlsx` files with identical defined columns.
- Formula-like scraped values must be neutralized in both export formats.
- Browser tests must use fixtures/mocked pages, not live Google Maps.

---

## File structure

- `package.json` — scripts and dependencies.
- `tsconfig.json`, `vitest.config.ts` — TypeScript/test configuration.
- `src/types.ts` — shared business record, scan result, and configuration types.
- `src/config.ts` — CLI options validation and defaults.
- `src/email.ts` — pure email extraction and normalization.
- `src/contact-links.ts` — pure safe same-domain contact-page selection.
- `src/maps-collector.ts` — Maps search/result collection using Playwright.
- `src/website-scanner.ts` — bounded public-site scanning using Playwright.
- `src/exporter.ts` — safe CSV/XLSX generation.
- `src/index.ts` — command orchestration and terminal summary.
- `tests/*.test.ts` — fixture-based unit/component tests.
- `README.md` — setup, usage, limits, and responsible-use notes.

### Task 1: Create the TypeScript CLI foundation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/types.ts`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
- Produces `ScrapeOptions`, `BusinessRecord`, `WebsiteScanResult`, and `parseOptions(argv: string[]): ScrapeOptions`.

- [ ] **Step 1: Write the failing configuration tests**

```ts
import { describe, expect, it } from 'vitest';
import { parseOptions } from '../src/config.js';

describe('parseOptions', () => {
  it('uses safe defaults', () => {
    expect(parseOptions(['cafes in Chennai'])).toMatchObject({
      query: 'cafes in Chennai', limit: 20, outputDir: 'output', headed: false,
      delayMs: 1200, timeoutMs: 15000,
    });
  });
  it('rejects an empty query and limits below one', () => {
    expect(() => parseOptions(['', '--limit', '0'])).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/config.test.ts`

Expected: FAIL because project configuration and `parseOptions` do not exist.

- [ ] **Step 3: Add project setup and minimal configuration implementation**

```ts
export interface ScrapeOptions {
  query: string; limit: number; outputDir: string; headed: boolean;
  delayMs: number; timeoutMs: number;
}

export interface BusinessRecord {
  businessName: string; mapsUrl: string; category: string; address: string;
  phone: string; website: string; emails: string[]; contactPages: string[];
  status: string; errorMessage: string;
}

export function parseOptions(argv: string[]): ScrapeOptions {
  const query = argv[0]?.trim();
  if (!query) throw new Error('A Google Maps search query is required.');
  return { query, limit: 20, outputDir: 'output', headed: false, delayMs: 1200, timeoutMs: 15000 };
}
```

Configure ESM TypeScript, `tsx` for `npm run scrape`, and Vitest. Add `playwright`, `commander`, and `xlsx` as runtime dependencies, and `typescript`, `tsx`, `vitest`, and Node type definitions as development dependencies. Extend `parseOptions` with Commander flags and reject non-integer or unsafe values.

- [ ] **Step 4: Run tests and type checking**

Run: `npm test -- --run tests/config.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the foundation**

```sh
git add package.json tsconfig.json vitest.config.ts src/types.ts src/config.ts tests/config.test.ts
git commit -m "chore: initialize scraper CLI"
```

### Task 2: Implement public-email extraction and contact-link filtering

**Files:**
- Create: `src/email.ts`
- Create: `src/contact-links.ts`
- Test: `tests/email.test.ts`
- Test: `tests/contact-links.test.ts`

**Interfaces:**
- Produces `extractEmails(text: string, mailtoHrefs?: string[]): string[]`.
- Produces `selectContactUrls(baseUrl: string, links: Array<{href: string; text: string}>, maxPages?: number): string[]`.

- [ ] **Step 1: Write failing pure-function tests**

```ts
expect(extractEmails('Sales@Example.com and sales@example.com.')).toEqual(['sales@example.com']);
expect(extractEmails('', ['mailto:hello@example.com?subject=Hi'])).toEqual(['hello@example.com']);
expect(selectContactUrls('https://example.com', [
  { href: '/contact', text: 'Contact us' },
  { href: 'https://other.test/contact', text: 'Contact' },
  { href: '/assets/file.pdf', text: 'Download' },
])).toEqual(['https://example.com/contact']);
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run tests/email.test.ts tests/contact-links.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement exact parsing and filtering rules**

```ts
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export function extractEmails(text: string, mailtoHrefs: string[] = []): string[] {
  const candidates = [...(text.match(EMAIL) ?? []), ...mailtoHrefs.map((href) => href.replace(/^mailto:/i, '').split('?')[0])];
  return [...new Set(candidates.map((value) => value.trim().toLowerCase()).filter((value) => EMAIL.test(value)))];
}
```

Reset the regular expression before repeated `.test` calls or use a non-global validation expression. Resolve links with `new URL`, retain only `http:`/`https:` links with the same hostname as the website, exclude downloads and fragment-only links, score `contact|about|support|help|connect` in combined link text/URL, deduplicate, and return at most three URLs.

- [ ] **Step 4: Run all parser tests**

Run: `npm test -- --run tests/email.test.ts tests/contact-links.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit parser utilities**

```sh
git add src/email.ts src/contact-links.ts tests/email.test.ts tests/contact-links.test.ts
git commit -m "feat: add public contact extraction utilities"
```

### Task 3: Implement safe CSV and Excel exports

**Files:**
- Create: `src/exporter.ts`
- Test: `tests/exporter.test.ts`

**Interfaces:**
- Consumes: `BusinessRecord[]` from `src/types.ts`.
- Produces: `exportRecords(records: BusinessRecord[], outputDir: string, now?: Date): Promise<{csvPath: string; xlsxPath: string}>`.

- [ ] **Step 1: Write failing exporter tests**

```ts
const result = await exportRecords([{ businessName: '=formula', mapsUrl: '', category: '', address: '', phone: '', website: '', emails: ['info@example.com'], contactPages: [], status: 'success', errorMessage: '' }], tempDir, new Date('2026-08-25T10:00:00Z'));
expect(readFileSync(result.csvPath, 'utf8')).toContain("'=formula");
expect(existsSync(result.xlsxPath)).toBe(true);
```

- [ ] **Step 2: Run the exporter test and verify it fails**

Run: `npm test -- --run tests/exporter.test.ts`

Expected: FAIL because `exportRecords` does not exist.

- [ ] **Step 3: Implement the export schema and output**

Use the exact ordered headers from the specification. Transform arrays using `join('; ')`; prefix any cell beginning with `=`, `+`, `-`, or `@` with an apostrophe. Use `mkdir(..., { recursive: true })`, a `YYYY-MM-DDTHH-mm-ss` timestamp, safe CSV quoting, and ExcelJS workbook/worksheet APIs for `.xlsx`.

- [ ] **Step 4: Run tests and inspect generated headers**

Run: `npm test -- --run tests/exporter.test.ts`

Expected: PASS, with CSV and XLSX both containing every required field.

- [ ] **Step 5: Commit the exporter**

```sh
git add src/exporter.ts tests/exporter.test.ts
git commit -m "feat: export business contacts to csv and excel"
```

### Task 4: Build the bounded website scanner

**Files:**
- Create: `src/website-scanner.ts`
- Test: `tests/website-scanner.test.ts`

**Interfaces:**
- Consumes: `website: string`, `timeoutMs: number`, `delayMs: number`.
- Produces: `scanWebsite(page: Page, website: string, options: Pick<ScrapeOptions, 'timeoutMs'>): Promise<WebsiteScanResult>`.

- [ ] **Step 1: Write a mock-page scanner test**

```ts
const scan = await scanWebsite(fakePage({
  bodyText: 'Reach us at team@example.com',
  links: [{ href: '/contact', text: 'Contact' }], mailtoHrefs: [],
}), 'https://example.com', { timeoutMs: 1000 });
expect(scan).toMatchObject({ emails: ['team@example.com'], contactPages: ['https://example.com'] });
```

Also assert that a navigation timeout returns `{ emails: [], contactPages: [], status: 'website_timeout', errorMessage: expect.any(String) }`.

- [ ] **Step 2: Run the scanner test and verify it fails**

Run: `npm test -- --run tests/website-scanner.test.ts`

Expected: FAIL because scanner code is absent.

- [ ] **Step 3: Implement bounded page collection**

Navigate to the supplied `http:`/`https:` URL with `waitUntil: 'domcontentloaded'`. Extract `document.body.innerText`, `a[href]` link href/text pairs, and `a[href^="mailto:"]` values. Scan the homepage first, use `selectContactUrls` for up to three additional same-host contact pages, and merge extracted emails/page URLs. Convert Playwright timeout errors to `website_timeout`, likely `403`/`429` responses to `website_blocked`, and other exceptions to `website_error`.

- [ ] **Step 4: Run scanner tests**

Run: `npm test -- --run tests/website-scanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the website scanner**

```sh
git add src/website-scanner.ts tests/website-scanner.test.ts
git commit -m "feat: scan public business contact pages"
```

### Task 5: Build the Google Maps listing collector

**Files:**
- Create: `src/maps-collector.ts`
- Test: `tests/maps-collector.test.ts`

**Interfaces:**
- Consumes: `Page`, `query: string`, `limit: number`, `timeoutMs: number`.
- Produces: `collectMapsBusinesses(page: Page, options: Pick<ScrapeOptions, 'query' | 'limit' | 'timeoutMs'>): Promise<BusinessRecord[]>` with scan fields initialized empty.

- [ ] **Step 1: Write selector-adapter tests with fixture HTML**

```ts
expect(parseListingDetails(fixtureHtml)).toMatchObject({
  businessName: 'Example Cafe', website: 'https://example.test', phone: '+91 12345 67890',
  emails: [], contactPages: [], status: 'pending', errorMessage: '',
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test -- --run tests/maps-collector.test.ts`

Expected: FAIL because collector helpers do not exist.

- [ ] **Step 3: Implement Maps collection with encapsulated selectors**

Navigate to `https://www.google.com/maps`, fill the search box, submit, and await results. Scroll the role `feed` until unique result links reach the limit or three scroll attempts yield no additional links. Open each result, use ARIA-label based selectors for name/category/address/phone/website when available, and preserve empty strings for missing fields. Never authenticate or interact with CAPTCHA/access-control UI. Isolate each listing in `try/catch` and return a `maps_error` row if its details cannot be collected.

- [ ] **Step 4: Run fixture tests**

Run: `npm test -- --run tests/maps-collector.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Maps collector**

```sh
git add src/maps-collector.ts tests/maps-collector.test.ts
git commit -m "feat: collect public google maps listings"
```

### Task 6: Orchestrate the CLI and document operation

**Files:**
- Create: `src/index.ts`
- Create: `README.md`
- Test: `tests/index.test.ts`

**Interfaces:**
- Consumes: `parseOptions`, `collectMapsBusinesses`, `scanWebsite`, and `exportRecords`.
- Produces: executable `npm run scrape -- "query" [options]`.

- [ ] **Step 1: Write an orchestrator test with injected collaborators**

```ts
const records = await runScrape(options, {
  collect: async () => [recordWithWebsite, recordWithoutWebsite],
  scan: async () => ({ emails: ['hello@example.com'], contactPages: ['https://example.com'], status: 'success', errorMessage: '' }),
  export: async (rows) => { expect(rows[0].emails).toEqual(['hello@example.com']); return paths; },
});
expect(records[1].status).toBe('no_website');
```

- [ ] **Step 2: Run the orchestration test and verify it fails**

Run: `npm test -- --run tests/index.test.ts`

Expected: FAIL because `runScrape` does not exist.

- [ ] **Step 3: Implement the browser lifecycle and reporting**

Launch Chromium with `headless: !options.headed`, collect Maps listings, scan one website at a time with `delayMs` between sites, map results into each `BusinessRecord`, export the complete rows, print counts and file paths, and close the browser in `finally`. Preserve a successful Maps row as `no_website` when no valid website exists and `no_email_found` when scans complete without emails.

Write the README with exact install commands (`npm install`, `npx playwright install chromium`), sample commands, field definitions, `--headed` troubleshooting, output location, limitations of dynamic sites/Maps layout changes, and responsible-use boundaries.

- [ ] **Step 4: Run full verification**

Run: `npm test -- --run && npm run typecheck`

Expected: PASS with no network access.

- [ ] **Step 5: Perform one small headed manual verification**

Run: `npm run scrape -- "cafes in Chennai" --limit 2 --headed`

Expected: Browser opens; the tool either exports up to two rows or reports ordinary Maps access/layout limitations without crashing. Do not attempt to bypass any access challenge.

- [ ] **Step 6: Commit CLI and documentation**

```sh
git add src/index.ts README.md tests/index.test.ts
git commit -m "feat: add google maps email scraper command"
```

## Plan self-review

- Spec coverage: Tasks 1–6 cover CLI flags/defaults, Maps collection, public same-domain website scans, result-level failure isolation, safe CSV/XLSX output, fixture tests, and documentation.
- No-placeholder scan: complete; no deferred requirements or vague testing actions remain.
- Type consistency: `BusinessRecord`, `ScrapeOptions`, and `WebsiteScanResult` are the shared interfaces across collector, scanner, exporter, and CLI tasks.
