# Changelog

## 0.3.0

### Breaking

**A run now writes one file per format instead of eight.**

Previously every run produced `maps-emails-`, `contacts-`, `no-contact-` and `failures-` files,
each in every format — eight files by default. In a typical run `maps-emails-` and `contacts-`
were byte-identical and the other two contained only a header.

The three grouped files are gone. Each was a filter on the `status` column that every export
already carries, so they only duplicated the data.

**If you had a script reading `contacts-*.csv`, `no-contact-*.csv` or `failures-*.csv`, point it at
`maps-emails-*.csv` and filter on `status`:**

| Old file | Same rows, from the one export |
| --- | --- |
| `contacts-` | `status` is `success`, or `phone` is not empty |
| `no-contact-` | `status` is `no_email_found` or `no_website` |
| `failures-` | `status` contains `error`, `timeout` or `blocked` |

```sh
jq '.businesses[] | select(.status | test("error|timeout|blocked"))' output/maps-emails-*.json
```

Nothing else changed shape. Existing exports are still readable, and `--skip-seen` still reads
files written by earlier versions.

### Added

- **`--csv`, `--xlsx`, `--json`, `--jsonl`, `--md`** — pick the file you want. One flag, one file.
  `--format csv,json` still works for scripts.
- **Markdown output** (`--md`) — a heading with the query and counts, then a table. Link columns
  render compactly so the table stays readable.
- **JSON and JSON Lines output** — arrays stay arrays and phone numbers keep their `+`, neither of
  which CSV can manage. JSON also records the query, limit and counts that produced it.
- **`--resume`** — a crash or `Ctrl-C` no longer loses a long run. Progress is checkpointed to
  `<output>/.checkpoints/` and the run tells you the command to continue with.
- **`--skip-seen`** — skips businesses that earlier exports in the output folder already settled,
  so re-running a search reports what is new. Rows that failed last time are retried, not skipped.
- **`--proxy`** — rotate through one or more `http`/`https`/`socks5` proxies, round-robin.
- **`--max-delay`** — ceiling for the automatic backoff.
- **`--web-search-fallback`** — for businesses with no website in Maps, look one up by web search.
  Needs a `BRAVE_SEARCH_API_KEY` to find anything; safe but inert without one.
- **Automatic backoff.** A refusal (HTTP 401/403/429) slows the run down and it eases back once the
  refusals stop. A `Retry-After` header is obeyed. Nothing to configure.
- **A deeper email search.** When the obvious contact pages yield nothing, up to six more are tried,
  structured data is read alongside the visible text, and addresses written for humans
  (`info [at] college [dot] edu`) are understood.

### Fixed

- Phone numbers were being corrupted in the Excel export by a guard that only CSV needs.
- The `category` column was empty on every row.
- A failing contact page discarded emails already found on the homepage.
- `--timeout` was ignored by most page operations, which used Playwright's 30s default instead.
- A run that collected zero listings reported success and wrote an empty file.
- Emails glued to adjacent text (`044-22352257echquery@yahoo.com`) are now separated.
- Unrelated third-party addresses and staff-directory floods are filtered out.

## 0.2.0

- Cross-platform support for Windows, macOS and Linux.
- Roughly 3× faster through parallel scanning.
- CSV written as UTF-8 with a BOM so Excel on Windows reads non-English names correctly.
