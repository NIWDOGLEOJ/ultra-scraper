# Ultra Scraper

A cross-platform terminal tool that searches Google Maps for businesses, opens the public websites those businesses list, and exports publicly available business email addresses and phone numbers to CSV and Excel.

Runs on **Windows, macOS and Linux**. Written in TypeScript on Node.js, driving Chromium through Playwright.

Use it for category-and-location searches such as `colleges in Chennai`, `dentists in Coimbatore`, or `restaurants in Madurai`.

## Quick start

```sh
npm install
```

```sh
npm run setup:browser
```

```sh
npm run scrape -- "colleges in Chennai" --limit 20
```

Results land in `output/` as a timestamped `.csv` and `.xlsx` pair. On Linux, use `npm run setup:browser:linux` for the second step. Full detail on each step is below.

## What it collects

- Business name and Google Maps listing link
- Category, address and public phone number shown in Maps
- Website link shown in Maps
- Public email addresses found on the business website
- Contact-page URLs where emails were found
- Per-business status and concise error information

Emails are collected only when visibly published on a business website. The scraper does not guess email addresses, sign in to Google, solve CAPTCHAs, or bypass access controls.

## Requirements

- **Node.js 20.6 or newer** (`node --version` to check)
- Windows 10/11, macOS, or Linux
- Internet connection

## First-time setup

Install dependencies:

```sh
npm install
```

Then install the browser the scraper drives. **Pick the line for your operating system:**

Windows and macOS:

```sh
npm run setup:browser
```

Linux — the `--with-deps` form also installs the system libraries headless Chromium needs, and without them the browser will not start at all:

```sh
npm run setup:browser:linux
```

On Linux this step uses `apt`/`dnf` and will ask for your sudo password. If you cannot use sudo, ask an administrator to run `npx playwright install-deps chromium` once.

## Run a scrape

The same command works in every shell — macOS/Linux Terminal, Windows PowerShell, and Windows `cmd`:

```sh
npm run scrape -- "colleges in Chennai" --limit 20
```

For the first few runs, keep the automated browser visible so you can see what it is doing:

```sh
npm run scrape -- "colleges in Chennai" --limit 20 --headed
```

Press `Ctrl-C` at any time to stop; the browser is closed cleanly.

## Contact filters

```sh
npm run scrape -- "dentists in Chennai" --limit 20 --contact emails
```

```sh
npm run scrape -- "dentists in Chennai" --limit 20 --contact phones
```

```sh
npm run scrape -- "dentists in Chennai" --limit 20 --contact both
```

## Options

| Option | What it does |
| --- | --- |
| `--limit <number>` | Maximum Maps listings to process. Default: `20`. |
| `--contact <both\|emails\|phones>` | Main-export filter. Default: `both`. |
| `--output <folder>` | Where result files are saved. Default: `output`. |
| `--delay <milliseconds>` | Wait between business websites. Default: `1200`. |
| `--timeout <milliseconds>` | Page loading limit. Default: `15000`. |
| `--max-emails <number>` | Most emails kept per business. Default: `25`. |
| `--concurrency <number>` | Websites scanned at the same time, 1-16. Default: automatic (4-10, based on `--limit`). |
| `--headed` | Shows the automated browser window. |
| `--help` | Lists every option. |

Combining several options on one line works everywhere:

```sh
npm run scrape -- "cafes in Chennai" --limit 30 --contact emails --output exports --delay 1500 --timeout 20000 --headed
```

If you want to split that across several lines, the continuation character differs per shell — `\` in macOS/Linux, `` ` `` in PowerShell, `^` in `cmd`. Keeping it on one line avoids the problem entirely.

## Speed

Websites are scanned in parallel, and the number of parallel scans rises with `--limit` so that
larger jobs finish proportionally faster. Measured on the same query and machine:

| Job | Time | Per business |
| --- | --- | --- |
| 20 listings | ~55s | 2.8s |
| 45 listings | ~101s | 2.2s |

Raise `--concurrency` to go faster on a fast connection, or lower it to be gentler on the sites
being read. Past roughly 10 the run is limited by its single slowest website rather than by
parallelism, so higher numbers buy little.

Every run also skips downloading images, video and webfonts, which are never a source of contact
details and are most of the page weight — on Google Maps in particular, that is the map tiles.

## Which emails are kept

A business website often publishes addresses that have nothing to do with the business — helpline banners, web-agency credits, or a staff directory listing a hundred individual people. The scraper keeps:

1. Addresses on the business's own domain, and
2. Addresses at common providers such as Gmail or Yahoo, which small businesses genuinely use as their contact address.

Unrelated third-party domains are dropped whenever at least one of the above was found, and the total per business is capped by `--max-emails`. Role addresses (`info@`, `admissions@`, `principal@`, and similar) are listed first. If nothing matches, up to five other addresses found on the page are kept as a fallback rather than exporting an empty cell.

## Output files

Each run writes timestamped CSV and Excel (`.xlsx`) files. All four files from one run share a single timestamp, so they sort together. The main result uses the prefix `maps-emails-` and follows your selected `--contact` filter.

| File prefix | Contains |
| --- | --- |
| `maps-emails-` | The main export, filtered by `--contact`. |
| `contacts-` | Businesses with at least one public email or phone number. |
| `no-contact-` | Businesses where no public email or phone number was found. |
| `failures-` | Listings or websites that timed out, were blocked, or produced an error — and yielded no contact details. |

Every export contains: `business_name`, `maps_url`, `category`, `address`, `phone`, `website`, `emails`, `contact_pages`, `status`, and `error_message`.

CSV files are written as UTF-8 with a byte-order mark and CRLF line endings, so Excel on Windows opens non-English business names correctly instead of showing mojibake.

### The `status` column

| Status | Meaning |
| --- | --- |
| `success` | At least one public email was found on the website. |
| `no_email_found` | The website was read successfully, but published no email address. |
| `no_website` | The Maps listing did not link to a website, so nothing could be scanned. |
| `website_timeout` | The website did not respond within `--timeout`. |
| `website_blocked` | The site refused automated access (HTTP 401, 403 or 429). |
| `website_error` | Any other website failure — DNS, TLS, connection reset. |
| `maps_error` | The Maps listing itself could not be read. |

A row can carry a phone number even when its status is a failure: the phone comes from Maps, the emails come from the website. That is why `contacts-` is keyed on "has an email or a phone", not on status.

## How it works

1. Opens a Google Maps search for your category and location, pinned to the English interface so the results are read the same way on every machine.
2. Collects up to the requested number of public listings.
3. Reads each business website listed in Maps, several at a time, each in its own isolated browser session.
4. Scans the homepage and up to three same-site contact/about/support pages.
5. Extracts public emails and exports the results.

Temporary network problems get one retry after a short pause; permanent ones such as an unknown
domain are not retried. A failed business does not stop the rest of the run, and a contact page
that fails does not discard the emails already found on the homepage.

Sites whose TLS certificate has expired or does not match — common on small business and college
sites — are read once more without certificate verification rather than being written off. When
that happens the `error_message` column says so, so you can judge those rows differently. Nothing
is ever sent to those sites; the scraper only reads public pages.

## Project structure

The source is small, plain TypeScript modules with no framework. Each file does one job and is unit-tested in isolation.

| File | Responsibility |
| --- | --- |
| `src/index.ts` | CLI entry point. Parses options, runs the scrape, prints the summary. |
| `src/config.ts` | Command-line parsing and validation, and the automatic `--concurrency` default. |
| `src/run-scrape.ts` | Orchestrates a run: launches Chromium, collects listings, scans sites, writes the four exports. |
| `src/maps-collector.ts` | Drives Google Maps — search, consent wall, result scrolling, and reading each listing's fields. |
| `src/website-scanner.ts` | Reads one business website plus its contact pages in an isolated browser context. |
| `src/email.ts` | Extracts email addresses from page text and `mailto:` links, then selects the ones that belong to the business. |
| `src/phone.ts` | Reads the public phone number out of Maps' locale-independent markup. |
| `src/contact-links.ts` | Ranks a page's links to pick the best few contact/about pages to follow. |
| `src/domain.ts` | Reduces a hostname to the registrable domain, so `www.` and subdomains still match. |
| `src/exporter.ts` | Writes the CSV and `.xlsx` files and splits records into the outcome groups. |
| `src/concurrency.ts` | Bounded parallel map, with and without a per-slot reusable resource. |
| `src/retry.ts` | Retries transient network failures once; never retries permanent ones. |
| `src/errors.ts` | Trims Playwright's multi-line error dumps down to one readable cell. |
| `src/app.ts`, `src/web/` | The optional local web interface (see below). |
| `tests/` | Vitest suites, one per module. |
| `docs/` | Design specs and implementation plans written before the code. |

Design decisions and their rationale are recorded in `docs/`, and the non-obvious ones are commented at the point in the code where they matter.

## Troubleshooting

**"Could not start Chromium"** — the browser step was skipped or failed. Re-run `npm run setup:browser` (or `npm run setup:browser:linux` on Linux).

**Linux: the browser fails to start with a missing `.so` library** — run `npm run setup:browser:linux`, which installs those system packages.

**Linux in Docker, WSL or as root** — handled automatically: the scraper disables Chromium's setuid sandbox only when running as root, and always avoids the small `/dev/shm` that containers provide.

**"Google Maps returned no listings"** — the search returned nothing, or the page did not load. Re-run with `--headed` to watch what the browser sees. Previously this produced an empty export that looked like a successful run.

**Windows: `npm` is not recognised** — install Node.js from nodejs.org and open a new terminal window so the `PATH` change takes effect.

**A run is slow** — every business website is given up to `--timeout` milliseconds, and one slow
site holds up its slot. Raise `--concurrency`, or lower `--timeout` (`--timeout 8000`) to give up
on slow sites sooner.

**Sites start returning `website_blocked`** — lower `--concurrency` and raise `--delay` to spread
the requests out.

## Local web app, saved for later

The browser interface is preserved but is not part of the normal workflow. When you want to return to it:

```sh
npm run app:later
```

It listens on `http://127.0.0.1:3000`, on the loopback address only. Set the `PORT` environment variable to use a different port.

## Development

Run the test suite (45 tests across 10 files, no network access required):

```sh
npm test
```

Watch mode while editing:

```sh
npm run test:watch
```

Type-check without emitting build output:

```sh
npm run typecheck
```

Both must pass before a change is complete. The tests are pure unit tests — they exercise the parsing, selection, concurrency and export logic directly, so they run in about a second and never touch Google Maps or a live website.

## Limitations and responsible use

- Google Maps and business website layouts may change; the `category` column in particular depends on Maps markup that Google does not publish as a stable interface.
- Some websites block automated browsing or load too slowly.
- A listing may not have a website or public contact details.
- Results depend on what each business has chosen to publish publicly.
- Exported files contain real people's contact details. They are excluded from version control by `.gitignore` — keep them out of shared repositories.
- Use exported contact information responsibly and in accordance with applicable laws and platform terms.

## License

Released under the MIT License. See [LICENSE](LICENSE).
