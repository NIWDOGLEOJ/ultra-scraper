/** Playwright wants the credentials separate from the server URL, not embedded in it. */
export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

const SUPPORTED = ['http:', 'https:', 'socks5:'];

export function parseProxy(value: string): ProxyConfig {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('proxy must not be empty.');
  // A bare host:port is the most common way people write one down.
  const withScheme = /^[a-z0-9+.-]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try { url = new URL(withScheme); } catch { throw new Error(`proxy is not a valid address: ${trimmed}`); }
  if (!SUPPORTED.includes(url.protocol)) throw new Error(`proxy must be http, https or socks5: ${trimmed}`);
  if (!url.hostname) throw new Error(`proxy is missing a host: ${trimmed}`);

  const config: ProxyConfig = { server: `${url.protocol}//${url.host}` };
  if (url.username) config.username = decodeURIComponent(url.username);
  if (url.password) config.password = decodeURIComponent(url.password);
  return config;
}

export function parseProxies(value: string): ProxyConfig[] {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) throw new Error('proxy must name at least one address.');
  return parts.map(parseProxy);
}

/**
 * Hands out proxies round-robin, so consecutive businesses are fetched from different addresses
 * rather than all of them hammering one. Empty means no proxy at all, which is the default.
 */
export class ProxyRotation {
  private index = 0;

  constructor(private readonly proxies: readonly ProxyConfig[] = []) {}

  get size(): number { return this.proxies.length; }
  get enabled(): boolean { return this.proxies.length > 0; }

  /** The one to launch the browser with; Chromium needs a global proxy before per-context ones work. */
  first(): ProxyConfig | undefined { return this.proxies[0]; }

  next(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.index % this.proxies.length];
    this.index += 1;
    return proxy;
  }
}
