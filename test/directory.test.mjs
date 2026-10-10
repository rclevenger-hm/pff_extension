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
test('revoking access while a download is running prevents cache recreation', async () => {
  const state = harness();
  let allowed = true;
  const result = await loadDirectory({ ...state, permissions: { contains: async () => allowed }, fetcher: async () => {
    allowed = false;
    return new Response(JSON.stringify(rawPlayers));
  } });
  assert.equal(result.needsPermission, true);
  assert.equal(result.directory, null);
  assert.equal(state.data[DIRECTORY_KEY], undefined);
});

test('a failed refresh does not return a directory removed by another panel', async () => {
  const state = harness(cached(now - MAX_AGE_MS - 1));
  const result = await loadDirectory({ ...state, fetcher: async () => {
    delete state.data[DIRECTORY_KEY];
    throw new Error('offline after deletion');
  } });
  assert.equal(result.directory, null);
  assert.equal(result.stale, false);
  assert.ok(result.error);
  assert.equal(state.data[DIRECTORY_KEY], undefined);
});

test('concurrent panels all receive the removed-cache fallback and can download again', async () => {
  const state = harness(cached(now - MAX_AGE_MS - 1));
  let downloads = 0;
  const started = Promise.withResolvers();
  const pending = Promise.withResolvers();
  const fetcher = () => { downloads++; started.resolve(); return pending.promise; };
  const first = loadDirectory({ ...state, fetcher });
  await started.promise;
  const second = loadDirectory({ ...state, fetcher });
  // Let the second panel finish its cache/permission reads and join the request.
  await new Promise(resolve => setImmediate(resolve));
  delete state.data[DIRECTORY_KEY];
  pending.reject(new Error('offline after deletion'));
  const results = await Promise.all([first, second]);
  assert.equal(downloads, 1);
  for (const result of results) { assert.equal(result.directory, null); assert.equal(result.stale, false); assert.ok(result.error); }
  const retried = await loadDirectory({ ...state, fetcher: async () => new Response(JSON.stringify(rawPlayers)) });
  assert.equal(retried.directory.players.length, 12);
  assert.equal(retried.stale, false);
});

test('a failed refresh returns the current persisted cache rather than an older snapshot', async () => {
  const state = harness(cached(now - MAX_AGE_MS - 1));
  const replacement = cached(now - 1000);
  const result = await loadDirectory({ ...state, fetcher: async () => {
    state.data[DIRECTORY_KEY] = replacement;
    return new Response('', { status: 503 });
  } });
  assert.equal(result.directory, replacement);
  assert.ok(result.error);
});

test('invalidated fallback caches are rejected after provider failure', async () => {
  for (const invalid of [{ version: 2 }, { version: 1, fetchedAt: now, players: [] }, { ...cached(), fetchedAt: 'invalid' }]) {
    const state = harness(cached(now - MAX_AGE_MS - 1));
    const result = await loadDirectory({ ...state, fetcher: async () => {
      state.data[DIRECTORY_KEY] = invalid;
      throw new Error('offline');
    } });
    assert.equal(result.directory, null);
    assert.equal(result.stale, false);
  }
});

test('fallback storage failures reject without leaking the old cache and allow a retry', async () => {
  const state = harness(cached(now - MAX_AGE_MS - 1));
  const get = state.storage.get;
  await assert.rejects(loadDirectory({ ...state, fetcher: async () => {
    state.storage.get = async () => { throw new Error('storage unavailable'); };
    throw new Error('offline');
  } }), /storage unavailable/);
  state.storage.get = get;
  const result = await loadDirectory({ ...state, fetcher: async () => new Response(JSON.stringify(rawPlayers)) });
  assert.equal(result.stale, false);
  assert.equal(result.directory.fetchedAt, now);
});

