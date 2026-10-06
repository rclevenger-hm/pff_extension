# Privacy policy

PFF Search is an independent, non-commercial browser extension for NFL player research.

## Information handled

- Selected text: a name chosen through the Research context menu is stored in browser-session storage, separately per browser window. It is not sent to a server for identification and is cleared when the browser session ends.
- Typed searches and recent players: searches are processed inside the panel, without telemetry or remote lookup requests. The current query, selected player ID, and up to six recently viewed player IDs are kept in browser-session storage per window to resume research. This state is cleared when the browser session ends.
- Preferences: favorite research destinations, team/position/inactive-player filters, and the color theme are stored locally. They are not synchronized to a developer service.
- Directory: with optional permission, the extension downloads the public NFL player directory from `https://api.sleeper.app/v1/players/nfl`, stores a reduced set of basic player fields locally, and refreshes it at most once every 24 hours while the panel is used. Sleeper receives a normal HTTPS request and IP address; the request does not include selected text, browsing history, account credentials, or cookies.

## External destinations

When you click a research source or use Search PFF, a new tab opens with the selected name in its search URL, or with a provider-supplied ESPN player ID. The destination website then handles the visit under its own policy. Destinations are PFF, Pro Football Reference, ESPN, Google News, and YouTube. Their ordinary website cookies and sign-in state may apply to the opened tab. External links use `noopener noreferrer` in the panel.

## Retention and controls

The player directory and preferences remain until removed or the extension is uninstalled. Settings → Player directory → Manage downloaded data → Remove downloaded directory clears the directory and recent players, and revokes Sleeper access. Clear the search to find Recently viewed → Clear; this removes the recent-player list for the current window without deleting the directory. You can change favorite sources at any time. Uninstalling the extension removes its local and session storage.

The extension has no developer-operated backend, analytics, advertising, data sales, account system, or page-content scanning. It does not request browsing-history, cookies, broad tab metadata, or all-sites access.

## Contact

For privacy questions, contact the maintainer through the repository's issue tracker. Do not include private selections or other sensitive information in public issues.
