# Security policy and extension boundary

PFF Search is intentionally small. Its trust model should remain easy to inspect: selected text is used to construct a search URL, and the extension opens that URL in a new tab.

## Current permissions

The Manifest V3 package requests:

- `contextMenus` — create the right-click search action.
- `tabs` — open the generated search URL.

The extension does not currently request broad host permissions, page-content injection, storage, cookies, history, downloads, native messaging, or remote code execution permissions.

Any future change that adds one of those capabilities should be treated as a security-significant change and justified in the pull request.

## Input handling expectations

Selected page text is untrusted input. It must be encoded as a URL query value rather than concatenated into executable markup or script. The destination origin should remain fixed by extension code; selected text must not be able to choose an arbitrary scheme or host.

Do not add `eval`, dynamically downloaded JavaScript, or remote executable code. Manifest V3 service-worker code should remain packaged with the extension.

## Release review checklist

Before publishing a new package:

1. Confirm `manifest.json` still uses Manifest V3.
2. Review every permission and host permission; remove anything not required by current behavior.
3. Confirm the service worker named by the manifest exists and passes a JavaScript syntax check.
4. Confirm generated search URLs use HTTPS and a fixed expected destination.
5. Confirm selected text is URL-encoded.
6. Confirm no API keys, credentials, cookies, or browsing data are committed or logged.
7. Load the extension unpacked and test normal text plus characters such as spaces, quotes, `&`, `?`, `/`, and non-ASCII names.

Open PR #1 adds automated package/manifest validation; this checklist covers the trust decisions that automation cannot infer safely.

## Vulnerability reports

If a security issue could expose browsing data, redirect users to an unintended destination, execute unexpected code, or require unnecessary browser privileges, report it privately to the repository owner before publishing exploit details.
