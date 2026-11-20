import { cleanText } from './lib/players.js';
import { loadDirectory, DIRECTORY_KEY, DIRECTORY_ORIGIN } from './lib/directory.js';
import { createResearchSessions, pffFailureKey } from './lib/sessions.js';

const sessions = createResearchSessions(chrome.storage.session);

const pffActions = new Map();
const validId = id => Number.isSafeInteger(id) && id >= 0;

// Serialize attempts and recovery within each window so a delayed callback
// cannot overwrite a newer attempt or open a second tab after a successful retry.
function queuePffAction(windowId, action) {
  const result = (pffActions.get(windowId) || Promise.resolve()).catch(() => {}).then(action);
  pffActions.set(windowId, result);
  return result.finally(() => {
    if (pffActions.get(windowId) === result) pffActions.delete(windowId);
  });
}
function openPffSearch(query, windowId) {
  const url = `https://www.pff.com/search?q=${encodeURIComponent(query)}`;
  return chrome.tabs.create(validId(windowId) ? { url, windowId } : { url });
}
async function readPffFailure(windowId) {
  const key = pffFailureKey(windowId);
  return (await chrome.storage.session.get(key))[key];
}
async function indicatePffFailure(tabId, failed) {
  if (!validId(tabId)) return;
  // A closed originating tab must not prevent panel recovery.
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: failed ? '!' : null }),
    chrome.action.setTitle({ tabId, title: failed ? 'PFF search did not open. Open the research panel to retry.' : 'PFF Search · Player research' }),
  ]);
}
async function clearPffFailure(windowId, failure) {
  if (!failure) return;
  await chrome.storage.session.remove(pffFailureKey(windowId));
  await indicatePffFailure(failure.tabId, false);
}
async function attemptPffSearch(query, windowId, tabId) {
  try {
    await openPffSearch(query, windowId);
  } catch {
    console.error('PFF search tab creation failed.');
    if (!validId(windowId)) return;
    const prior = await readPffFailure(windowId);
    await chrome.storage.session.set({ [pffFailureKey(windowId)]: { id: crypto.randomUUID(), query, tabId: validId(tabId) ? tabId : null } });
    if (prior?.tabId !== tabId) await indicatePffFailure(prior?.tabId, false);
    await indicatePffFailure(tabId, true);
    return;
  }
  if (validId(windowId)) await clearPffFailure(windowId, await readPffFailure(windowId));
}
function recoverPffSearch(message) {
  const { windowId, id, type } = message;
  if (!validId(windowId) || typeof id !== 'string' || !id) return Promise.resolve({});
  return queuePffAction(windowId, async () => {
    const failure = await readPffFailure(windowId);
    if (failure?.id !== id) return { obsolete: true };
    if (type === 'retryPffSearch') {
      const query = cleanText(failure.query, 500);
      if (!query) return { error: 'This PFF search is no longer available. Dismiss it and select the text again.' };
      // Consume before opening so failed storage cleanup cannot allow a duplicate.
      const key = pffFailureKey(windowId);
      await chrome.storage.session.remove(key);
      try { await openPffSearch(query, windowId); }
      catch {
        try { await chrome.storage.session.set({ [key]: failure }); }
        catch {
          await indicatePffFailure(failure.tabId, false);
          return { obsolete: true, error: 'PFF search could not open and recovery was lost. Select the text again.' };
        }
        return { error: 'PFF search still could not open. Try again or dismiss the message.' };
      }
      await indicatePffFailure(failure.tabId, false);
    } else await clearPffFailure(windowId, failure);
    return { ok: true };
  });
}
chrome.windows.onRemoved.addListener(windowId => {
  queuePffAction(windowId, () => chrome.storage.session.remove(pffFailureKey(windowId)))
    .catch(() => console.error('Could not clear a closed window’s PFF search recovery.'));
});

function createContextMenu() {
  for (const menu of [
    { id: 'playerResearch', title: 'Research "%s"' },
    { id: 'pffSearch', title: 'Search PFF for "%s"' },
  ]) {
    chrome.contextMenus.create({ ...menu, contexts: ['selection'] }, () => {
      if (chrome.runtime.lastError) console.error('Context menu creation failed.');
    });
  }
}
function configure() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => console.error('Could not configure the research panel.'));
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) { console.error('Context menu reset failed.'); return; }
    createContextMenu();
  });
}
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!['playerResearch', 'pffSearch'].includes(info.menuItemId)) return;
  const query = cleanText(info.selectionText, info.menuItemId === 'pffSearch' ? 500 : 120);
  if (!query) return;
  if (info.menuItemId === 'pffSearch') {
    const attempt = () => attemptPffSearch(query, tab?.windowId, tab?.id);
    const result = validId(tab?.windowId) ? queuePffAction(tab.windowId, attempt) : attempt();
    result.catch(() => console.error('Could not save PFF search recovery.'));
    return;
  }
  if (!Number.isInteger(tab?.windowId)) return;
  // Open synchronously within the user gesture, before storage awaits.
  const opening = chrome.sidePanel.open({ windowId: tab.windowId });
  const saving = chrome.storage.session.set({ [`research:${tab.windowId}`]: { query, requestedAt: Date.now() } });
  Promise.all([opening, saving]).catch(() => {
    console.error('Could not open the research panel.');
    chrome.action.setBadgeText({ text: '!' }).catch(() => {});
    chrome.action.setTitle({ title: 'Research panel unavailable. Click the toolbar icon to retry.' }).catch(() => {});
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  let operation;
  switch (message?.type) {
    case 'retryPffSearch':
    case 'dismissPffSearch':
      operation = recoverPffSearch(message);
      break;
    case 'loadDirectory':
      operation = loadDirectory({ storage: chrome.storage.local, permissions: chrome.permissions });
      break;
    case 'loadResearchSession':
      operation = sessions.load(message.windowId);
      break;
    case 'saveResearchSession':
      operation = sessions.save(message.windowId, message.state, message.generation);
      break;
    case 'clearDirectory':
      operation = (async () => {
        await chrome.permissions.remove({ origins: [DIRECTORY_ORIGIN] });
        // Clear every window, including closed panels, before reporting removal.
        // Serialized saves cannot restore identities from a pre-removal panel.
        const result = await sessions.clear();
        await chrome.storage.local.remove(DIRECTORY_KEY);
        return result;
      })();
      break;
    default:
      return false;
  }
  operation.then(sendResponse).catch(() => sendResponse({ error: 'Player storage is unavailable. Reload the extension and try again.' }));
  return true;
});
