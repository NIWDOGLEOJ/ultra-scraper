import { RunManager } from './web/run-manager.js';
import { createLocalServer } from './web/server.js';

const port = Number(process.env.PORT ?? 3000);
const server = createLocalServer(new RunManager());

server.on('error', (error: NodeJS.ErrnoException) => {
  const reason = error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Close the other program, or start this one with a different port:\n  PORT=3100 npm run app:later        (macOS / Linux)\n  set PORT=3100 && npm run app:later (Windows cmd)\n  $env:PORT=3100; npm run app:later  (Windows PowerShell)`
    : error.message;
  console.error(`\nCould not start the local app.\n${reason}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => console.log(`Local scraper app: http://127.0.0.1:${port}`));
