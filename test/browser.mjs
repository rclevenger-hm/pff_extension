import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { rawPlayers } from './fixtures.mjs';
import { normalizeDirectory } from '../lib/players.js';
const extensionPath = path.resolve('.');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox'],
  viewport: { width: 380, height: 900 }, colorScheme: 'light',
});
const errors = [];
try {
  await mkdir('test-results', { recursive: true });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  const nav = name => page.locator(`[data-view="${name}"]`).click();
  const snapshot = async name => { await page.screenshot({ path: `test-results/${name}.png`, fullPage: true, animations: 'disabled' }); };
  const search = async text => { await page.getByRole('searchbox').fill(text); await page.getByRole('button', { name: 'Find player', exact: true }).click(); };
  const filters = async () => { if (!await page.locator('#filters').getAttribute('open').then(value => value !== null)) await page.locator('#filters > summary').click(); };
  const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'panel must fit a narrow sidebar');
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Set up');
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({ origins: ['https://api.sleeper.app/*'] })), false);
  await snapshot('onboarding');
  // Favorites are configurable before directory enablement or any search.
  await nav('sources'); assert.equal(await page.locator('#sources a').count(), 0);
  await page.getByRole('button', { name: 'Favorite YouTube', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-source="youtube"]').getAttribute('aria-pressed') === 'true');
  await nav('research'); await search('Justin Herbert');
  assert.ok((await page.locator('#quick-sources a').first().getAttribute('href')).includes('Justin+Herbert'));
  assert.equal(await page.locator('#quick-sources a').count(), 3);
  await worker.evaluate(players => chrome.storage.local.set({ playerDirectoryV1: { version: 1, fetchedAt: Date.now(), players } }), normalizeDirectory(rawPlayers));
  await page.reload(); await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Profiles');
  await search('Justin Herbert'); await page.getByRole('heading', { name: 'Justin Herbert', exact: true }).waitFor();
  assert.equal(await page.locator('#player-context').textContent(), 'LAC · QB');
  await snapshot('player-panel');
  await nav('sources');
  const espn = page.locator('#sources a').filter({ hasText: 'ESPN' });
  assert.equal(await espn.getAttribute('href'), 'https://www.espn.com/nfl/player/_/id/4038941');
  const newTab = context.waitForEvent('page'); await context.route('https://www.espn.com/**', route => route.fulfill({ body: 'ESPN destination test' }));
  await espn.click(); const opened = await newTab; await opened.waitForLoadState(); assert.ok(opened.url().endsWith('/4038941')); await opened.close();
  await snapshot('sources'); await nav('settings'); await page.getByLabel('Color theme').selectOption('dark');
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  assert.equal(await page.locator('#search-bar').isVisible(), false); await snapshot('settings-dark');
  await page.getByLabel('Color theme').selectOption('light'); await nav('research');
  assert.equal(await page.locator('#player-name').textContent(), 'Justin Herbert', 'navigation must preserve selected player');
  await search('Mike Williams'); assert.equal(await page.locator('.candidate').count(), 2); assert.equal(await page.locator('#profile').isVisible(), false);
  await snapshot('matches');
  // Keyboard support must move focus without implicitly selecting an ambiguous player.
  await page.getByRole('searchbox').focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('.candidate').first().evaluate(node => document.activeElement === node), true);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  assert.equal(await page.locator('#player-context').textContent(), 'BBB · RB');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.candidate').count(), 2);
  await filters(); await page.getByLabel('Position', { exact: true }).selectOption('WR');
  assert.equal(await page.locator('.candidate').count(), 1);
  await page.getByLabel('Team', { exact: true }).selectOption('LAC');
  assert.equal(await page.locator('#no-results').isVisible(), true);
  await page.locator('#filters > summary').click(); await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  assert.equal(await page.locator('.candidate').count(), 2);
  await search('J. Herbert'); await page.locator('.candidate').filter({ hasText: 'Initial match' }).click();
  await search('Justni Herbert'); await page.locator('.candidate').filter({ hasText: 'Spelling suggestion' }).click();
  await search('D.K. Metcalf'); await page.getByRole('heading', { name: 'DK Metcalf', exact: true }).waitFor();
  await search('Josh Allen'); await page.getByRole('heading', { name: 'Josh Allen', exact: true }).waitFor();
  await filters(); await page.getByLabel('Include inactive players').check(); assert.equal(await page.locator('.candidate').count(), 2);
  await page.keyboard.press('Escape');
  await search('<img src=x onerror=alert(1)>'); assert.equal(await page.locator('#player-name img').count(), 0);
  await search('Unlisted Mystery Player'); assert.equal(await page.locator('#profile').isVisible(), false);
  await nav('sources'); assert.equal(await page.locator('#sources a').count(), 5);
  await nav('research'); await search('Justin Herbert');
  // Requests are window-scoped. A consumed old request must not override later typed research on reopen.
  await page.evaluate(async () => { const win = await chrome.windows.getCurrent(); await chrome.storage.session.set({ [`research:${win.id + 100}`]: { query: 'DK Metcalf', requestedAt: 1 } }); });
  assert.equal(await page.getByRole('searchbox').inputValue(), 'Justin Herbert');
  await page.evaluate(async () => { const win = await chrome.windows.getCurrent(); await chrome.storage.session.set({ [`research:${win.id}`]: { query: 'DK Metcalf', requestedAt: 2 } }); });
  await page.getByRole('heading', { name: 'DK Metcalf', exact: true }).waitFor();
  await search('Justin Herbert'); await page.reload(); await page.getByRole('heading', { name: 'Justin Herbert', exact: true }).waitFor();
  await context.setOffline(true); await page.reload(); await page.getByRole('heading', { name: 'Justin Herbert', exact: true }).waitFor(); await context.setOffline(false);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  assert.equal(await page.locator('#recent-section').isVisible(), true);
  await snapshot('home-recents');
  await page.locator('.recent-player').filter({ hasText: 'Justin Herbert' }).click();
  await page.setViewportSize({ width: 280, height: 800 }); await fits();
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light', 'explicit theme overrides system');
  await nav('settings'); await page.getByLabel('Color theme').selectOption('system'); await nav('research');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  await snapshot('player-panel-dark-narrow'); await nav('sources'); await fits(); await nav('settings'); await fits();
  // Slash from settings returns to Research and focuses the editable query.
  await page.locator('#main').focus(); await page.keyboard.press('/'); assert.equal(await page.getByRole('searchbox').evaluate(node => node === document.activeElement), true);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click(); await page.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.equal(await page.locator('#recent-section').isVisible(), false);
  await page.reload(); await page.waitForFunction(() => document.querySelector('#connection-label').textContent === 'Profiles');
  assert.equal(await page.getByRole('searchbox').inputValue(), ''); assert.equal(await page.locator('#recent-section').isVisible(), false);
  // A stale cache is visible, usable, and leads to a specific recovery action.
  await worker.evaluate(async () => { const data = (await chrome.storage.local.get('playerDirectoryV1')).playerDirectoryV1; data.fetchedAt = Date.now() - 90000000; await chrome.storage.local.set({ playerDirectoryV1: data }); });
  await page.reload(); await page.locator('#directory-warning').waitFor(); await search('Justin Herbert');
  await page.getByRole('heading', { name: 'Justin Herbert', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review', exact: true }).click(); await page.getByText('Manage downloaded data', { exact: true }).click();
  await page.getByRole('button', { name: 'Remove downloaded directory' }).click();
  await page.getByRole('button', { name: 'Enable player profiles', exact: true }).waitFor();
  await nav('research'); assert.equal(await page.locator('#profile').isVisible(), false);
  await page.getByRole('button', { name: 'Clear search', exact: true }).click(); assert.equal(await page.locator('#recent-section').isVisible(), false);
  assert.deepEqual(errors, []);
  console.log('Installed MV3 extension: first use, profiles, ambiguity, filters, keyboard, sources, themes, recents, state restoration, window isolation, offline/stale cache, 280px layouts, and removal passed.');
} catch (error) {
  for (const page of context.pages()) if (page.url().endsWith('/sidepanel.html')) await page.screenshot({ path: 'test-results/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally { await context.close(); }
