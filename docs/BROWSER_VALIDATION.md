# Real-browser validation plan

The current tests protect the Manifest V3 package contract and service-worker behavior without requiring Chrome. The next release-quality step is a small real-browser smoke harness that verifies the extension as Chrome actually loads it.

## Required scenarios

The harness should launch a temporary Chrome/Chromium profile with the unpacked extension and verify:

1. the extension loads without manifest or service-worker errors;
2. the context-menu entry is registered after startup;
3. selected player text is encoded safely into the destination search URL;
4. an empty or whitespace-only selection does not create a useless tab;
5. a failed `chrome.tabs.create` call is surfaced without terminating the service worker;
6. service-worker restart does not create duplicate context-menu entries.

## Permission boundary

The release contract currently permits only `contextMenus` and no host permissions. The browser harness must not require expanding that permission set merely to make testing easier. Any future permission addition should be reviewed as a product/security decision and reflected in the release-contract test.

## CI shape

Keep the existing fast Node tests as the first gate. Run the browser smoke test afterward with a pinned browser major version or a documented stable channel. Store browser console/service-worker errors in the job log so failures are diagnosable without reproducing locally.

The test should use a temporary profile and must not depend on a signed-in browser, personal PFF account, or live user data.

## Release gate

A release is ready when the Node contract tests pass, the unpacked extension loads cleanly in a real browser, context-menu behavior works after a service-worker restart, and the packaged manifest requests no permissions beyond those intentionally reviewed.
