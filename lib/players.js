export function cleanText(value, limit = 120) {
  // Remove lone surrogates and controls before URL encoding.
  return Array.from(typeof value === 'string' ? value : '')
    .filter(char => !/[\u0000-\u001f\u007f\ud800-\udfff]/u.test(char))
    .slice(0, limit).join('').trim();
}

export function normalizeName(value) {
  return cleanText(value).normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[.'’]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '');
}
const compact = value => normalizeName(value).replace(/\s/g, '');
const scalar = value => cleanText(typeof value === 'number' ? String(value) : value, 80) || null;

export function normalizeDirectory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid player directory.');
  const players = [];
  for (const [key, row] of Object.entries(raw)) {
    if (!row || typeof row !== 'object' || row.position === 'DEF') continue;
    const name = cleanText(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' '));
    const id = scalar(row.player_id || key);
    if (!name || !id || !/^[0-9]+$/.test(id)) continue;
    players.push({
      id, name, firstName: scalar(row.first_name), lastName: scalar(row.last_name),
      team: scalar(row.team), position: scalar(row.position), active: row.active === true,
      college: scalar(row.college), number: scalar(row.number), age: scalar(row.age),
      height: scalar(row.height), weight: scalar(row.weight), experience: scalar(row.years_exp),
      espnId: /^[0-9]+$/.test(String(row.espn_id)) ? String(row.espn_id) : null,
    });
  }
  if (!players.length) throw new Error('The provider returned no usable players.');
  return players;
}
export function indexPlayers(players) {
  return players.map(player => ({
    player, name: normalizeName(player.name), compact: compact(player.name),
    first: compact(player.firstName), last: normalizeName(player.lastName || player.name.split(' ').at(-1)),
  }));
}
function distance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previousPrevious;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], previousPrevious[j - 2] + 1);
      }
    }
    if (Math.min(...current) > limit) return limit + 1;
    previousPrevious = previous;
    previous = current;
  }
  return previous[b.length];
}
export function findPlayers(index, query, { includeInactive = false, limit = 20 } = {}) {
  const normalized = normalizeName(query);
  const joined = compact(query);
  if (joined.length < 2) return { matches: [], exact: null, total: 0 };
  const tokens = normalized.split(' ');
  const matches = [];
  for (const item of index) {
    if (!includeInactive && !item.player.active) continue;
    let rank = 0;
    let kind;
    if (joined === item.compact) { rank = 100; kind = 'Name match'; }
    else if (tokens.length >= 2 && tokens.slice(1).join(' ') === item.last && tokens[0].length <= 2 && item.first.startsWith(tokens[0])) {
      rank = 90; kind = 'Initial match';
    } else if (normalized === item.last || (tokens.length >= 2 && tokens.every(t => item.name.split(' ').some(n => n.startsWith(t))))) {
      rank = 80; kind = 'Partial name';
    } else if (joined.length >= 3 && item.compact.startsWith(joined)) { rank = 70; kind = 'Partial name'; }
    else if (joined.length >= 5) {
      const edits = distance(joined, tokens.length === 1 ? compact(item.last) : item.compact, joined.length > 8 ? 2 : 1);
      if (edits <= (joined.length > 8 ? 2 : 1)) { rank = 60 - edits; kind = 'Spelling suggestion'; }
    }
    if (rank) matches.push({ player: item.player, rank, kind });
  }
  matches.sort((a, b) => b.rank - a.rank || Number(b.player.active) - Number(a.player.active) || a.player.name.localeCompare(b.player.name) || a.player.id.localeCompare(b.player.id));
  const exact = matches.filter(match => match.rank === 100);
  return { matches: matches.slice(0, limit), exact: exact.length === 1 ? exact[0].player : null, total: matches.length };
}
