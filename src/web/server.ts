import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunManager } from './run-manager.js';

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const CONTENT_TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };

/** Decodes a path segment without letting a stray "%" take the whole process down. */
const safeDecode = (value: string): string | null => {
  try { return decodeURIComponent(value); } catch { return null; }
};

/** True when `candidate` really sits inside `root` (and is not a sibling sharing its prefix). */
const isInside = (root: string, candidate: string) => candidate === root || candidate.startsWith(`${root}${sep}`);

export function createLocalServer(manager: RunManager, outputDir = 'output') {
  // Resolved from this module, not the working directory, so the UI still loads when the app is
  // launched by absolute path from somewhere else.
  const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), 'public');
  const outputRoot = resolve(outputDir);

  return createServer(async (req, res) => {
    let url: URL;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); } catch { return json(res, 400, { error: 'Bad request.' }); }

    if (req.method === 'GET' && url.pathname === '/api/runs/current') return json(res, 200, manager.current());

    if (req.method === 'GET' && url.pathname === '/api/runs/current/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const send = (state: unknown) => res.write(`data: ${JSON.stringify(state)}\n\n`);
      send(manager.current());
      const unsubscribe = manager.subscribe(send);
      req.on('close', unsubscribe);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/runs') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; if (body.length > 65_536) req.destroy(); });
      req.on('end', async () => {
        try {
          const input = JSON.parse(body);
          json(res, 202, await manager.start({ query: String(input.query ?? ''), limit: Number(input.limit), headed: Boolean(input.headed), contactFilter: input.contactFilter }));
        } catch (error) {
          json(res, Number((error as { statusCode?: number }).statusCode) || 400, { error: error instanceof Error ? error.message : 'Invalid request.' });
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/downloads/')) {
      const file = safeDecode(url.pathname.slice('/downloads/'.length));
      const state = manager.current();
      if (file === null || (file !== state.csvFilename && file !== state.xlsxFilename)) return json(res, 404, { error: 'File not found.' });
      const candidate = resolve(outputRoot, file);
      if (!isInside(outputRoot, candidate)) return json(res, 404, { error: 'File not found.' });
      // `.pipe()` does not forward source errors: without this listener a deleted or locked file
      // raises an unhandled 'error' event and terminates the whole server.
      const stream = createReadStream(candidate);
      stream.once('error', () => { if (res.headersSent) res.destroy(); else json(res, 404, { error: 'File not found.' }); });
      stream.once('open', () => {
        res.writeHead(200, {
          'Content-Type': file.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${file.replaceAll('"', '')}"`,
        });
        stream.pipe(res);
      });
      return;
    }

    const requested = safeDecode(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    if (requested === null) return json(res, 404, { error: 'Not found.' });
    const candidate = resolve(publicDir, requested);
    if (!isInside(publicDir, candidate)) return json(res, 404, { error: 'Not found.' });
    try {
      const content = await readFile(candidate);
      res.writeHead(200, { 'Content-Type': `${CONTENT_TYPES[extname(candidate)] ?? 'text/plain'}; charset=utf-8` });
      res.end(content);
    } catch {
      json(res, 404, { error: 'Not found.' });
    }
  });
}
