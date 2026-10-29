import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchSessions, RESET_KEY } from '../lib/sessions.js';

function harness(initial = {}) {
  const data = structuredClone(initial);
  const reads = [], writes = [];
  const storage = {
    async get(keys) {
      reads.push(keys);
      if (keys == null) return structuredClone(data);
      const names = Array.isArray(keys) ? keys : [keys];
      return structuredClone(Object.fromEntries(names.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])));
    },
    async set(values) {
      writes.push(structuredClone(values));
      Object.assign(data, structuredClone(values));
    },
  };
  return { data, reads, writes, storage, sessions: createResearchSessions(storage) };
}

const state = (query = 'Justin Herbert', id = '1') => ({ query, selectedId: id, recentIds: [id, '2'], lastRequestAt: 123 });
const cleared = (value, generation) => ({ ...value, selectedId: null, recentIds: [], generation });

test('legacy sessions load together with their window request and accept legacy saves', async () => {
  const request = { query: 'DK Metcalf', requestedAt: 456 };
  const h = harness({ 'researchUI:7': state(), 'research:7': request });
  assert.deepEqual(await h.sessions.load(7), { generation: null, state: { ...state(), generation: null }, request });
  assert.deepEqual(h.reads, [[RESET_KEY, 'researchUI:7', 'research:7']]);
  assert.deepEqual(await h.sessions.save(7, state('Josh Allen', '3')), { generation: null, cleared: false });
  assert.deepEqual(h.data['researchUI:7'], { ...state('Josh Allen', '3'), generation: null });
  assert.deepEqual(await h.sessions.load(8), { generation: null, state: null, request: null });
});

test('clear removes identities from every persisted window without relying on open panels', async () => {
  const request = { query: 'Justin Herbert', requestedAt: 123 };
  const h = harness({
    'researchUI:0': state(),
    'researchUI:8': state('DK Metcalf', '3'),
    'researchUI:92': state('Josh Allen', '4'),
    'research:8': request,
    unrelated: { keep: true },
    'researchUI:invalid': { keep: 'not a window' },
    'researchUI:-1': { keep: 'not a real window' },
  });
  const { generation } = await h.sessions.clear();
  assert.equal(typeof generation, 'string');
  assert.ok(generation.length > 0);
  assert.equal(h.data[RESET_KEY], generation);
  assert.deepEqual(h.data['researchUI:0'], cleared(state(), generation));
  assert.deepEqual(h.data['researchUI:8'], cleared(state('DK Metcalf', '3'), generation));
  assert.deepEqual(h.data['researchUI:92'], cleared(state('Josh Allen', '4'), generation));
  assert.deepEqual(h.data['research:8'], request);
  assert.deepEqual(h.data.unrelated, { keep: true });
  assert.deepEqual(h.data['researchUI:invalid'], { keep: 'not a window' });
  assert.deepEqual(h.data['researchUI:-1'], { keep: 'not a real window' });
  assert.equal(h.writes.length, 1, 'marker and all window states must be written together');
  assert.deepEqual(Object.keys(h.writes[0]).sort(), [RESET_KEY, 'researchUI:0', 'researchUI:8', 'researchUI:92'].sort());
});

test('stale writes after clear neither recreate identities nor overwrite the committed query and request marker', async () => {
  const h = harness({ 'researchUI:1': state() });
  const { generation } = await h.sessions.clear();
  const next = state('A newer typed search', '3');
  assert.deepEqual(await h.sessions.save(1, next, null), { generation, cleared: true });
  assert.deepEqual(h.data['researchUI:1'], cleared(state(), generation));
  // This also covers a panel that had no saved state at the time of removal.
  await h.sessions.save(2, state('A different window', '4'), null);
  assert.equal(h.data['researchUI:2'], undefined);
  assert.deepEqual(await h.sessions.save(1, next, generation), { generation, cleared: false });
  assert.deepEqual(h.data['researchUI:1'], { ...next, generation });
});

test('a delayed old save cannot overwrite fresh same-window research after reset', async () => {
  const h = harness();
  const old = state('Justin Herbert', '1');
  await h.sessions.save(7, old, null);
  const { generation } = await h.sessions.clear();
  const fresh = { ...state('DK Metcalf', '3'), lastRequestAt: 456 };
  await h.sessions.save(7, fresh, generation);
  const persisted = structuredClone(h.data['researchUI:7']);
  const writeCount = h.writes.length;
  assert.deepEqual(await h.sessions.save(7, old, null), { generation, cleared: true });
  assert.deepEqual(h.data['researchUI:7'], persisted);
  assert.deepEqual(persisted, { ...fresh, generation });
  assert.equal(h.writes.length, writeCount, 'a stale snapshot must not write any state');
});

test('a delayed pre-clear save finishes before the queued reset and later stale save', async () => {
  const h = harness();
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const originalSet = h.storage.set;
  let gated = true;
  h.storage.set = async values => {
    if (gated) { gated = false; started.resolve(); await release.promise; }
    await originalSet(values);
  };
  const first = h.sessions.save(1, state());
  await started.promise;
  const reset = h.sessions.clear();
  const stale = h.sessions.save(2, state('DK Metcalf', '3'), null);
  assert.equal(h.reads.length, 1, 'reset must not read storage before an earlier write completes');
  release.resolve();
  await first;
  const { generation } = await reset;
  assert.deepEqual(await stale, { generation, cleared: true });
  assert.deepEqual(h.data['researchUI:1'], cleared(state(), generation));
  assert.equal(h.data['researchUI:2'], undefined);
});

test('repeat resets create distinct generations and survive worker reconstruction', async () => {
  const h = harness();
  const first = await h.sessions.clear();
  await h.sessions.save(3, state(), first.generation);
  const second = await h.sessions.clear();
  assert.notEqual(second.generation, first.generation);
  const restarted = createResearchSessions(h.storage);
  assert.deepEqual(await restarted.save(3, state('DK Metcalf', '3'), first.generation), { generation: second.generation, cleared: true });
  assert.deepEqual((await restarted.load(3)).state, cleared(state(), second.generation));
  await restarted.save(3, state(), second.generation);
  assert.deepEqual((await restarted.load(3)).state, { ...state(), generation: second.generation });
});

test('load strips identities from stale persisted snapshots including pre-generation state', async () => {
  const h = harness({
    [RESET_KEY]: 'current',
    'researchUI:1': state(),
    'researchUI:2': { ...state(), generation: 'previous' },
    'researchUI:3': { ...state(), generation: 'current' },
  });
  assert.deepEqual((await h.sessions.load(1)).state, cleared(state(), 'current'));
  assert.deepEqual((await h.sessions.load(2)).state, cleared(state(), 'current'));
  assert.deepEqual((await h.sessions.load(3)).state, { ...state(), generation: 'current' });
  assert.equal(h.writes.length, 0, 'loading a snapshot must not write it back');
});

test('session state is cleaned, bounded, and never preserves unrelated input fields', async () => {
  const h = harness();
  await h.sessions.save(0, {
    query: '  Justin\u0000 Herbert\ud800  ', selectedId: 1,
    recentIds: ['1', 2, 'bad', '2', '2', '3', '4', '5', '6', '7'],
    lastRequestAt: Infinity, extra: 'discard', generation: 'cannot override the caller generation',
  });
  assert.deepEqual(h.data['researchUI:0'], {
    query: 'Justin Herbert', selectedId: null, recentIds: ['1', '2', '3', '4', '5', '6'], lastRequestAt: null, generation: null,
  });
  await h.sessions.save(0, { query: 'x'.repeat(150), selectedId: '002', recentIds: false, lastRequestAt: 0 });
  assert.equal(h.data['researchUI:0'].query.length, 120);
  assert.equal(h.data['researchUI:0'].selectedId, '002');
  assert.equal(h.data['researchUI:0'].lastRequestAt, 0);
  assert.deepEqual(h.data['researchUI:0'].recentIds, []);
  for (const malformed of [undefined, null, false, 7, [], 'text']) {
    await h.sessions.save(0, malformed);
    assert.deepEqual(h.data['researchUI:0'], { query: '', selectedId: null, recentIds: [], lastRequestAt: null, generation: null });
  }
  h.data['researchUI:0'] = false;
  assert.deepEqual((await h.sessions.load(0)).state, { query: '', selectedId: null, recentIds: [], lastRequestAt: null, generation: null });
});

test('invalid window IDs reject without reading storage or wedging the queue', async () => {
  const h = harness();
  for (const id of [-1, 1.5, '1', null, undefined, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(h.sessions.load(id), /Invalid browser window/);
    await assert.rejects(h.sessions.save(id, state()), /Invalid browser window/);
  }
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
  await h.sessions.save(0, state());
  assert.equal((await h.sessions.load(0)).state.selectedId, '1');
});

test('an operation already queued behind a failed write still runs', async () => {
  const h = harness({ 'researchUI:1': state() });
  const started = Promise.withResolvers(), release = Promise.withResolvers();
  const originalSet = h.storage.set;
  let fail = true;
  h.storage.set = async values => {
    if (fail) {
      fail = false;
      started.resolve();
      await release.promise;
      throw new Error('failed pending save');
    }
    await originalSet(values);
  };
  const save = h.sessions.save(2, state());
  await started.promise;
  const failure = assert.rejects(save, /failed pending save/);
  const reset = h.sessions.clear();
  release.resolve();
  await failure;
  const { generation } = await reset;
  assert.deepEqual(h.data['researchUI:1'], cleared(state(), generation));
  assert.equal(h.data['researchUI:2'], undefined);
});

test('read and write failures reject their operation without wedging later operations', async () => {
  for (const operation of ['load', 'save', 'clear']) {
    const h = harness({ 'researchUI:1': state() });
    const originalGet = h.storage.get;
    h.storage.get = async () => { throw new Error('storage read failed'); };
    await assert.rejects(h.sessions[operation](1, state()), /storage read failed/);
    h.storage.get = originalGet;
    assert.equal((await h.sessions.load(1)).state.selectedId, '1');
    await h.sessions.save(1, state());
    await h.sessions.clear();
  }
  for (const operation of ['save', 'clear']) {
    const h = harness({ 'researchUI:1': state() });
    const originalSet = h.storage.set;
    h.storage.set = async () => { throw new Error('storage write failed'); };
    await assert.rejects(h.sessions[operation](1, state()), /storage write failed/);
    assert.equal(h.data[RESET_KEY], undefined, 'a failed clear must not publish a generation');
    h.storage.set = originalSet;
    assert.equal((await h.sessions.load(1)).state.selectedId, '1');
    await h.sessions.save(1, state());
    await h.sessions.clear();
    assert.deepEqual(h.data['researchUI:1'].recentIds, []);
  }
});
