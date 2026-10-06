import test from 'node:test';
import assert from 'node:assert/strict';
import { recentIds, normalizeTheme, directoryAge } from '../lib/ui.js';
test('recent player IDs are bounded, deduplicated, ordered, and reject invalid stored values', () => {
  assert.deepEqual(recentIds(['1', '2', '2', '3', '4', '5', '6', '7'], '3'), ['3', '1', '2', '4', '5', '6']);
  assert.deepEqual(recentIds(['1', 2, '<script>', null], 'invalid'), ['1']);
  assert.deepEqual(recentIds(null, '7'), ['7']);
});
test('theme preferences fall back to system without accepting arbitrary values', () => {
  assert.equal(normalizeTheme('dark'), 'dark'); assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme(undefined), 'system'); assert.equal(normalizeTheme('red'), 'system');
});
test('snapshot age distinguishes missing, recent, hourly, and stale data', () => {
  const now = 100000000;
  assert.equal(directoryAge(null, now), 'Not downloaded');
  assert.equal(directoryAge(now, now), 'Downloaded just now');
  assert.equal(directoryAge(now - 7200000, now), 'Downloaded 2h ago');
  assert.equal(directoryAge(now - 90000000, now), 'Downloaded 1d ago');
});
