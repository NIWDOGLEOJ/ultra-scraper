# Local Scraper Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Mac-only web interface that launches local public-email scraper runs, streams their progress, and safely downloads the CSV/Excel outputs.

**Architecture:** Refactor the CLI work into one reusable `runScrape` function that reports structured progress. A Node HTTP server exposes controlled local endpoints and serves a static browser page that polls/streams run state; it is strictly bound to `127.0.0.1`.

**Tech Stack:** Node.js 20+, TypeScript, built-in `node:http`, Playwright, ExcelJS, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-25-local-scraper-web-app-design.md`

## Global Constraints

- Bind exactly to `127.0.0.1`; do not deploy, authenticate users, or expose cloud storage.
- Permit one active scrape only; parallel start requests return HTTP 409.
- Return controlled state/errors/filenames only, never raw scraped HTML or arbitrary project files.
- Download only output files belonging to the completed run and reject traversal paths.
- Preserve the current `npm run scrape` command and public-data boundaries.

---

## File structure

- `src/run-scrape.ts` — reusable scraper orchestration and progress events.
- `src/index.ts` — CLI wrapper for `runScrape`.
- `src/web/run-manager.ts` — one-at-a-time in-memory run state.
- `src/web/server.ts` — local HTTP routes, SSE, and safe download handling.
- `src/web/public/index.html`, `app.js`, `styles.css` — local browser interface.
- `src/app.ts` — local-app launch entry point.
- `tests/run-manager.test.ts`, `tests/server.test.ts` — no-network server tests.
- `README.md`, `package.json` — launch command and usage.

### Task 1: Extract reusable scraper orchestration

**Files:**
- Create: `src/run-scrape.ts`
- Modify: `src/index.ts`
- Test: `tests/run-scrape.test.ts`

**Interfaces:**
- Produces `runScrape(options: ScrapeOptions, onProgress?: (event: ProgressEvent) => void): Promise<RunSummary>`.
- Produces `ProgressEvent` with `stage`, `message`, `processed`, `total`, and `emailsFound` fields.

- [ ] **Step 1: Write the failing orchestration test**

```ts
it('reports completed export paths through a progress callback', async () => {
  const events: ProgressEvent[] = [];
  const summary = await runScrape(options, (event) => events.push(event), fakeDependencies);
  expect(events.at(-1)?.stage).toBe('complete');
  expect(summary.csvPath).toMatch(/\.csv$/);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/run-scrape.test.ts`

Expected: FAIL because `runScrape` is not exported.

- [ ] **Step 3: Implement reusable orchestration**

Move browser launch, collection, sequential website scans, export, and `finally` browser closure from `src/index.ts` into `runScrape`. Emit `starting`, `collecting_maps`, `scanning_websites`, `exporting`, `complete`, and `failed` events. Keep `src/index.ts` as a small `parseOptions` plus `runScrape` terminal callback wrapper.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/run-scrape.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/run-scrape.ts src/index.ts tests/run-scrape.test.ts
git commit -m "refactor: share scraper run orchestration"
```

### Task 2: Implement run-state management

**Files:**
- Create: `src/web/run-manager.ts`
- Test: `tests/run-manager.test.ts`

**Interfaces:**
- Produces `RunManager.start(input: WebRunInput): Promise<RunState>` and `RunManager.current(): RunState`.
- `RunState` includes `id`, `status`, `stage`, `message`, `processed`, `total`, `emailsFound`, `csvFilename`, `xlsxFilename`, and `error`.

- [ ] **Step 1: Write failing state tests**

```ts
it('rejects a second active run', async () => {
  manager.start({ query: 'cafes in Chennai', limit: 2, headed: false });
  await expect(manager.start({ query: 'bakeries in Chennai', limit: 2, headed: false })).rejects.toMatchObject({ statusCode: 409 });
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/run-manager.test.ts`

Expected: FAIL because `RunManager` does not exist.

- [ ] **Step 3: Implement validated run manager**

Validate nonblank query, integer limit `1..100`, and boolean headed. Start `runScrape` asynchronously; translate progress events into a safe `RunState`, retain only `basename()` values from completed export paths, and notify event listeners. Mark unexpected errors as `failed` with a concise string.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/run-manager.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/web/run-manager.ts tests/run-manager.test.ts
git commit -m "feat: manage one local scraper run"
```

### Task 3: Create the local-only HTTP server and downloads

**Files:**
- Create: `src/web/server.ts`
- Create: `src/app.ts`
- Test: `tests/server.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `createServer(manager: RunManager, outputDir: string): Server`.
- Produces `npm run app`, which listens at `http://127.0.0.1:3000`.

- [ ] **Step 1: Write failing route tests**

```ts
expect((await request(server, 'POST', '/api/runs', { query: '', limit: 20 })).status).toBe(400);
expect((await request(server, 'GET', '/downloads/../../package.json')).status).toBe(404);
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server.test.ts`

Expected: FAIL because `createServer` is not defined.

- [ ] **Step 3: Implement API, SSE, and safe files**

Serve `POST /api/runs`, `GET /api/runs/current`, `GET /api/runs/current/events`, and `GET /downloads/<filename>`. Parse JSON with a 64 KiB cap; respond with JSON headers; write SSE `data: <serialized state>\n\n` on state updates. Resolve downloads against `outputDir`, require the requested basename equals a completed run filename, require the resolved path begins with the resolved output directory plus separator, and return 404 otherwise. Bind only `127.0.0.1` and add an `app` script using `tsx src/app.ts`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/server.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```sh
git add src/web/server.ts src/app.ts tests/server.test.ts package.json
git commit -m "feat: add local scraper web server"
```

### Task 4: Build the local browser page and documentation

**Files:**
- Create: `src/web/public/index.html`
- Create: `src/web/public/app.js`
- Create: `src/web/public/styles.css`
- Modify: `README.md`

**Interfaces:**
- Consumes `/api/runs`, `/api/runs/current`, and `/api/runs/current/events`.
- Produces a browser form, live status, and two safe download links.

- [ ] **Step 1: Write a failing static-page assertion**

```ts
expect(readFileSync('src/web/public/index.html', 'utf8')).toContain('Start Scraping');
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/server.test.ts`

Expected: FAIL because the static page does not exist.

- [ ] **Step 3: Implement the page**

Create query/limit/headed controls and a submit handler that POSTs JSON. Use `EventSource` to update a status message/counts, disable controls while the state is active, display a readable failure error, and create CSV/Excel links only from `csvFilename`/`xlsxFilename` using `encodeURIComponent`. Include responsive local CSS without external assets.

- [ ] **Step 4: Update README and verify**

Add `npm run app`, the `http://127.0.0.1:3000` URL, UI controls, local-only behavior, and the existing responsible-use limitations. Run: `npm test -- --run && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Manual local check**

Run: `npm run app`, open `http://127.0.0.1:3000`, and confirm the form/status render. Start a `--limit 1` run only if Playwright Chromium is installed; otherwise verify the page and controlled error display without attempting to bypass browser-download or Maps restrictions.

- [ ] **Step 6: Commit**

```sh
git add src/web/public README.md tests/server.test.ts
git commit -m "feat: add local scraper interface"
```

## Plan self-review

- Spec coverage: the tasks cover local-only binding, start/status/SSE/download routes, one-run enforcement, path containment, static UI, CLI preservation, tests, README, and live verification.
- Placeholder scan: complete; no deferred implementation actions remain.
- Type consistency: `runScrape` emits `ProgressEvent`, `RunManager` maps it to `RunState`, and the server/UI expose only `RunState` fields.
