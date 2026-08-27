import { describe, expect, it } from 'vitest';
import { ProxyRotation, parseProxies, parseProxy } from '../src/proxy.js';

describe('reading a proxy address', () => {
  it('takes a plain host and port, assuming http', () => {
    expect(parseProxy('10.0.0.1:8080')).toEqual({ server: 'http://10.0.0.1:8080' });
  });

  it('keeps the scheme when one is given', () => {
    expect(parseProxy('socks5://proxy.example:1080')).toEqual({ server: 'socks5://proxy.example:1080' });
    expect(parseProxy('https://proxy.example:8443')).toEqual({ server: 'https://proxy.example:8443' });
  });

  it('drops a redundant default port, which means the same thing', () => {
    expect(parseProxy('https://proxy.example:443')).toEqual({ server: 'https://proxy.example' });
    expect(parseProxy('http://proxy.example:80')).toEqual({ server: 'http://proxy.example' });
  });

  it('splits credentials out of the URL, since Playwright wants them separately', () => {
    expect(parseProxy('http://alice:s3cret@proxy.example:8080')).toEqual({
      server: 'http://proxy.example:8080', username: 'alice', password: 's3cret',
    });
  });

  it('decodes escaped characters in credentials', () => {
    expect(parseProxy('http://user%40corp:p%40ss@proxy.example:8080')).toEqual({
      server: 'http://proxy.example:8080', username: 'user@corp', password: 'p@ss',
    });
  });

  it('rejects an unusable address rather than failing later mid-run', () => {
    expect(() => parseProxy('')).toThrow('must not be empty');
    expect(() => parseProxy('ftp://proxy.example:21')).toThrow('http, https or socks5');
    expect(() => parseProxy('http://')).toThrow();
  });
});

describe('a list of proxies', () => {
  it('reads a comma-separated list, trimming as it goes', () => {
    expect(parseProxies(' 10.0.0.1:8080 , socks5://10.0.0.2:1080 ')).toEqual([
      { server: 'http://10.0.0.1:8080' },
      { server: 'socks5://10.0.0.2:1080' },
    ]);
  });

  it('rejects an empty list', () => {
    expect(() => parseProxies('  ')).toThrow('at least one');
  });

  it('names the offending entry when one of several is bad', () => {
    expect(() => parseProxies('10.0.0.1:8080,ftp://nope')).toThrow('ftp://nope');
  });
});

describe('rotation', () => {
  it('does nothing when no proxies are configured', () => {
    const rotation = new ProxyRotation();
    expect(rotation.enabled).toBe(false);
    expect(rotation.size).toBe(0);
    expect(rotation.next()).toBeUndefined();
    expect(rotation.first()).toBeUndefined();
  });

  it('cycles through the list in order and wraps around', () => {
    const rotation = new ProxyRotation(parseProxies('a.test:1,b.test:2,c.test:3'));
    const servers = [rotation.next(), rotation.next(), rotation.next(), rotation.next()].map((p) => p?.server);
    expect(servers).toEqual(['http://a.test:1', 'http://b.test:2', 'http://c.test:3', 'http://a.test:1']);
  });

  it('reports the first entry for the browser-level proxy Chromium requires', () => {
    const rotation = new ProxyRotation(parseProxies('a.test:1,b.test:2'));
    expect(rotation.first()?.server).toBe('http://a.test:1');
    rotation.next();
    expect(rotation.first()?.server).toBe('http://a.test:1');   // unaffected by rotation
  });
});
