# PFF Search · Player research

Research NFL players without leaving the page you are reading. Highlight a name and choose **Research**, or click the extension's toolbar icon to open a persistent side panel.

## What you can do

- Search by full name, surname, initials, punctuation variants, or a small spelling mistake.
- Resolve ambiguous names using team and position. Spelling and initial matches require a selection; a unique full-name match opens its profile.
- View a compact profile: team, position, college, age, number, height, weight, and experience when provided.
- Research offensive, defensive, and offensive-line players. Include inactive players when needed; historical coverage depends on the directory.
- Open PFF, Pro Football Reference, ESPN, Google News, or YouTube. ESPN uses a direct profile when the directory supplies an ID. Other destinations are search links; they are not curated or guaranteed exact matches.
- Star favorite research sites. Favorites stay at the top and persist on this device.
- Keep the original **Search PFF** right-click shortcut.

Player cards contain basic identity information, not PFF grades, projections, game logs, or live injury reports. PFF links may require a subscription. This is an independent extension, not affiliated with PFF, Sleeper, or the NFL.

## Install in Chrome

Requires Chrome 116 or newer. Edge compatibility has not yet been validated.

1. Download the complete repository using **Code → Download ZIP**, then extract it. Alternatively, download the `pff-search-extension` artifact from a successful [validation run](https://github.com/rclevenger-hm/pff_extension/actions) and extract its inner ZIP.
2. Open `chrome://extensions/` and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Pin **PFF Search** to the toolbar and click its icon.
5. Select **Enable directory** if you want player identification and profiles. Chrome will ask for access only to `api.sleeper.app`.

Do not copy only `background.js` and `manifest.json`: the panel files, `lib/` modules, and all three icons are also required. No npm installation is needed to use the extension.

## Use it

Highlight `Justin Herbert` in an article, right-click, and choose **Research "Justin Herbert"**. The side panel opens alongside the article. Try `J. Herbert` or a misspelled name to see suggestions; select the correct team and position. Use **Back to matches** to revisit the candidate list. You can always edit the search directly in the panel.

Star any research source to move it into your favorites. Each source opens in a separate tab. Source links remain usable if you decline directory permission or the data service is unavailable.

## Directory, freshness, and privacy

The optional [Sleeper player directory](https://docs.sleeper.com/#players) is downloaded on first enablement, normalized, and cached locally. A refresh is attempted when the panel is used after 24 hours. The whole-directory request does not contain your selected text. Concurrent panels share a download while the service worker is running.

The panel displays the download time. That is the retrieval time, not a guarantee that every player record was updated then. Provider listings can be incomplete or outdated. If a refresh fails, the prior directory remains available with a stale-data message. No automatic player selection occurs for spelling suggestions or duplicate full-name matches within the selected active/inactive filter.

Your selected name is stored in browser-session storage per window. Favorites, the inactive-player setting, and the downloaded directory stay locally on this device. **Data & privacy → Remove downloaded directory** deletes the cache and revokes the optional host permission. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md).

Sleeper documents free non-commercial API use and requires discussing licensing for commercial use. This release is a non-commercial research tool. Monetization or public data redistribution needs a separate provider-rights review. PFF is an outbound destination only; the extension does not fetch, copy, or redistribute its paid data.

## Development and validation

Node 22 and Python 3 are used by the build workflow.

```sh
npm ci --ignore-scripts
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run package
```

`npm test` covers player matching, duplicate names, Unicode, URL boundaries, cache freshness, failed/oversized provider responses, optional access, context menus, per-window request delivery, and the release permission contract.

`npm run test:browser` loads the unpacked MV3 extension in Chromium and exercises the panel using a deterministic fixture directory. It verifies first-use fallback, profile lookup, ambiguous names, favorites, external-tab creation, session persistence, window isolation, offline cache use, narrow layouts, and directory deletion. It does not assert the accuracy or availability of third-party search results. Native browser-menu interaction and the optional permission prompt remain manual smoke checks.

The workflow uploads a runtime-only ZIP and browser screenshots. `scripts/package.py` uses a fixed timestamp and sorted file list for reproducible archives. Tests, development dependencies, and provider data are excluded from the package.

## Troubleshooting

- Reload the extension and refresh the article if its right-click menu is absent.
- If opening the panel fails, click the toolbar icon to retry; it may display an `!` badge.
- If no player matches, try the full name, a surname, or **Include inactive players**. The directory is not a complete historical registry.
- When offline, cached profiles and favorites still work; external websites require a connection.
- For a failed directory refresh, use **Retry**. Do not repeatedly download the full directory within 24 hours.
- Restricted Chrome pages may not offer selection context menus. Use the toolbar search there.

## Roadmap

See the [project roadmap](https://github.com/rclevenger-hm/pff_extension/issues/10) for watchlists, comparisons, league context, richer data, alerts, draft tools, and release follow-ups.

## License

MIT for the extension source. Third-party websites and data retain their respective terms.
