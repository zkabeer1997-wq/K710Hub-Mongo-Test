import { readFileSync } from 'node:fs';

export const fixture = (name) => readFileSync(new URL(`../fixtures/external/${name}`, import.meta.url), 'utf8');
export const fixtureJson = (name) => JSON.parse(fixture(name));

const ROBOTS_OK = 'User-agent: *\nAllow: /\n';

/** A fetch stand-in serving the saved fixtures; records every call. `overrides` maps url -> Response-like. */
export function fakeFetch({ robots = ROBOTS_OK, overrides = {} } = {}) {
  const calls = [];
  const res = (status, body, headers = {}) => ({
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const impl = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if (typeof overrides[url] === 'function') return overrides[url](init);
    if (overrides[url]) return overrides[url];
    if (url.endsWith('/robots.txt')) return res(200, robots);
    if (url.endsWith('/api/kvk-timeline')) return res(200, fixture('optimizer-timeline-710.json'));
    if (url.endsWith('/api/kvk-rankings')) {
      const body = JSON.parse(init.body || '{}');
      return res(200, fixture(body.type === 'kingdom' ? 'optimizer-kingdom-710.json' : 'optimizer-matchups.json'));
    }
    if (url === 'https://ks-atlas.com/kingdom/710') return res(200, fixture('atlas-kingdom-710.html'));
    return res(404, 'nope');
  };
  impl.calls = calls;
  impl.res = res;
  return impl;
}
