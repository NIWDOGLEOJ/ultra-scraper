import { describe, expect, it } from 'vitest';
import { BLOCKED_HOSTS, buildSearchQuery, chooseCandidate, isBlockedHost, isConfidentMatch, nameMatchScore, nameTokens, searchUrl, unwrapRedirect } from '../src/web-search.js';

describe('domain block list', () => {
  it('blocks directories, aggregators and social profiles', () => {
    for (const host of ['www.yelp.com', 'justdial.com', 'facebook.com', 'in.linkedin.com', 'www.google.co.in', 'tripadvisor.in', 'yellowpages.com', 'instagram.com']) {
      expect(isBlockedHost(host), host).toBe(true);
    }
  });

  it('blocks subdomains of a blocked host', () => {
    expect(isBlockedHost('business.facebook.com')).toBe(true);
    expect(isBlockedHost('m.justdial.com')).toBe(true);
  });

  it('does not block a business running its own site', () => {
    for (const host of ['loyolacollege.edu', 'www.maruthidental.com', 'cafetotaram.com', 'shasuncollege.edu.in']) {
      expect(isBlockedHost(host), host).toBe(false);
    }
  });

  it('does not block site builders, where small businesses genuinely host', () => {
    expect(isBlockedHost('mycafe.wixsite.com')).toBe(false);
    expect(isBlockedHost('mycafe.wordpress.com')).toBe(false);
  });

  it('is not fooled by a lookalike domain that merely ends in the same letters', () => {
    expect(isBlockedHost('notyelp.com')).toBe(false);
    expect(isBlockedHost('myfacebook.com')).toBe(false);
  });

  it('keeps the list in one editable constant', () => {
    expect(BLOCKED_HOSTS).toContain('yelp.com');
    expect(BLOCKED_HOSTS.length).toBeGreaterThan(20);
  });
});

describe('name matching', () => {
  it('drops words that identify nothing', () => {
    expect(nameTokens('The Best Cafe Pvt Ltd')).toEqual(['cafe']);
    expect(nameTokens('Meenakshi College of Engineering')).toEqual(['meenakshi', 'college', 'engineering']);
  });

  it('scores by how much of the business name the candidate carries', () => {
    expect(nameMatchScore('Maruthi Dental', 'Maruthi Dental Clinic Coimbatore')).toBe(1);
    expect(nameMatchScore('Maruthi Dental', 'Completely Unrelated Page')).toBe(0);
  });

  it('matches a name that the domain runs together', () => {
    expect(isConfidentMatch('Loyola College', 'Loyola College Chennai', 'loyolacollege.edu')).toBe(true);
    expect(isConfidentMatch('Arasu Dental Care', '', 'arasudentalcare.com')).toBe(true);
  });

  it('accepts a genuine match on the result title', () => {
    expect(isConfidentMatch("St Joseph's College Of Engineering", "St Joseph's College of Engineering, Chennai", 'stjosephs.ac.in')).toBe(true);
  });

  it('rejects an unrelated result rather than guessing', () => {
    expect(isConfidentMatch('Maruthi Dental', 'Chennai Tourism Guide', 'chennaitourism.org')).toBe(false);
    expect(isConfidentMatch('GUGU Dental Clinics', 'Apollo Hospitals', 'apollohospitals.com')).toBe(false);
  });

  it('rejects a match carried only by a short or generic fragment', () => {
    expect(isConfidentMatch('SA Engineering College', 'SA Travels', 'satravels.in')).toBe(false);
  });

  it('rejects an empty business name', () => {
    expect(isConfidentMatch('', 'Anything', 'anything.com')).toBe(false);
  });
});

describe('search plumbing', () => {
  it('quotes the business name and appends the address', () => {
    expect(buildSearchQuery('Blue Cafe', '12 Main Rd, Madurai')).toBe('"Blue Cafe" 12 Main Rd, Madurai');
    expect(searchUrl('"Blue Cafe" Madurai')).toContain('q=%22Blue%20Cafe%22%20Madurai');
  });

  it('unwraps the search engine redirect, and ignores non-http links', () => {
    expect(unwrapRedirect('//duckduckgo.com/l/?uddg=https%3A%2F%2Fcafe.in%2F&rut=abc')).toBe('https://cafe.in/');
    // Bing wraps targets as base64url in a "u=a1..." parameter.
    const encoded = Buffer.from('https://maruthidental.com/').toString('base64url');
    expect(unwrapRedirect(`https://www.bing.com/ck/a?!&&p=abc&u=a1${encoded}`)).toBe('https://maruthidental.com/');
    expect(unwrapRedirect('https://www.bing.com/ck/a?u=a1bm90LWEtdXJs')).toBe('');
    expect(unwrapRedirect('https://cafe.in/')).toBe('https://cafe.in/');
    expect(unwrapRedirect('javascript:void(0)')).toBe('');
    expect(unwrapRedirect('::::')).toBe('');
    expect(unwrapRedirect('/relative/path')).toBe('');
    expect(unwrapRedirect('//duckduckgo.com/l/?uddg=javascript%3Aalert(1)')).toBe('');
  });
});

describe('candidate selection', () => {
  const result = (href: string, title = '') => ({ href, title });

  it('skips blocked hosts and takes the first real site', () => {
    const results = [result('https://www.justdial.com/x', 'Maruthi Dental'), result('https://www.facebook.com/y', 'Maruthi Dental'), result('https://maruthidental.com/', 'Maruthi Dental')];
    expect(chooseCandidate('Maruthi Dental', results)).toBe('https://maruthidental.com/');
  });

  it('rejects rather than reaching further down the page when the first real result does not match', () => {
    const results = [result('https://www.yelp.com/x', 'Maruthi Dental'), result('https://chennaitourism.org/', 'Chennai Tourism'), result('https://maruthidental.com/', 'Maruthi Dental')];
    expect(chooseCandidate('Maruthi Dental', results)).toBe('');
  });

  it('returns nothing for an empty or all-blocked result list', () => {
    expect(chooseCandidate('Maruthi Dental', [])).toBe('');
    expect(chooseCandidate('Maruthi Dental', [result('https://www.yelp.com/x', 'Maruthi Dental')])).toBe('');
  });

  it('unwraps redirected results before judging them', () => {
    expect(chooseCandidate('Arasu Dental Care', [result('//duckduckgo.com/l/?uddg=https%3A%2F%2Farasudentalcare.com%2F', 'Arasu Dental Care')])).toBe('https://arasudentalcare.com/');
  });
});
