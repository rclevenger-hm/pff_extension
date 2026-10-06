import { cleanText, findPlayers, indexPlayers } from './lib/players.js';
import { DESTINATIONS, researchUrl, sanitizeFavorites } from './lib/destinations.js';
import { DIRECTORY_KEY, DIRECTORY_ORIGIN, MAX_AGE_MS } from './lib/directory.js';
import { icon, element, normalizeTheme, recentIds, directoryAge } from './lib/ui.js';

const $ = id => document.getElementById(id);
const views = ['research', 'sources', 'settings'];
const sourceMarks = { pff: 'PFF', pfr: 'PFR', espn: 'E', news: 'N', youtube: 'YT' };
let index = [], selected = null, favorites = sanitizeFavorites(), recents = [];
let directory = { needsPermission: true }, filters = { position: '', team: '' };
let windowId, debounce, expiryTimer, ready = false, busy = false;
let view = 'research', lastRequestAt = null, restoreId = null, selectOnLoad = false;
const scrollPositions = new Map();
const query = () => cleanText($('query').value);
const metadata = player => `${player.team || 'No team listed'} · ${player.position || 'Unknown position'}`;
const initials = player => player.name.split(/\s/).map(part => part[0]).slice(0, 2).join('');
function feedback(message = '') { $('feedback-text').textContent = message; $('feedback').hidden = !message; }
function announce(message) { $('announcement').textContent = message; }
function saveSession() {
  if (windowId === undefined) return;
  chrome.storage.session.set({ [`researchUI:${windowId}`]: { query: query(), selectedId: selected?.id || null, recentIds: recents, lastRequestAt } })
    .catch(() => feedback('Could not save your session. Your research links still work.'));
}
function showView(next, focus = false) {
  if (!views.includes(next)) return;
  scrollPositions.set(view, window.scrollY); view = next;
  for (const name of views) $('view-' + name).hidden = name !== view;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  $('search-bar').hidden = view === 'settings'; $('filters').open = false;
  window.scrollTo(0, scrollPositions.get(view) || 0);
  if (focus) $('main').focus({ preventScroll: true });
}
function applyTheme(value) {
  const theme = normalizeTheme(value); $('theme').value = theme;
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
function sourceLink(source, name) {
  const link = element('a'); link.href = researchUrl(source.id, name, selected);
  link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = `${source.note} Opens in a new tab.`;
  return link;
}
function renderSources() {
  const name = selected?.name || query();
  $('research-links').hidden = !name;
  $('research-context').textContent = selected ? `${name} · Your favorites` : `Search your favorites for “${name}”`;
  $('source-context').textContent = selected ? `${name} · ${metadata(selected)}` : name ? `Searching for “${name}”` : 'Search for a player to open sources. You can choose favorites now.';
  $('quick-sources').replaceChildren(); $('sources').replaceChildren();
  $('no-favorites').hidden = favorites.length > 0;
  for (const source of DESTINATIONS) {
    const favorite = favorites.includes(source.id);
    if (favorite && name) {
      const link = sourceLink(source, name); link.className = 'quick-source';
      const top = element('span', undefined, 'quick-source-top'); top.append(element('span', sourceMarks[source.id], 'source-mark'), icon('sources'));
      const text = element('span'); text.append(element('strong', source.name), element('small', source.category));
      link.append(top, text); $('quick-sources').append(link);
    }
    const row = element('div', undefined, 'source-row');
    const content = element('div', undefined, 'source-content');
    const label = name ? sourceLink(source, name) : element('strong'); label.append(document.createTextNode(source.name));
    if (name) label.append(icon('sources'));
    content.append(label, element('small', source.category), element('small', source.note, 'source-note'));
    const button = element('button', undefined, 'favorite'); button.type = 'button'; button.dataset.source = source.id;
    button.setAttribute('aria-label', `Favorite ${source.name}`); button.setAttribute('aria-pressed', String(favorite)); button.append(icon('star'));
    button.addEventListener('click', async () => {
      const next = favorite ? favorites.filter(id => id !== source.id) : [...favorites, source.id];
      try {
        await chrome.storage.local.set({ favoriteSources: next }); favorites = next; renderSources();
        document.querySelector(`[data-source="${source.id}"]`)?.focus({ preventScroll: true });
        announce(`${source.name} ${favorite ? 'removed from' : 'added to'} favorites.`);
      } catch { feedback('Could not save your favorite sources. Try again.'); }
    });
    row.append(element('span', sourceMarks[source.id], 'source-mark'), content, button); $('sources').append(row);
  }
}
function renderRecents() {
  const players = recents.map(id => index.find(item => item.player.id === id)?.player).filter(Boolean);
  $('recent-section').hidden = Boolean(query()) || !players.length; $('recents').replaceChildren();
  for (const player of players) {
    const button = element('button', undefined, 'recent-player'); button.type = 'button';
    const identity = element('span'); identity.append(element('strong', player.name), element('small', metadata(player)));
    button.append(element('span', initials(player), 'avatar'), identity, icon('chevron'));
    button.addEventListener('click', () => { $('query').value = player.name; showProfile(player, true); }); $('recents').append(button);
  }
}
function showProfile(player, focus = false, remember = true) {
  selected = player; restoreId = null;
  $('welcome').hidden = true; $('recent-section').hidden = true; $('results-section').hidden = true; $('profile').hidden = false; $('clear-search').hidden = false;
  $('player-name').textContent = player.name; $('player-context').textContent = metadata(player);
  $('player-status').textContent = player.active ? 'Listed active' : 'Listed inactive';
  $('player-status').title = 'Status in the downloaded directory; not a live injury report.';
  $('player-number').textContent = player.number ? `#${player.number}` : '';
  $('player-facts').replaceChildren();
  const height = player.height && /^\d+$/.test(player.height) ? `${Math.floor(Number(player.height) / 12)}′ ${Number(player.height) % 12}″` : player.height;
  const experience = player.experience === '0' ? 'Rookie' : player.experience ? `${player.experience} ${player.experience === '1' ? 'year' : 'years'}` : null;
  for (const [label, value, className] of [['Age', player.age], ['Height', height], ['Weight', player.weight ? `${player.weight} lb` : null], ['College', player.college, 'wide'], ['Experience', experience]]) {
    const cell = element('div', undefined, className); cell.append(element('dt', label), element('dd', value || '—')); $('player-facts').append(cell);
  }
  $('profile-provenance').textContent = `Sleeper · ${directoryAge(directory.directory?.fetchedAt)}. Not a live injury report.`;
  if (remember) recents = recentIds(recents, player.id);
  renderSources(); saveSession();
  if (focus) { $('back').focus(); $('profile').scrollIntoView({ block: 'start' }); }
}
function activeFilterCount() { return Number($('inactive').checked) + Number(Boolean(filters.position)) + Number(Boolean(filters.team)); }
function renderFilters() {
  const count = activeFilterCount(); $('filter-label').textContent = count ? `Filters · ${count}` : 'Filters'; $('filters').dataset.active = String(count > 0);
  for (const [field, id, label] of [['position', 'position-filter', 'All positions'], ['team', 'team-filter', 'All teams']]) {
    const select = $(id); const values = [...new Set(index.map(item => item.player[field]).filter(Boolean))].sort();
    // Keep the saved filter visible even if its team no longer occurs in the latest snapshot.
    if (filters[field] && !values.includes(filters[field])) values.push(filters[field]);
    select.replaceChildren(new Option(label, ''), ...values.map(value => new Option(value, value))); select.value = filters[field];
  }
}
function saveFilters() {
  chrome.storage.local.set({ researchFilters: filters, includeInactive: $('inactive').checked }).catch(() => feedback('Could not save your filters.'));
}
function resetFilters() {
  filters = { position: '', team: '' }; $('inactive').checked = false; renderFilters(); search(); saveFilters();
}
function search(autoSelect = false, focus = false) {
  restoreId = null; selected = null; $('profile').hidden = true;
  const name = query(); $('clear-search').hidden = !name; $('welcome').hidden = Boolean(name); $('results-section').hidden = !name;
  $('results').replaceChildren(); $('no-results').hidden = true;
  renderRecents();
  if (!name) { renderSources(); saveSession(); return; }
  const filtered = index.filter(item => (!filters.position || item.player.position === filters.position) && (!filters.team || item.player.team === filters.team));
  const result = findPlayers(filtered, name, { includeInactive: $('inactive').checked });
  if (autoSelect && result.exact) { showProfile(result.exact, focus); return; }
  $('result-count').textContent = String(result.total);
  $('result-status').textContent = result.total ? `${result.total > 20 ? `Showing 20 of ${result.total} matches. Refine your search.` : 'Choose by team and position.'}` : index.length ? 'Try another name or open a research source below.' : 'Enable profiles above, or open a research source below.';
  $('no-results').hidden = result.total > 0 || !index.length;
  $('no-results-help').textContent = activeFilterCount() ? 'Your filters may be hiding this player. Reset them, or try a different name.' : 'Try a full name, check the spelling, or include inactive players in Filters.';
  $('empty-reset').hidden = !activeFilterCount();
  for (const match of result.matches) {
    const button = element('button', undefined, 'candidate'); button.type = 'button';
    const identity = element('span', undefined, 'identity');
    identity.append(element('strong', match.player.name), element('small', `${metadata(match.player)}${match.player.active ? '' : ' · Inactive'}`), element('span', match.kind, 'match-kind'));
    button.append(element('span', initials(match.player), 'avatar'), identity, icon('chevron'));
    button.addEventListener('click', () => showProfile(match.player, true));
    const li = element('li'); li.append(button); $('results').append(li);
  }
  renderSources(); saveSession();
}
function renderDirectory() {
  const cached = directory.directory, fresh = cached && Date.now() - cached.fetchedAt < MAX_AGE_MS;
  const problem = directory.error || directory.stale || (cached && !fresh);
  $('onboarding').hidden = Boolean(index.length);
  $('directory-shortcut').dataset.status = busy ? 'loading' : problem ? 'stale' : cached ? 'ready' : 'setup';
  $('connection-label').textContent = busy ? 'Loading' : problem ? 'Review' : cached ? 'Profiles' : 'Set up';
  $('directory-count').textContent = index.length ? index.length.toLocaleString() : 'Not enabled';
  $('directory-status').textContent = busy ? 'Downloading player profiles…' : directory.error || (cached ? 'Ready for local searches. Listings may lag roster changes.' : 'Enable free player profiles. No account needed.');
  $('directory-time').textContent = cached ? `${directoryAge(cached.fetchedAt)} · ${new Date(cached.fetchedAt).toLocaleString()}` : 'Your searches stay on this device.';
  $('directory-warning').hidden = !problem;
  $('directory-warning-text').textContent = cached ? 'Using the last download. Player details may be out of date.' : directory.error || 'Player profiles are unavailable. Research links still work.';
  $('load-directory').textContent = busy ? 'Loading profiles…' : directory.needsPermission ? 'Enable player profiles' : directory.error ? 'Retry download' : fresh ? 'Up to date' : 'Refresh profiles';
  $('load-directory').disabled = busy || Boolean(fresh && !directory.error && !directory.needsPermission);
  $('enable-directory').disabled = busy; $('enable-directory').textContent = busy ? 'Loading profiles…' : 'Enable player profiles';
  $('clear-directory').disabled = busy || !cached;
  $('remove-details').hidden = !cached;
  clearTimeout(expiryTimer);
  if (fresh && !busy) expiryTimer = setTimeout(renderDirectory, Math.max(1, cached.fetchedAt + MAX_AGE_MS - Date.now()));
}
async function refreshDirectory() {
  if (busy) return;
  busy = true; renderDirectory();
  try {
    const result = await chrome.runtime.sendMessage({ type: 'loadDirectory' });
    if (!result) throw new Error('No response');
    directory = result; index = result.directory ? indexPlayers(result.directory.players) : []; renderFilters();
    const player = index.find(item => item.player.id === (selected?.id || restoreId))?.player;
    if (player) showProfile(player, false, false); else search(selectOnLoad);
    selectOnLoad = false;
  } catch { directory = { ...directory, error: 'Could not load player profiles. Retry from Settings. Research links still work.' }; }
  finally { busy = false; renderDirectory(); }
}
async function enableDirectory() {
  feedback();
  try {
    // Keep the optional permission request inside the user's click handler.
    const granted = await chrome.permissions.request({ origins: [DIRECTORY_ORIGIN] });
    if (granted) await refreshDirectory(); else feedback('Profiles were not enabled. You can still use every research source.');
  } catch { feedback('Could not enable player profiles. Try again.'); }
}
async function acceptRequest(request) {
  if (!request?.query || (request.requestedAt && request.requestedAt === lastRequestAt)) return;
  clearTimeout(debounce); lastRequestAt = request.requestedAt || null;
  filters = { position: '', team: '' }; renderFilters(); saveFilters();
  $('query').value = cleanText(request.query); showView('research'); selectOnLoad = !index.length; search(true);
  $('query').focus({ preventScroll: true });
}
for (const node of document.querySelectorAll('[data-icon]')) node.replaceChildren(icon(node.dataset.icon));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => showView(button.dataset.view, true));
for (const id of ['directory-shortcut', 'review-directory']) $(id).addEventListener('click', () => showView('settings', true));
$('all-sources').addEventListener('click', () => showView('sources', true));
for (const id of ['load-directory', 'enable-directory']) $(id).addEventListener('click', enableDirectory);
$('dismiss-feedback').addEventListener('click', () => { feedback(); $('query').focus(); });
$('clear-directory').addEventListener('click', async () => {
  try {
    await chrome.permissions.remove({ origins: [DIRECTORY_ORIGIN] }); await chrome.storage.local.remove(DIRECTORY_KEY);
    recents = []; directory = { needsPermission: true }; index = []; selected = null; renderFilters(); search(); renderDirectory();
    announce('Downloaded directory and recently viewed players removed.'); $('load-directory').focus();
  } catch { feedback('Could not remove the downloaded directory. Try again.'); }
});
$('search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounce); if (ready) { showView('research'); search(true, true); } });
$('query').addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(() => { if (ready) search(); }, 150); });
$('clear-search').addEventListener('click', () => { clearTimeout(debounce); $('query').value = ''; search(); $('query').focus(); });
$('back').addEventListener('click', () => { search(); $('results').querySelector('button')?.focus(); });
for (const button of document.querySelectorAll('[data-example]')) button.addEventListener('click', () => { $('query').value = button.dataset.example; search(true, true); });
for (const id of ['inactive', 'position-filter', 'team-filter']) $(id).addEventListener('change', () => {
  filters = { position: $('position-filter').value, team: $('team-filter').value }; renderFilters(); search(); saveFilters();
});
for (const id of ['reset-filters', 'empty-reset']) $(id).addEventListener('click', () => { resetFilters(); if (id === 'empty-reset') $('query').focus(); });
$('clear-recents').addEventListener('click', () => { recents = []; renderRecents(); saveSession(); $('query').focus(); announce('Recently viewed players cleared.'); });
$('theme').addEventListener('change', () => {
  applyTheme($('theme').value); chrome.storage.local.set({ uiTheme: $('theme').value }).catch(() => feedback('Could not save your appearance preference.'));
});
document.addEventListener('click', event => { if (!$('filters').contains(event.target)) $('filters').open = false; });
document.addEventListener('keydown', event => {
  const editing = event.target.matches('input, textarea, select, [contenteditable="true"]');
  if (event.key === '/' && !editing && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); showView('research'); $('query').focus(); $('query').select(); }
  if (event.key === 'Escape') {
    if ($('filters').open) { $('filters').open = false; $('filters').querySelector('summary').focus(); }
    else if (view === 'research' && selected) { search(); $('results').querySelector('button')?.focus(); }
    else if (event.target === $('query') && query()) { clearTimeout(debounce); $('query').value = ''; search(); }
    else return;
    event.preventDefault();
  }
  if (view !== 'research' || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  const buttons = [...$('results').querySelectorAll('button')]; const current = buttons.indexOf(event.target);
  if (event.target === $('query') && event.key === 'ArrowDown' && buttons.length) { event.preventDefault(); buttons[0].focus(); }
  else if (current >= 0) { event.preventDefault(); (buttons[current + (event.key === 'ArrowDown' ? 1 : -1)] || (event.key === 'ArrowUp' ? $('query') : buttons[current])).focus(); }
});
async function initialize() {
  try {
    const win = await chrome.windows.getCurrent(); windowId = win.id;
    const prefs = await chrome.storage.local.get(['favoriteSources', 'includeInactive', 'researchFilters', 'uiTheme']);
    favorites = sanitizeFavorites(prefs.favoriteSources); $('inactive').checked = prefs.includeInactive === true;
    filters = { position: cleanText(prefs.researchFilters?.position, 20), team: cleanText(prefs.researchFilters?.team, 20) }; applyTheme(prefs.uiTheme);
    $('version').textContent = chrome.runtime.getManifest().version;
    const state = await chrome.storage.session.get([`research:${windowId}`, `researchUI:${windowId}`]);
    const saved = state[`researchUI:${windowId}`];
    if (saved) { $('query').value = cleanText(saved.query); recents = recentIds(saved.recentIds); lastRequestAt = saved.lastRequestAt; }
    ready = true; renderFilters(); search(); restoreId = saved?.selectedId || null;
    await acceptRequest(state[`research:${windowId}`]);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes[`research:${windowId}`]) acceptRequest(changes[`research:${windowId}`].newValue);
      if (area === 'local' && changes.favoriteSources) { favorites = sanitizeFavorites(changes.favoriteSources.newValue); renderSources(); }
      if (area === 'local' && changes.uiTheme) applyTheme(changes.uiTheme.newValue);
      if (area === 'local' && changes[DIRECTORY_KEY] && !changes[DIRECTORY_KEY].newValue) {
        index = []; selected = null; recents = []; directory = { needsPermission: true }; renderFilters(); search(); renderDirectory();
      }
    });
    await chrome.action.setBadgeText({ text: '' }); await chrome.action.setTitle({ title: 'PFF Search · Player research' });
    await refreshDirectory(); $('query').focus({ preventScroll: true });
  } catch { feedback('Could not initialize the panel. Reload the extension and try again.'); }
}
initialize();
