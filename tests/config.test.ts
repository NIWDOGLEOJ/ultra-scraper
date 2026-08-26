import { describe, expect, it } from 'vitest';
import { autoConcurrency, parseOptions } from '../src/config.js';

describe('parseOptions', () => {
  it('uses safe defaults for a query', () => {
    expect(parseOptions(['cafes in Chennai'])).toEqual({
      query: 'cafes in Chennai',
      limit: 20,
      outputDir: 'output',
      headed: false,
      delayMs: 1200,
      timeoutMs: 15_000,
      maxEmails: 25,
      concurrency: 5,
      deep: true,
      webSearchFallback: false,
      resume: false,
      skipSeen: false,
      formats: ['csv', 'xlsx'],
      maxDelayMs: 30_000,
      proxies: [],
      contactFilter: 'both',
    });
  });

  it('parses supported options', () => {
    expect(parseOptions(['bakeries in Madurai', '--limit', '5', '--output', 'exports', '--headed', '--delay', '500', '--timeout', '8000', '--max-emails', '10', '--concurrency', '8', '--format', 'json,jsonl', '--max-delay', '9000', '--proxy', 'http://u:p@10.0.0.1:8080,10.0.0.2:3128', '--contact', 'emails'])).toEqual({
      query: 'bakeries in Madurai',
      limit: 5,
      outputDir: 'exports',
      headed: true,
      delayMs: 500,
      timeoutMs: 8_000,
      maxEmails: 10,
      concurrency: 8,
      deep: true,
      webSearchFallback: false,
      resume: false,
      skipSeen: false,
      formats: ['json', 'jsonl'],
      maxDelayMs: 9000,
      proxies: [{ server: 'http://10.0.0.1:8080', username: 'u', password: 'p' }, { server: 'http://10.0.0.2:3128' }],
      contactFilter: 'emails',
    });
  });

  it('rejects an empty query and unsafe values', () => {
    expect(() => parseOptions([''])).toThrow('search query');
    expect(() => parseOptions(['cafes', '--limit', '0'])).toThrow('limit');
    expect(() => parseOptions(['cafes', '--delay', '-1'])).toThrow('delay');
    expect(() => parseOptions(['cafes', '--max-emails', '0'])).toThrow('max-emails');
    expect(() => parseOptions(['cafes', '--contact', 'socials'])).toThrow('contact');
    expect(() => parseOptions(['cafes', '--concurrency', '0'])).toThrow('concurrency');
    expect(() => parseOptions(['cafes', '--concurrency', '99'])).toThrow('16 or less');
    expect(() => parseOptions(['cafes', '--format', 'pdf'])).toThrow('Not recognised: pdf');
    expect(() => parseOptions(['cafes', '--format', ' '])).toThrow('at least one');
    expect(() => parseOptions(['cafes', '--max-delay', '-1'])).toThrow('max-delay');
    expect(() => parseOptions(['cafes', '--proxy', 'ftp://nope'])).toThrow('http, https or socks5');
  });

  it('keeps the web-search fallback off unless it is asked for', () => {
    expect(parseOptions(['cafes']).webSearchFallback).toBe(false);
    expect(parseOptions(['cafes', '--web-search-fallback']).webSearchFallback).toBe(true);
  });

  it('keeps resume off unless it is asked for', () => {
    expect(parseOptions(['cafes']).resume).toBe(false);
    expect(parseOptions(['cafes', '--resume']).resume).toBe(true);
  });

  it('uses no proxy unless one is named', () => {
    expect(parseOptions(['cafes']).proxies).toEqual([]);
    expect(parseOptions(['cafes', '--proxy', '10.0.0.1:8080']).proxies).toEqual([{ server: 'http://10.0.0.1:8080' }]);
  });

  it('keeps skip-seen off unless it is asked for', () => {
    expect(parseOptions(['cafes']).skipSeen).toBe(false);
    expect(parseOptions(['cafes', '--skip-seen']).skipSeen).toBe(true);
  });

  it('points the user at --help instead of printing a raw commander error twice', () => {
    expect(() => parseOptions(['cafes', '--nonsense'])).toThrow(/--help/);
  });
});

describe('autoConcurrency', () => {
  it('scales parallel scanning with the size of the job', () => {
    expect(autoConcurrency(5)).toBe(4);
    expect(autoConcurrency(20)).toBe(5);
    expect(autoConcurrency(50)).toBe(10);
    expect(autoConcurrency(500)).toBe(10);
  });

  it('follows --limit unless the user names a value', () => {
    expect(parseOptions(['cafes', '--limit', '50']).concurrency).toBe(10);
    expect(parseOptions(['cafes', '--limit', '50', '--concurrency', '2']).concurrency).toBe(2);
  });
});
