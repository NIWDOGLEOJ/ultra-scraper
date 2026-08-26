// Public-suffix labels that act as a second level ("citycollege.edu.in", "bbc.co.uk").
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac', 'or', 'ne', 'sch', 'res', 'nic', 'mil', 'gob', 'go', 'in']);

/** Reduces a hostname to the domain a business actually owns, so www/subdomains still match. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const secondLast = labels[labels.length - 2] ?? '';
  return labels.slice(SECOND_LEVEL.has(secondLast) ? -3 : -2).join('.');
}

export function sameSite(hostname: string, otherHostname: string): boolean {
  const domain = registrableDomain(hostname);
  return domain !== '' && domain === registrableDomain(otherHostname);
}
