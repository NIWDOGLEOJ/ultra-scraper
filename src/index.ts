import { parseOptions } from './config.js';
import { runScrape } from './run-scrape.js';

async function main() {
  const summary = await runScrape(parseOptions(process.argv.slice(2)), (event) => console.log(event.message));
  const skipped = summary.skippedSeen > 0 ? `, ${summary.skippedSeen} skipped as already seen` : '';
  const files = summary.paths.map((path) => `  ${path}`).join('\n');
  console.log(`\nExported ${summary.businessesProcessed} businesses (${summary.emailsFound} public emails${skipped}) to:\n${files}`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
