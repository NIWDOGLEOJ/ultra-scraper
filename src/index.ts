import { parseOptions } from './config.js';
import { runScrape } from './run-scrape.js';

async function main() {
  const summary = await runScrape(parseOptions(process.argv.slice(2)), (event) => console.log(event.message));
  console.log(`\nExported ${summary.businessesProcessed} businesses (${summary.emailsFound} public emails) to:\n  ${summary.csvPath}\n  ${summary.xlsxPath}`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
