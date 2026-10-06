# Security policy and extension boundary

The extension accepts explicitly selected or typed names, resolves them locally against an optional public player directory, and opens a small allowlist of research destinations.

## Permissions

- `contextMenus`: selection-only Research and Search PFF actions.
- `sidePanel`: a packaged research interface alongside the current webpage; Chrome 116+ is required.
- `storage`: local directory and preferences plus per-window session requests.
- Optional `https://api.sleeper.app/*`: requested only when the user selects Enable directory. The actual fetch endpoint is fixed to `/v1/players/nfl`, uses no credentials, rejects redirects, has a 20-second timeout, and caps the response at 25 MiB. The normalized cache is substantially smaller than the raw response.

No broad host, tabs, history, cookies, native messaging, scripting, content-script, or remote-code permissions are requested. Opening an external tab and looking up the current window do not require broad tab metadata access. Removing the directory through the panel also revokes optional host access.

## Trust boundaries

- Treat selected text and provider data as untrusted. Render text through DOM `textContent`; do not interpolate it into HTML.
- Bound names and use URL APIs or URI encoding. Destination origins are fixed in code. ESPN IDs must be numeric.
- Never embed API keys or collect a user's fantasy-site credentials.
- Extension messages are accepted only from this extension. There is no externally-connectable surface.
- Invoke `sidePanel.open()` directly in the context-menu user gesture, before awaiting storage. Requests are keyed by window, so activity in another window does not replace its research.
- Retain source provenance and retrieval time. Stale directory data must not silently appear current.
- No remote executable code, `eval`, or downloaded scripts. Player data are parsed as JSON.
- The default Manifest V3 content security policy applies. The UI loads only packaged scripts and styles.

## Validation

`npm test` validates matching, ambiguity, URL destinations, cache behavior, context menus and the explicit permission contract. `npm run test:browser` loads the real extension and checks its panel without depending on third-party website availability.

Before release, manually check the native context menu, toolbar, permission grant/denial/revocation, two browser windows, and behavior after service-worker suspension. CI tests cannot establish the ongoing accuracy of provider data or third-party destination search results. The broader browser lifecycle matrix remains tracked in the roadmap.

A future provider, permission, content script, account integration, or monetization change requires an explicit review of this boundary and provider usage rights. See PRIVACY.md for the user-facing data policy.

## Vulnerability reports

Report issues involving private data, unexpected origins, or code execution privately to the repository owner before publishing exploit details. Avoid logging selected text or raw provider error bodies.
