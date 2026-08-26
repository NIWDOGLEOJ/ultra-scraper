# Google Maps Public Email Scraper Design

## Purpose

Create a local Node.js command-line tool that finds businesses from a Google Maps search, follows each business's publicly supplied website link, extracts only publicly listed business email addresses, and writes matching CSV and Excel exports.

## Scope and boundaries

The tool accepts a Maps search query, such as `cafes in Chennai`, and a configurable maximum number of results. It uses a visible or headless Playwright browser session to collect business details that are publicly shown in Maps. It then visits each listed business website and scans the home page plus a small set of same-domain contact-oriented pages.

The tool does not sign in to Google, solve or bypass CAPTCHAs, circumvent access controls, scrape private pages, or generate/infer email addresses. A blocked page or unavailable contact detail is recorded as a status rather than treated as an error that stops the run.

## Command-line interface

The primary command is:

```sh
npm run scrape -- "cafes in Chennai" --limit 20
```

Options:

- `--limit <number>`: Maximum number of Maps listings to process; default `20`.
- `--output <directory>`: Export directory; default `output/`.
- `--headed`: Show the browser window for inspection.
- `--delay <milliseconds>`: Delay between website requests.
- `--timeout <milliseconds>`: Page navigation timeout.

Each run produces a timestamped `.csv` and `.xlsx` file in the output directory and prints a short summary of results, emails found, and failures.

## Components

### CLI and configuration

Parses the query and flags, validates limits/timeouts, creates the export directory, and owns run-level logging and summary output.

### Maps collector

Opens Google Maps, searches the supplied phrase, scrolls the results feed until it reaches the result limit or no new listings load, and opens each result to collect the visible name, category, address, phone, Maps URL, and website link.

Selectors are encapsulated in this component so Maps layout changes are localized. Missing fields remain empty rather than failing the listing.

### Public website contact scanner

Visits the website URL collected from Maps. It reads text and `mailto:` links from the homepage, then chooses a bounded number of same-domain links whose labels or URLs indicate `contact`, `about`, `support`, `help`, or `connect`. It extracts conventional email-address syntax, normalizes it, and removes duplicates.

It avoids non-web protocols, third-party domains, download links, and repeated URLs. Failed navigation, access-denied pages, and timeouts are reported per business.

### Exporter

Creates CSV and Excel files with identical columns. Values are safely escaped for CSV, and formula-like values are neutralized before export so spreadsheet applications do not evaluate untrusted scraped content as formulas. Excel output uses `exceljs`; this replaces the originally proposed `xlsx` package after its unresolved high-severity advisory was identified.

## Export schema

| Column | Description |
| --- | --- |
| `business_name` | Public business name from Maps |
| `maps_url` | Public Maps listing URL |
| `category` | Visible Maps category |
| `address` | Visible Maps address |
| `phone` | Visible Maps phone number |
| `website` | Website supplied by the business in Maps |
| `emails` | Deduplicated public emails, separated by `; ` |
| `contact_pages` | Pages where emails were discovered, separated by `; ` |
| `status` | `success`, `no_website`, `no_email_found`, `website_timeout`, `website_blocked`, or another specific outcome |
| `error_message` | Optional concise failure detail |

## Reliability and operating behavior

The default result limit is 20. Navigation timeouts and between-site delays are configurable. The scraper isolates errors by listing so one broken Maps result or website does not end the run. It detects a lack of new Maps results and exits the collection loop cleanly.

The tool is intended for modest, interactive runs. Google Maps and websites can change their layout or restrict automation, so it makes no guarantee that every listing or site will be accessible. The README will explain these limitations and responsible collection of public business contact details.

## Testing

Automated tests use fixture HTML and mocked browser responses rather than live Maps pages. They cover:

- Email extraction and normalization.
- Public same-domain contact-link filtering.
- Deduplication across pages.
- Output schema, CSV escaping, Excel values, and formula neutralization.
- Per-listing failure handling in the run orchestrator.

Live verification is limited to a small, user-initiated manual run after browser dependencies are installed.

## Acceptance criteria

1. A user can install dependencies, install the Playwright browser, and run a Maps query from the terminal.
2. The tool gathers up to the requested number of public Maps listings without requiring login.
3. It visits supplied websites, scans bounded public pages, and records only email addresses actually present there.
4. It writes usable timestamped CSV and Excel exports with the defined schema.
5. A failed listing is reported in its own row and does not stop remaining listings.
6. Unit tests validate core parsing, filtering, export, and error-isolation behavior without network calls.
