# Ultra Scraper

A cross-platform terminal tool that searches Google Maps for businesses, opens the public websites those businesses list, and exports publicly available business email addresses and phone numbers to CSV and Excel.

Runs on **Windows, macOS and Linux**. Written in TypeScript on Node.js, driving Chromium through Playwright.

Use it for category-and-location searches such as `colleges in Chennai`, `dentists in Coimbatore`, or `restaurants in Madurai`.

## Quick start

Already have **Node.js 20.6+**? Then it is four commands:

```sh
git clone https://github.com/NIWDOGLEOJ/ultra-scraper.git
```

```sh
cd ultra-scraper
```

```sh
npm install
```

```sh
npm run setup:browser
```

```sh
npm run scrape -- "colleges in Chennai" --limit 20
```

Results land in `output/` as a timestamped `.csv` and `.xlsx` pair.

On **Linux** the browser step is `npm run setup:browser:linux` instead — it also installs the system libraries Chromium needs. If you do not have Node.js yet, or want the step-by-step path for your operating system, see **[Installation](#installation)** below.

## What it collects

- Business name and Google Maps listing link
- Category, address and public phone number shown in Maps
- Website link shown in Maps — or, with `--web-search-fallback`, one found by web search
- Which of those two the website came from (`website_source`: `maps` or `search`)
- Public email addresses found on the business website
- Contact-page URLs where emails were found
- Per-business status and concise error information

Emails are collected only when visibly published on a business website. The scraper does not guess email addresses, sign in to Google, solve CAPTCHAs, or bypass access controls.

## Requirements

| What | Version | Why it is needed |
| --- | --- | --- |
| **Node.js** | 20.6 or newer | Runs the scraper. Ships with `npm`, which installs everything else. |
| **npm** | 10 or newer | Comes bundled with Node.js — no separate install. |
| **Git** | any recent | Only to clone this repository. You can download a ZIP instead. |
| **Chromium** | installed by Playwright | The browser the scraper drives. Downloaded in step 4, not installed system-wide. |
| Disk space | ~700 MB | ~125 MB of npm packages in the project folder, plus ~550 MB for Chromium in a shared cache outside it. |
| Internet | required | Both to install and to scrape. |

Works on Windows 10/11, macOS 12 or newer (Intel and Apple Silicon), and mainstream Linux distributions.

### The packages `npm install` brings in

You do not install these by hand — step 3 does it. Listed so you know what ends up on your machine:

| Package | Kind | Purpose |
| --- | --- | --- |
| `playwright` | runtime | Launches and controls Chromium. |
| `commander` | runtime | Parses the command-line options. |
| `exceljs` | runtime | Writes the `.xlsx` exports. |
| `typescript` | development | Type checking. |
| `tsx` | development | Runs the TypeScript sources directly, so there is no build step. |
| `vitest` | development | Test runner. |
| `@types/node` | development | Type definitions for Node's standard library. |

---

## Installation

Follow the five steps below. **Step 1 differs per operating system — jump to your platform.** Steps 2, 3 and 5 are identical everywhere; step 4 has a separate line for Linux.

### Step 1 — Install Node.js 20.6+

First check whether you already have it:

```sh
node --version
```

If that prints `v20.6.0` or higher, skip to step 2. If it prints a lower version or the command is not found, follow your platform below.

<details open>
<summary><b>Windows 10/11</b></summary>

**Option A — winget (recommended, built into Windows 11 and modern Windows 10):**

Open PowerShell and run:

```powershell
winget install OpenJS.NodeJS.LTS
```

**Option B — the official installer:**

1. Go to [nodejs.org](https://nodejs.org) and download the **LTS** Windows Installer (`.msi`).
2. Run it and accept the defaults. Leave "Add to PATH" ticked — it is on by default.
3. You do **not** need the optional "Tools for Native Modules" checkbox; this project has no native build step.

**Then close your terminal and open a new one.** The `PATH` change only applies to newly opened windows — this is the single most common reason `node` still appears "not recognised" straight after installing.

Verify:

```powershell
node --version
npm --version
```

</details>

<details open>
<summary><b>macOS (Intel and Apple Silicon)</b></summary>

**Option A — Homebrew:**

If you do not have Homebrew, install it first from [brew.sh](https://brew.sh), then:

```sh
brew install node
```

**Option B — the official installer:**

Download the **LTS** macOS installer (`.pkg`) from [nodejs.org](https://nodejs.org) and run it. It picks the right build for Intel or Apple Silicon automatically.

Verify:

```sh
node --version
npm --version
```

</details>

<details open>
<summary><b>Linux</b></summary>

**Do not use `apt install nodejs` on its own.** Debian and Ubuntu ship an older Node in their default repositories — often 18, which is below the 20.6 this project needs. Use one of these instead.

**Option A — nvm (works on every distribution, no root required):**

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Close and reopen your terminal, then:

```sh
nvm install --lts
```

**Option B — NodeSource, for a system-wide install:**

Debian / Ubuntu / Mint:

```sh
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Fedora / RHEL / Rocky / Alma:

```sh
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo -E bash - && sudo dnf install -y nodejs
```

Arch / Manjaro — the distribution's own package is current, so it is fine here:

```sh
sudo pacman -S nodejs npm
```

Verify:

```sh
node --version
npm --version
```

</details>

### Step 2 — Get the code

With Git:

```sh
git clone https://github.com/NIWDOGLEOJ/ultra-scraper.git
```

```sh
cd ultra-scraper
```

Without Git, download the ZIP from the repository's green **Code** button, extract it, and `cd` into the extracted folder.

If you need Git: Windows `winget install Git.Git` · macOS `brew install git` (or Xcode Command Line Tools) · Debian/Ubuntu `sudo apt install git` · Fedora `sudo dnf install git`.

### Step 3 — Install the project dependencies

Run this in the project folder, on every platform:

```sh
npm install
```

This reads `package.json` and installs the seven packages listed above into a local `node_modules/` folder. Nothing is installed system-wide, and nothing outside this folder is touched. Takes roughly 30 seconds on a normal connection.

### Step 4 — Install the Chromium browser

Playwright downloads its own private copy of Chromium — it does not use, need, or modify any Chrome or Edge you already have. **Pick the line for your operating system.**

**Windows and macOS:**

```sh
npm run setup:browser
```

**Linux:**

```sh
npm run setup:browser:linux
```

The Linux form is different on purpose. The `--with-deps` flag it uses also installs the system libraries headless Chromium links against (`libnss3`, `libatk`, `libgbm`, and others). Without them Chromium will not start at all — it fails with a missing `.so` file. This step calls `apt` or `dnf` and will ask for your sudo password.

If you cannot use sudo, ask an administrator to run this once:

```sh
npx playwright install-deps chromium
```

On Arch, `install-deps` is not supported; install the libraries yourself:

```sh
sudo pacman -S nss atk at-spi2-atk libcups libdrm gtk3 libxcomposite libxdamage libxrandr mesa libxkbcommon alsa-lib
```

The browser is stored in a shared Playwright cache **outside** the project folder, so deleting the project does not remove it, and a second Playwright project reuses the same download:

| OS | Location |
| --- | --- |
| Windows | `%USERPROFILE%\AppData\Local\ms-playwright` |
| macOS | `~/Library/Caches/ms-playwright` |
| Linux | `~/.cache/ms-playwright` |

To reclaim the space later, delete that folder.

### Step 5 — Verify the installation

Run the test suite. It is entirely offline — it never opens a browser or contacts Google:

```sh
npm test
```

You should see **45 tests passing across 10 files** in about a second. If that works, your Node.js and dependencies are correct.

Then confirm the browser half works with a small real scrape:

```sh
npm run scrape -- "cafes in Chennai" --limit 3 --headed
```

`--headed` shows the browser window so you can watch it work. When it finishes, look in the `output/` folder for the generated `.csv` and `.xlsx` files.

If the tests pass but this step fails, the problem is step 4 (Chromium), not step 3.

---

## Updating to a newer version

If you already have Ultra Scraper and want the latest changes, run these three from the project
folder:

```sh
git pull
```

```sh
npm install
```

```sh
npm run setup:browser
```

On **Linux** the last one is `npm run setup:browser:linux`.

`npm install` picks up any new or changed dependencies, and `setup:browser` makes sure the Chromium
build matches the Playwright version you now have — skipping it is the usual cause of
"Could not start Chromium" after an update.

Then check nothing you rely on has changed:

```sh
npm test
```

### Before you update, read this

**[CHANGELOG.md](CHANGELOG.md) lists what changed in each version, and anything that breaks.**

The one break so far is in **0.3.0**: a run used to write eight files per run — `maps-emails-`,
`contacts-`, `no-contact-` and `failures-`, each as both CSV and Excel. It now writes **one file per
format you ask for**. If you have a script reading `contacts-*.csv`, `no-contact-*.csv` or
`failures-*.csv`, point it at `maps-emails-*.csv` and filter on the `status` column:

| Old file | Same rows, from the one export |
| --- | --- |
| `contacts-` | `status` is `success`, or `phone` is not empty |
| `no-contact-` | `status` is `no_email_found` or `no_website` |
| `failures-` | `status` contains `error`, `timeout` or `blocked` |

Nothing else changed shape. Files exported by older versions are still readable, and `--skip-seen`
still reads them.

### If an update goes wrong

Your exports are never touched by an update, but you can go back to the previous version at any
time:

```sh
git log --oneline
```

```sh
git checkout <commit-before-the-update>
```

Return to the latest with `git checkout main`.

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

## Your first run, explained

```sh
npm run scrape -- "dental clinics in Coimbatore" --limit 4
```

While it runs it tells you which phase it is in:

```
Starting browser…
Collecting Google Maps listings…
Read listing 4 of 4…
Scanning 4 websites (4 at a time)…
Scanned 4 of 4 websites…
Creating CSV and Excel files…
Finished. 4 of 4 listings matched your filter.

Exported 4 businesses (4 public emails) to:
  output/maps-emails-2026-08-25T20-32-25-718Z.csv
  output/maps-emails-2026-08-25T20-32-25-718Z.xlsx
```

Open the `.xlsx` in Excel, Numbers or LibreOffice. One row per business:

| business_name | category | phone | website | emails | status |
| --- | --- | --- | --- | --- | --- |
| Dr. Ruchi's | Dental clinic | 09025227544 | drruchidental.com | drrporwal@gmail.com | success |
| MARUTHI DENTAL | Dental clinic | 09043723203 | maruthidental.com | drarun@maruthidental.com | success |
| Arasu Dental Care | Orthodontist | 08838022157 | arasudentalcare.com | arasudentalcare@gmail.com | success |

Read it like this:

- **`status` first.** `success` means an email was found. Anything else tells you *why* not — see
  [the status table](#the-status-column). A `no_website` or `no_email_found` row is not a bug;
  it means that business published nothing to find.
- **A row can be useful without an email.** The phone number comes from Maps, so it is there even
  when the website failed. Filter on `status` to separate those out.
- **Check `website_source`** if you used `--web-search-fallback`. Rows marked `search` were matched
  by name, not confirmed by the business.
- **`error_message`** is plain English and worth reading on any failed row.

## Stopping and resuming a long run

Long runs save their progress as they go, so a crash or `Ctrl-C` does not send you back to the
start. Progress is written to `<output>/.checkpoints/` after the listings are collected and
periodically while websites are being scanned.

Press `Ctrl-C` and the scraper tells you how to pick up where it left off:

```
Stopped. Progress saved — continue with:
  npm run scrape -- "engineering colleges in Chennai" --limit 30 --resume
```

Running that command skips the Google Maps pass entirely and scans only the businesses that were
never reached:

```
Resuming: 10 of 25 listings already done.
Scanning 15 websites (8 at a time)…
```

Details worth knowing:

- A saved run is identified by its **query and `--limit` together**. Change either one and you get
  a fresh run, because the set of listings would be different.
- `--resume` with nothing saved is not an error. It says so and runs normally.
- The saved file is **deleted once the exports are written**, so a completed run leaves nothing behind.
- Stopping mid-scan can still lose the last couple of websites that were in flight when you pressed
  `Ctrl-C`. They are simply rescanned on resume.
- Checkpoints hold the same business data as the exports, so treat them as personal data too. They
  live under your output folder, which `.gitignore` already excludes.

## Re-running a search later

Run the same search a month later and it re-scrapes every business from scratch. `--skip-seen`
reads the CSV exports already sitting in your output folder and skips the businesses they settled:

```sh
npm run scrape -- "engineering colleges in Chennai" --limit 30 --skip-seen
```

```
Skipping 20 of 25 businesses already in earlier exports; 5 new to scan.
Exported 5 businesses (3 public emails, 20 skipped as already seen)
```

**The export becomes a delta** — only the businesses actually scanned this time. That is the point:
recurring scrapes tell you what is new rather than repeating what you already have. The count of
skipped businesses is always reported, so a small file is never a surprise.

### Failures are retried, not skipped

A business counts as settled only if it reached `success`, `no_email_found` or `no_website`. Rows
that timed out, were blocked, or errored are **deliberately scanned again** — those are usually
temporary. In a real re-run of the example above, 3 of the 5 retried businesses succeeded the
second time and produced emails that a blunter "skip everything already seen" would have lost:

| Business | Before | After |
| --- | --- | --- |
| Saveetha Engineering College | `website_error` | `success` |
| LICET | `website_error` | `success` |
| Rajalakshmi Engineering College | `website_error` | `success` |
| SKR Engineering College | `website_timeout` | `website_timeout` |
| Velammal Engineering College | `website_blocked` | `website_blocked` |

A third run then skipped 23 and retried only the two that keep failing.

### How a business is recognised

By the Google place id embedded in its Maps URL (`ChIJ…`), falling back to the older feature id, and
finally to its name and address. Maps URLs carry parameters that change between runs, so whole-URL
comparison would treat every business as new; the id is pulled out of the path instead.

Note that the Maps listing pass still runs — the scraper has to see the listings to know which are
new. The saving is on the website scanning, which is the slow part.

## Feeding the results into something else

CSV and Excel are for reading. For a pipeline, ask for JSON:

```sh
npm run scrape -- "dental clinics in Coimbatore" --limit 30 --format json
```

One flag, one file. Ask for several and you get one of each:

```sh
npm run scrape -- "cafes in Madurai" --limit 20 --csv --json
```

`--format csv,json` does the same thing and is easier to build up in a script.

| Format | Shape | Good for |
| --- | --- | --- |
| `csv` | One row per business, UTF-8 with BOM, CRLF | Excel, Google Sheets, anything |
| `xlsx` | Real spreadsheet | Reading and sharing |
| `json` | One object: run metadata plus a `businesses` array | Loading a whole run at once |
| `jsonl` | One business per line | Streaming, `jq`, line-by-line tools |
| `md` | A Markdown table with a heading | Pasting into a doc, issue or PR |

`ndjson` and `markdown` are accepted as other names for `jsonl` and `md`.

Markdown is the one format that reshapes the data for readability: a raw Maps URL is 250 characters
and would make the table unusable, so link columns become compact links — `[Maps](…)`,
`[cafe.in](…)`, `[1](…) [2](…)` for contact pages. Nothing is lost; the URL is behind the label.

**JSON keeps real types.** In CSV, `emails` and `contact_pages` are collapsed into one
semicolon-joined cell, and a phone number gets a leading apostrophe so spreadsheets do not read
`+91…` as a formula. JSON has neither compromise — arrays stay arrays and the phone number is the
phone number. That is the reason to use it downstream.

The JSON file also records what produced it:

```json
{
  "generatedAt": "2026-08-26T18:58:07.576Z",
  "count": 6,
  "query": "dental clinics in Coimbatore",
  "limit": 6,
  "contactFilter": "both",
  "listingsCollected": 6,
  "skippedSeen": 0,
  "businesses": [ ... ]
}
```

Working with it in `jq`:

```sh
jq -r '.businesses[] | select(.emails | length > 0) | .businessName + " -> " + (.emails | join("; "))' output/maps-emails-*.json
```

```sh
jq -r 'select(.status == "success") | .website' output/maps-emails-*.jsonl
```

### Google Sheets

There is no direct Sheets upload — that would need Google OAuth credentials set up on your account.
Import the CSV instead (**File → Import → Upload**); it is written as UTF-8 with a byte-order mark,
so accented and non-English business names come through intact.

## Running at larger volumes

Two things get harder as a run gets bigger: sites start refusing you, and everything comes from one
IP address.

### Backing off automatically

The scraper watches for a refusal — HTTP 401, 403 or 429 from a business site, or 403/429 from
Google Maps — and slows itself down when it sees one. Nothing needs to be configured.

```
Scanned 1 of 5 websites…
Scanned 2 of 5 websites… · backing off to 7.0s
```

- Each refusal **doubles** the delay, so a run being rate-limited slows quickly rather than
  hammering away. `--max-delay` is the ceiling (30s by default).
- If the site sends a `Retry-After` header, **that wins**, even past `--max-delay` — retrying sooner
  than a server asked just earns another refusal. It is still capped at 5 minutes, because past that
  point failing the row beats stalling the whole run.
- Recovery is gradual: after five clean scans in a row the delay halves, down to the `--delay` you
  asked for and no further.
- The Google Maps pass starts with **no** delay at all and only slows if Google actually pushes back,
  so an ordinary run costs nothing extra.

### Rotating proxies

```sh
npm run scrape -- "colleges in Chennai" --limit 200 --proxy "http://user:pass@p1.example:8080,http://p2.example:8080"
```

Each browser session takes the next proxy in the list, round-robin, so consecutive businesses are
not all fetched from the same address. `http`, `https` and `socks5` are supported, credentials can
be embedded in the URL, and a bare `host:port` is treated as `http://host:port`.

A single proxy works too:

```sh
npm run scrape -- "cafes in Madurai" --limit 50 --proxy 10.0.0.1:8080
```

Proxies are used for everything the run does — Google Maps, business websites, and the optional web
search — so nothing leaks around them.

### If you are still getting blocked

Lower `--concurrency` and raise `--delay`. Those two do more than anything else; the automatic
backoff reacts to blocking, but starting gentler avoids provoking it.

## Common recipes

| You want | Command |
| --- | --- |
| A quick look at a new category | `npm run scrape -- "cafes in Madurai" --limit 10 --headed` |
| Only businesses with an email | `npm run scrape -- "dentists in Chennai" --limit 30 --contact emails` |
| Just one main address each | `npm run scrape -- "dentists in Chennai" --limit 30 --max-emails 1` |
| A large job, as fast as possible | `npm run scrape -- "colleges in Chennai" --limit 100 --timeout 10000` |
| Gentle, if sites start blocking you | `npm run scrape -- "hotels in Chennai" --limit 40 --concurrency 3 --delay 2500` |
| Save somewhere other than `output/` | `npm run scrape -- "gyms in Chennai" --limit 20 --output exports` |
| Continue a run you stopped | `npm run scrape -- "colleges in Chennai" --limit 100 --resume` |
| Re-check a search for new businesses | `npm run scrape -- "colleges in Chennai" --limit 100 --skip-seen` |
| Output for a script or pipeline | `npm run scrape -- "cafes in Madurai" --limit 20 --json` |
| A table to paste into a doc | `npm run scrape -- "cafes in Madurai" --limit 20 --md` |
| A large run through proxies | `npm run scrape -- "colleges in Chennai" --limit 200 --proxy 10.0.0.1:8080,10.0.0.2:8080` |
| Also chase businesses with no website | `npm run scrape -- "salons in Chennai" --limit 30 --web-search-fallback` |

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
| `--no-deep` | Skips the second search on sites that show no email on their obvious pages. |
| `--web-search-fallback` | Off by default. For businesses with **no** website in Maps, tries to find one by web search. |
| `--resume` | Continues the last interrupted run of the same query and limit instead of starting over. |
| `--skip-seen` | Skips businesses that earlier exports in the output folder already settled. |
| `--csv` `--xlsx` `--json` `--jsonl` `--md` | Which file to write. Give one for a single file, or several. Default: `--csv --xlsx`. |
| `--format <list>` | The same choice as a list, for scripts: `--format csv,json`. Ignored if the flags above are used. |
| `--max-delay <milliseconds>` | Ceiling the delay can back off to when sites push back. Default: `30000`. |
| `--proxy <list>` | Comma-separated proxies to rotate through. Default: none. |
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

The deeper second search only runs for businesses that yielded nothing on the first pass, so it
costs almost nothing on a typical run. `--no-deep` turns it off.

Every run also skips downloading images, video and webfonts, which are never a source of contact
details and are most of the page weight — on Google Maps in particular, that is the map tiles.

## Finding businesses that list no website

Some Maps listings have no website at all — about 1 in 10 in the runs I have measured. Those rows
are exported as `no_website` and nothing more is done with them.

Turning on the fallback makes the scraper look one up:

```sh
npm run scrape -- "dentists in Coimbatore" --limit 30 --web-search-fallback
```

For each of those businesses only, it searches the web for `"<business name>" <address>`, then:

1. Skips results on directory, aggregator and social hosts — Justdial, Yelp, Facebook, LinkedIn,
   Tripadvisor and the like. The list lives in one constant in `src/web-search.ts`, easy to extend.
2. Checks the first remaining result against the business name, comparing the distinctive words
   against the result's title and domain.
3. **If that check fails, the row stays `no_website`.** It does not try the next result and it
   never invents an address — a weak match is treated as no match.

A website found this way then goes through exactly the same email scan as any Maps-supplied one,
and the row is marked `website_source: search` so you can tell the two apart.

A website found this way is scanned at the same concurrency as any other, capped at 3 parallel
lookups so the search engine is not hammered, with the same `--delay` between them.

This is off by default because it sends queries to a search engine as well as to the business
sites, and because a name match is a guess about identity in a way a Maps listing is not.

### It needs a search API key to be useful

Free search engines block automated queries. Measured from this scraper's own headless browser:
DuckDuckGo answers **HTTP 403**, and Bing answers 200 but returns degraded results — the same
top three for completely different queries, and nothing relevant to the business being looked up.

The name check rejects all of that, so the fallback is *safe* without a key: rows simply stay
`no_website`, exactly as they do today. It is just not *useful* without one.

To make it work, get a Brave Search API key (there is a free tier) and set it before running:

```sh
export BRAVE_SEARCH_API_KEY="your-key-here"
```

On Windows PowerShell:

```sh
$env:BRAVE_SEARCH_API_KEY="your-key-here"
```

With the key set, lookups go to the API instead of a scraped results page. Without it, the
scraper falls back to reading a Bing results page, which currently finds nothing usable.

## Which emails are kept

A business website often publishes addresses that have nothing to do with the business — helpline banners, web-agency credits, or a staff directory listing a hundred individual people. The scraper keeps:

1. Addresses on the business's own domain, and
2. Addresses at common providers such as Gmail or Yahoo, which small businesses genuinely use as their contact address.

Unrelated third-party domains are dropped whenever at least one of the above was found, and the total per business is capped by `--max-emails`. Role addresses (`info@`, `admissions@`, `principal@`, and similar) are listed first. If nothing matches, up to five other addresses found on the page are kept as a fallback rather than exporting an empty cell.

## Output files

Each run writes **one file per format you asked for**, named `maps-emails-<timestamp>`:

```
output/
  maps-emails-2026-08-27T15-44-27-624Z.csv
  maps-emails-2026-08-27T15-44-27-624Z.xlsx
```

Ask for a single format and you get a single file:

```sh
npm run scrape -- "cafes in Madurai" --limit 20 --csv
```

Every export contains: `business_name`, `maps_url`, `category`, `address`, `phone`, `website`,
`website_source`, `emails`, `contact_pages`, `status`, and `error_message`.

`website_source` is `maps` for a website Google Maps listed, and `search` for one found by
`--web-search-fallback`. Rows marked `search` are worth a glance before you use them — the match
was made by name, not confirmed by the business.

CSV files are written as UTF-8 with a byte-order mark and CRLF line endings, so Excel on Windows
opens non-English business names correctly instead of showing mojibake.

Earlier versions also wrote separate `contacts-`, `no-contact-` and `failures-` files. They are
gone: every one of them was a filter on the `status` column, which is in the export already, so
they only duplicated the data. To get the same split, filter on `status` in your spreadsheet, or:

```sh
jq '.businesses[] | select(.status | test("error|timeout|blocked"))' output/maps-emails-*.json
```

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

A row can carry a phone number even when its status is a failure: the phone comes from Maps, the
emails come from the website. So when you filter, filter on what you need rather than assuming a
failed row is worthless.

## How it works

1. Opens a Google Maps search for your category and location, pinned to the English interface so the results are read the same way on every machine.
2. Collects up to the requested number of public listings.
3. With `--web-search-fallback`, looks up a website for any listing that had none, and keeps it only
   if the business name genuinely matches (see [that section](#finding-businesses-that-list-no-website)).
4. Reads each business website, several at a time, each in its own isolated browser session.
5. Scans the homepage and up to three same-site contact/about/support pages.
6. If nothing was found there, searches up to six more — admissions, departments, campus and
   careers pages, plus common contact URLs that some sites only link from JavaScript menus.
7. Extracts public emails and exports the results.

On every page it reads the visible text, `mailto:` links, and structured data (`application/ld+json`
and `itemprop="email"`), and it understands addresses written for humans rather than parsers, such
as `info [at] college [dot] edu`. It does not guess addresses.

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
| `src/web-search.ts` | The opt-in web-search fallback: the directory block list, the name-match check, and result parsing. |
| `src/checkpoint.ts` | Saves and restores run progress so `--resume` can continue an interrupted scrape. |
| `src/seen.ts` | Recognises a business across runs and reads which ones earlier exports settled. |
| `src/csv.ts` | Reads CSV back in, for `--skip-seen`. |
| `src/throttle.ts` | Adaptive pacing: backs off when a host refuses us, eases back when it stops. |
| `src/proxy.ts` | Reads proxy addresses and hands them out round-robin. |
| `src/exporter.ts` | Writes the CSV and `.xlsx` files and splits records into the outcome groups. |
| `src/concurrency.ts` | Bounded parallel map, with and without a per-slot reusable resource. |
| `src/retry.ts` | Retries transient network failures once; never retries permanent ones. |
| `src/errors.ts` | Trims Playwright's multi-line error dumps down to one readable cell. |
| `src/types.ts` | The shared `ScrapeOptions` and `BusinessRecord` shapes every module agrees on. |
| `src/app.ts`, `src/web/` | The optional local web interface (see below). |
| `tests/` | Vitest suites, one per module. |
| `docs/` | Design specs and implementation plans written before the code. |
| `CHANGELOG.md` | What changed in each version, and anything that breaks. |

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

**Sites start returning `website_blocked`** — the scraper already backs off on its own when this
happens. If it keeps happening, lower `--concurrency` and raise `--delay` to spread the requests
out, or route the run through proxies with `--proxy`. See
[Running at larger volumes](#running-at-larger-volumes).

## Local web app, saved for later

The browser interface is preserved but is not part of the normal workflow. When you want to return to it:

```sh
npm run app:later
```

It listens on `http://127.0.0.1:3000`, on the loopback address only. Set the `PORT` environment variable to use a different port.

## Development

Run the test suite (139 tests across 15 files, no network access required):

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
