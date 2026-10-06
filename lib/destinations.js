import { cleanText } from './players.js';
export const DESTINATIONS = [
  { id: 'pff', name: 'PFF', category: 'Grades & analysis', note: 'Some content requires a subscription' },
  { id: 'pfr', name: 'Pro Football Reference', category: 'Statistics & history', note: 'Player search' },
  { id: 'espn', name: 'ESPN', category: 'Stats & coverage', note: 'Profile when available; otherwise search' },
  { id: 'news', name: 'Google News', category: 'Latest coverage', note: 'NFL news search' },
  { id: 'youtube', name: 'YouTube', category: 'Highlights & film', note: 'Search results, not curated film' },
];
export const DEFAULT_FAVORITES = ['pff', 'pfr'];
export function sanitizeFavorites(value) {
  return Array.isArray(value) ? [...new Set(value)].filter(id => DESTINATIONS.some(source => source.id === id)) : [...DEFAULT_FAVORITES];
}
export function researchUrl(id, name, player = null) {
  const query = cleanText(name);
  if (!query) return null;
  let url;
  if (id === 'pff') { url = new URL('https://www.pff.com/search'); url.searchParams.set('q', query); }
  else if (id === 'pfr') { url = new URL('https://www.pro-football-reference.com/search/search.fcgi'); url.searchParams.set('search', query); }
  else if (id === 'espn') {
    if (player?.espnId && /^\d+$/.test(player.espnId)) return `https://www.espn.com/nfl/player/_/id/${player.espnId}`;
    url = new URL('https://www.espn.com/search/'); url.searchParams.set('q', query);
  } else if (id === 'news') { url = new URL('https://news.google.com/search'); url.searchParams.set('q', `${query} NFL`); }
  else if (id === 'youtube') { url = new URL('https://www.youtube.com/results'); url.searchParams.set('search_query', `${query} NFL highlights`); }
  else return null;
  return url.href;
}
