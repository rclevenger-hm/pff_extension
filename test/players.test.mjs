import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rawPlayers } from './fixtures.mjs';
import { cleanText, normalizeDirectory, normalizeName, indexPlayers, findPlayers } from '../lib/players.js';
import { DESTINATIONS, researchUrl, sanitizeFavorites } from '../lib/destinations.js';
const players = normalizeDirectory(rawPlayers);
const index = indexPlayers(players);
test('directory uses stable IDs, retains non-fantasy positions, drops team defenses', () => {
  assert.equal(players.length, 12); assert.equal(players.find(p => p.id === '9').position, 'OL');
  assert.throws(() => normalizeDirectory(null)); assert.throws(() => normalizeDirectory([])); assert.throws(() => normalizeDirectory({ bad: {} }));
});
test('normalizes punctuation, suffixes, accents and Unicode safely', () => {
  for (const [query, id] of [['Justin Herbert','1'],['D.K. Metcalf','4'],['Amon Ra St Brown','5'],['Brian Thomas III','6'],['Jose Oneal','9']]) {
    assert.equal(findPlayers(index, query).exact?.id, id, query);
  }
  assert.equal(normalizeName('  Brian Thomas Jr. '), 'brian thomas');
  assert.equal(cleanText('a\ud800b\u0000'), 'ab');
  assert.equal(cleanText('x'.repeat(119) + '🏈x').endsWith('🏈'), true);
});
test('initials, partial names and typos are suggestions requiring confirmation', () => {
  for (const query of ['J. Herbert','Herbert','Justni Herbert','Justin Herbrt']) {
    const result = findPlayers(index, query); assert.equal(result.matches[0].player.id, '1'); assert.equal(result.exact, null);
  }
  const result = findPlayers(index, 'J. Williams'); assert.equal(result.matches.length, 2); assert.equal(result.exact, null);
});
test('duplicate names never silently choose one; inactive filter is explicit', () => {
  assert.equal(findPlayers(index, 'Mike Williams').exact, null);
  assert.equal(findPlayers(index, 'Josh Allen').exact.id, '2');
  assert.equal(findPlayers(index, 'Josh Allen', { includeInactive: true }).exact, null);
});
test('short, empty and unrelated input do not resolve to an arbitrary player', () => {
  for (const query of ['', ' ', 'J', 'completely unrelated article text']) assert.equal(findPlayers(index, query).matches.length, 0);
  assert.equal(findPlayers(index, 'Williams', { limit: 2 }).matches.length, 2);
  assert.equal(findPlayers(index, 'Williams', { limit: 2 }).total, 4);
});
test('research URLs preserve queries and fixed HTTPS destinations', () => {
  const origins = ['https://www.pff.com','https://www.pro-football-reference.com','https://www.espn.com','https://news.google.com','https://www.youtube.com'];
  DESTINATIONS.forEach((source, i) => {
    const url = new URL(researchUrl(source.id, 'A & B? #/🏈'));
    assert.equal(url.origin, origins[i]); assert.ok([...url.searchParams.values()][0].includes('A & B? #/🏈'));
  });
  assert.equal(researchUrl('espn','Justin Herbert',players[0]),'https://www.espn.com/nfl/player/_/id/4038941');
  assert.equal(new URL(researchUrl('espn','name',{espnId:'//evil'})).host,'www.espn.com');
  assert.equal(researchUrl('evil','name'), null); assert.equal(researchUrl('pff',' '), null);
  assert.deepEqual(sanitizeFavorites(['pff','pff','evil','youtube']),['pff','youtube']);
  assert.deepEqual(sanitizeFavorites([]),[]);
});
