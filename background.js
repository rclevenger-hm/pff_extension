function createContextMenu() {
  chrome.contextMenus.create({
    id: "pffSearch",
    title: 'Search PFF for "%s"',
    contexts: ["selection"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Context menu creation failed:", chrome.runtime.lastError);
    } else {
      console.log("PFF Search context menu created.");
    }
  });
}

function rebuildContextMenu() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {
      console.error("Context menu reset failed:", chrome.runtime.lastError);
      return;
    }
    createContextMenu();
  });
}

// Rebuild the menu when the extension is installed or updated.
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed or updated.");
  rebuildContextMenu();
});

// Rebuild the menu on browser startup so stale/duplicate menu state cannot persist.
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup detected. Rebuilding context menu.");
    rebuildContextMenu();
  });
}

// Handle right-click menu click
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== "pffSearch") return;
  const selection = typeof info.selectionText === "string" ? info.selectionText.trim() : "";
  if (!selection) return;
  const query = encodeURIComponent(selection);
  const url = `https://www.pff.com/search?q=${query}`;
  chrome.tabs.create({ url });
  console.log("Opening PFF search.");
});
