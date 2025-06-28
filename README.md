# PFF Search Extension

A lightweight Chrome extension that lets you quickly search for NFL players on [Pro Football Focus (PFF)](https://www.pff.com) by simply highlighting a name and right-clicking.

Perfect for redrafting old drafts, fantasy football research, or general player analysis.

---

## Features

- Highlight any player's name on a webpage  
- Right-click and select **"Search PFF for 'Player Name'"**  
- Instantly opens a new tab with the PFF search results for that player  

---

## Installation

1. **Download** the following files into a single folder (e.g., `pff-search-extension`):  
   - `manifest.json`  
   - `background.js`  
   - `README.md` (optional, for reference)

2. Open **Google Chrome** and navigate to:
   - `chrome://extensions/`

3. **Enable Developer Mode** (top right corner)

4. Click **"Load unpacked"** and select the folder where your files are saved

5. You should now see **“PFF Search”** in your list of installed extensions

---

## How to Use

1. Highlight a player name on any webpage (e.g., `Justin Jefferson`)
2. Right-click the highlighted name
3. Click **"Search PFF for 'Justin Jefferson'"**
4. A new tab will open with a search like:  
`https://www.pff.com/search?q=Justin%20Jefferson`

---

## Technical Details

- Built using Chrome **Manifest V3**
- Uses the **Context Menus API**
- Background logic powered by a **service worker** (`background.js`)
- Remains active across browser restarts

---

## Troubleshooting

- If the right-click option doesn't appear:
- Ensure the extension is **enabled**
- Refresh the page or reload the extension
- Make sure the text is not inside an input field
- To debug, go to `chrome://extensions/` → "PFF Search" → click **"Service Worker (background.js)"** → check the **Console**

---

## License

MIT

