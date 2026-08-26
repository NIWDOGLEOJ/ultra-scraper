/** Playwright errors carry a multi-line "Call log:" dump that turns one CSV cell into a wall of text. */
export function describeError(error: unknown, fallback = 'Unexpected error'): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const firstLine = message.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  if (!firstLine) return fallback;
  return firstLine.length > 200 ? `${firstLine.slice(0, 197)}…` : firstLine;
}
