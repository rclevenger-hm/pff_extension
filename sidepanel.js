import { cleanText, findPlayers, indexPlayers } from './lib/players.js';
import { DESTINATIONS, researchUrl, sanitizeFavorites } from './lib/destinations.js';
import { DIRECTORY_KEY, DIRECTORY_ORIGIN, MAX_AGE_MS } from './lib/directory.js';

const $ = id => document.getElementById(id);
let index = [];
let selected = null;
let favorites = sanitizeFavorites();
let windowId;
let debounce;
let ready = false;
let busy = false;

function feedback(message = '') { $('feedback').textContent = message; $('feedback').hidden = !message; }
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function renderSources() {
  const name = selected?.name || cleanText($('query').value);
  $('research').hidden = !name;
  $('research-context').textContent = selected ? `Research ${name}` : `Search these sources for “${name}”`;
  $('sources').replaceChildren();
  const ordered = [...DESTINATIONS].sort((a, b) => Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)));
  for (const source of ordered) {
    const row = element('div', undefined, 'source');
    const link = element('a');
    link.href = researchUrl(source.id, name, selected) || '#';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = source.note;
    link.append(element('strong', source.name), element('small', source.category));
    const button = element('button', favorites.includes(source.id) ? '★' : '☆', 'favorite');
    button.type = 'button'; button.dataset.source = source.id;
    button.setAttribute('aria-label', `Favorite ${source.name}`);
    button.setAttribute('aria-pressed', String(favorites.includes(source.id)));
    button.addEventListener('click', async () => {
      const next = favorites.includes(source.id) ? favorites.filter(id => id !== source.id) : [...favorites, source.id];
      try {
        await chrome.storage.local.set({ favoriteSources: next });
        favorites = next; renderSources();
        document.querySelector(`[data-source="${source.id}"]`)?.focus();
      } catch { feedback('Could not save your favorite sources. Try again.'); }
    });
    row.append(link, button); $('sources').append(row);
  }
}
function showProfile(player, focus = false) {
  selected = player;
  $('results-section').hidden = true; $('profile').hidden = false;
  $('player-name').textContent = player.name;
  $('player-context').textContent = `${player.team || 'No team listed'} · ${player.position || 'Position unavailable'}`;
  $('player-status').textContent = player.active ? 'Active in provider directory' : 'Inactive in provider directory';
  $('initials').textContent = player.name.split(/\s/).map(part => part[0]).slice(0, 2).join('');
  $('player-facts').replaceChildren();
  const height = player.height && /^\d+$/.test(player.height) ? `${Math.floor(Number(player.height) / 12)}′ ${Number(player.height) % 12}″` : player.height;
  for (const [label, value] of [['Number', player.number ? `#${player.number}` : null], ['Age', player.age], ['College', player.college], ['Experience', player.experience === '0' ? 'Rookie' : player.experience ? `${player.experience} years` : null], ['Height', height], ['Weight', player.weight ? `${player.weight} lb` : null]]) {
    const cell = element('div'); cell.append(element('dt', label), element('dd', value || 'Not provided')); $('player-facts').append(cell);
  }
  renderSources();
  if (focus) $('back').focus();
}
function search(autoSelect = false) {
  selected = null; $('profile').hidden = true; $('results-section').hidden = false;
  const query = cleanText($('query').value);
  $('results').replaceChildren();
  if (!query) {
    $('result-status').textContent = 'Highlight a player on any page, right-click, and choose Research. Or search here.';
    renderSources(); return;
  }
  if (!index.length) {
    $('result-status').textContent = 'Enable the player directory for profiles, or use the research links below.';
    renderSources(); return;
  }
  const result = findPlayers(index, query, { includeInactive: $('inactive').checked });
  if (autoSelect && result.exact) { showProfile(result.exact); return; }
  $('result-status').textContent = result.total ? `${result.total} possible ${result.total === 1 ? 'match' : 'matches'}${result.total > 20 ? ' · showing the first 20; refine your search' : ''}. Choose the player by team and position.` : 'No matching player. Try a full name, change the spelling, or include inactive players. You can still use the research links.';
  for (const match of result.matches) {
    const button = element('button', undefined, 'candidate'); button.type = 'button';
    const identity = element('span');
    identity.append(element('strong', match.player.name), element('small', `${match.player.team || 'No team listed'} · ${match.player.position || 'Unknown position'}${match.player.active ? '' : ' · Inactive'}`));
    button.append(identity, element('span', match.kind, 'match-kind'));
    button.addEventListener('click', () => showProfile(match.player, true));
    $('results').append(button);
  }
  renderSources();
}
async function refreshDirectory() {
  if (busy) return;
  busy = true; $('load-directory').disabled = true; $('clear-directory').disabled = true;
  $('directory-status').textContent = 'Loading the player directory…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'loadDirectory' });
    if (!result) throw new Error('No response');
    index = result.directory ? indexPlayers(result.directory.players) : [];
    $('directory-heading').textContent = index.length ? `${index.length.toLocaleString()} player profiles` : 'Connect your research';
    $('directory-status').textContent = result.error || (result.needsPermission ? 'Allow access to Sleeper to download player profiles. Searches stay on this device.' : 'Ready for local searches. Directory updates at most once per day.');
    if (result.stale) $('directory-status').textContent += ' Showing the last downloaded directory; details may be out of date.';
    $('directory-time').textContent = result.directory ? `Source: Sleeper · Downloaded ${new Date(result.directory.fetchedAt).toLocaleString()}` : 'No account needed. One directory download is cached on this device.';
    $('load-directory').textContent = result.needsPermission ? 'Enable directory' : result.error ? 'Retry' : 'Up to date';
    $('load-directory').disabled = !result.needsPermission && !result.error && result.directory && Date.now() - result.directory.fetchedAt < MAX_AGE_MS;
    if (selected && index.some(item => item.player.id === selected.id)) showProfile(index.find(item => item.player.id === selected.id).player);
    else search(true);
  } catch {
    $('directory-status').textContent = 'Could not load the player directory. Retry, or reload the extension.';
    $('load-directory').textContent = 'Retry'; $('load-directory').disabled = false;
  } finally { busy = false; $('clear-directory').disabled = false; }
}
$('load-directory').addEventListener('click', async () => {
  feedback();
  try {
    // Request in the click handler so Chrome can show its optional permission prompt.
    const granted = await chrome.permissions.request({ origins: [DIRECTORY_ORIGIN] });
    if (granted) await refreshDirectory();
    else feedback('Directory access was not enabled. You can still use all research links.');
  } catch { feedback('Could not enable the directory. Try again.'); }
});
$('clear-directory').addEventListener('click', async () => {
  try {
    await chrome.permissions.remove({ origins: [DIRECTORY_ORIGIN] });
    await chrome.storage.local.remove(DIRECTORY_KEY);
    index = []; selected = null;
    await refreshDirectory();
  } catch { feedback('Could not remove the downloaded directory. Try again.'); }
});
$('search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounce); if (ready) search(true); });
$('query').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { if (ready) search(); }, 150); });
$('inactive').addEventListener('change', () => {
  search();
  chrome.storage.local.set({ includeInactive: $('inactive').checked }).catch(() => feedback('Could not save your search preference.'));
});
$('back').addEventListener('click', () => { search(); $('results').querySelector('button')?.focus(); });
function acceptRequest(request) {
  if (!request?.query) return;
  clearTimeout(debounce); $('query').value = cleanText(request.query); search(true);
}
async function initialize() {
  try {
    const win = await chrome.windows.getCurrent(); windowId = win.id;
    const prefs = await chrome.storage.local.get(['favoriteSources', 'includeInactive']);
    favorites = sanitizeFavorites(prefs.favoriteSources); $('inactive').checked = prefs.includeInactive === true;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes[`research:${windowId}`]) acceptRequest(changes[`research:${windowId}`].newValue);
      if (area === 'local' && changes.favoriteSources) { favorites = sanitizeFavorites(changes.favoriteSources.newValue); renderSources(); }
    });
    const session = await chrome.storage.session.get(`research:${windowId}`);
    ready = true; acceptRequest(session[`research:${windowId}`]);
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'PFF Search · Player research' });
    await refreshDirectory();
    $('query').focus();
  } catch { feedback('Could not initialize the panel. Reload the extension and try again.'); }
}
initialize();
