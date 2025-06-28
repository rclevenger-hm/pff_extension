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

// Create menu when the extension is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed.");
  createContextMenu();
});

// Recreate the menu when the browser starts (if supported)
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    console.log("Browser startup detected. Recreating context menu.");
    createContextMenu();
  });
}

// Handle right-click menu click
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "pffSearch") {
    const query = encodeURIComponent(info.selectionText);
    const url = `https://www.pff.com/search?q=${query}`;
    chrome.tabs.create({ url });
    console.log(`Searching PFF for: ${info.selectionText}`);
  }
});
