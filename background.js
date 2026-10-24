import { cleanText } from './lib/players.js';
import { loadDirectory, DIRECTORY_KEY, DIRECTORY_ORIGIN } from './lib/directory.js';
import { createResearchSessions } from './lib/sessions.js';

const sessions = createResearchSessions(chrome.storage.session);

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
    chrome.tabs.create({ url: `https://www.pff.com/search?q=${encodeURIComponent(query)}` }, () => {
      if (chrome.runtime.lastError) console.error('PFF search tab creation failed.');
    });
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
