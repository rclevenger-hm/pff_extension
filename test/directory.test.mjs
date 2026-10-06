import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadDirectory, DIRECTORY_KEY, DIRECTORY_URL, MAX_AGE_MS } from '../lib/directory.js';
import { normalizeDirectory } from '../lib/players.js';
import { rawPlayers } from './fixtures.mjs';
const now = Date.now();
function harness(cache, permission = true) {
  const data = cache ? { [DIRECTORY_KEY]: cache } : {};
  return { data, now, storage: { get: async () => data, set: async value => Object.assign(data, value) }, permissions: { contains: async () => permission } };
}
const cached = (fetchedAt = now) => ({ version: 1, fetchedAt, players: normalizeDirectory(rawPlayers) });
test('fresh directory stays local without a network call or permission', async () => {
  const state = harness(cached(), false);
  const result = await loadDirectory({ ...state, fetcher: () => { throw new Error('Unexpected download'); } });
  assert.equal(result.stale, false); assert.equal(result.directory.players.length, 12);
});
test('first use asks for optional permission without fetching', async () => {
  const result = await loadDirectory({ ...harness(null, false), fetcher: () => assert.fail('Unexpected download') });
  assert.equal(result.needsPermission, true); assert.equal(result.directory, null);
});
test('successful download strips excess data and persists the normalized directory', async () => {
  const state = harness(); let count = 0;
  const result = await loadDirectory({ ...state, fetcher: async (url, options) => {
    count++; assert.equal(url, DIRECTORY_URL); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify(rawPlayers));
  } });
  assert.equal(count, 1); assert.equal(result.directory.players.length, 12);
  assert.equal(state.data[DIRECTORY_KEY].version, 1);
});
test('expired directory survives provider outages and is explicitly marked stale', async () => {
  const state = harness(cached(now - MAX_AGE_MS - 1));
  for (const fetcher of [async () => { throw new Error('offline'); }, async () => new Response('{}'), async () => new Response('bad'), async () => new Response('',{status:429}), async () => new Response('x',{headers:{'content-length':30*1024*1024}})]) {
    const result = await loadDirectory({ ...state, fetcher });
    assert.equal(result.stale, true); assert.ok(result.error); assert.equal(result.directory.players.length, 12);
  }
});
test('concurrent panels share a single network request', async () => {
  const state = harness(); let downloads = 0;
  const fetcher = async () => { downloads++; await new Promise(resolve => setTimeout(resolve, 5)); return new Response(JSON.stringify(rawPlayers)); };
  await Promise.all([loadDirectory({ ...state, fetcher }), loadDirectory({ ...state, fetcher })]);
  assert.equal(downloads, 1);
});
