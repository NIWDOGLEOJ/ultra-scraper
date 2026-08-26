# Local Scraper Web App Design

## Purpose

Provide a Mac-only browser interface for the existing Google Maps public-email scraper. The app makes the current command-line workflow available through a simple page while preserving the CLI for terminal use.

## Scope and boundaries

The web app runs locally on `127.0.0.1` and is not publicly deployed. It has no login, cloud storage, database, or external API beyond the existing Maps and business-website browsing performed by the scraper. Results and downloads stay in the project `output/` directory.

The app preserves the scraper's public-data boundaries: it does not authenticate, bypass CAPTCHAs or access controls, or infer email addresses.

## Interface

The home screen includes:

- A required Google Maps search query, such as `colleges in Chennai`.
- A results limit, defaulting to `20`.
- A `Show browser while scraping` checkbox, enabled by default for visibility.
- A **Start Scraping** button.

When a run starts, form controls are disabled. A status panel displays a plain-language current stage and result counts as available: starting browser, collecting Maps listings, scanning business websites, exporting files, complete, or failed.

On completion, the page displays the number of businesses processed and public emails found, with separate download buttons for CSV and Excel. A failed run shows a readable error and restores the form so the user can start another run.

## Local server and API

A small Node HTTP server serves the static page and exposes a local JSON API.

- `POST /api/runs` validates the request and starts a scrape when no run is active.
- `GET /api/runs/current` returns the current or most recently completed run state.
- `GET /api/runs/current/events` provides progress updates using server-sent events.
- `GET /downloads/<filename>` downloads only a completed run's CSV or Excel output after validating that the resolved path stays within the project output directory.

Only one run may execute at a time. A second start request during an active run receives an informative `409 Conflict` response rather than creating a competing Playwright session.

## Integration

The current CLI orchestration is refactored into an importable function that accepts scrape options and a progress callback. The CLI invokes that same function with terminal logging, while the local server invokes it with progress events. Browser lifecycle management, status mapping, export behavior, and data boundaries remain centralized in the scraper modules.

## Reliability and security

The server binds exactly to `127.0.0.1` and uses a configurable local port with a default of `3000`. It rejects malformed JSON, blank queries, invalid numeric limits, and download paths that contain traversal attempts or are not one of the run's completed files.

The server never exposes arbitrary project files. It does not return raw website page content; it returns only controlled run status, counts, concise error messages, and the generated filenames.

## Testing

Automated tests run without live Maps access. They cover request validation, a second run rejected while one is active, state transitions from queued through completed/failed, correct local-only binding configuration, server-sent progress event formatting, and download route path containment. Existing parser/export tests continue to run.

## Acceptance criteria

1. `npm run app` starts the local app and prints `http://127.0.0.1:3000`.
2. The browser page starts a scrape with query, limit, and headed controls.
3. The page shows live stages and completes with CSV/Excel download buttons.
4. Only one scrape can run at a time.
5. The CLI command continues to work.
6. The server is local-only and cannot serve arbitrary files.
