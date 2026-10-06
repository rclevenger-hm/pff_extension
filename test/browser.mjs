import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { rawPlayers } from './fixtures.mjs';
import { normalizeDirectory } from '../lib/players.js';
const extensionPath = path.resolve('.');
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium', headless: true,
  ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}),
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--no-sandbox'],
  viewport: { width: 380, height: 900 },
});
const errors = [];
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${id}/sidepanel.html`);
  await page.getByRole('button', { name: 'Enable directory' }).waitFor();
  assert.equal(await worker.evaluate(() => chrome.permissions.contains({origins:['https://api.sleeper.app/*']})), false);
  await page.getByRole('searchbox').fill('Justin Herbert');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.getByRole('link', { name: 'PFF Grades & analysis' }).waitFor();
  assert.ok((await page.getByRole('link', { name: 'PFF Grades & analysis' }).getAttribute('href')).includes('Justin+Herbert'));
  await worker.evaluate(players => chrome.storage.local.set({playerDirectoryV1:{version:1,fetchedAt:Date.now(),players}}),normalizeDirectory(rawPlayers));
  await page.reload();
  await page.getByRole('button', { name: 'Up to date' }).waitFor();
  async function search(query) { await page.getByRole('searchbox').fill(query); await page.getByRole('button', { name: 'Find', exact: true }).click(); }
  await search('Justin Herbert');
  await page.getByRole('heading', { name: 'Justin Herbert', exact: true }).waitFor();
  assert.equal(await page.locator('#player-context').textContent(),'LAC · QB');
  assert.equal(await page.getByRole('link',{name:'ESPN Stats & coverage'}).getAttribute('href'),'https://www.espn.com/nfl/player/_/id/4038941');
  const newTab = context.waitForEvent('page');
  await context.route('https://www.espn.com/**', route => route.fulfill({body:'ESPN destination test'}));
  await page.getByRole('link',{name:'ESPN Stats & coverage'}).click();
  const opened = await newTab; await opened.waitForLoadState(); assert.ok(opened.url().endsWith('/4038941')); await opened.close();
  await search('Mike Williams');
  assert.equal(await page.locator('.candidate').count(),2);assert.equal(await page.locator('#profile').isVisible(),false);
  await page.getByRole('button',{name:/Mike Williams BBB/}).click();
  assert.equal(await page.locator('#player-context').textContent(),'BBB · RB');
  await page.getByRole('button',{name:'Back to matches'}).click(); assert.equal(await page.locator('.candidate').count(),2);
  await search('J. Herbert'); await page.getByRole('button',{name:/Justin Herbert.*Initial match/}).click();
  await search('Justni Herbert'); await page.getByRole('button',{name:/Justin Herbert.*Spelling suggestion/}).click();
  await search('D.K. Metcalf'); await page.getByRole('heading',{name:'DK Metcalf',exact:true}).waitFor();
  await search('Josh Allen');await page.getByRole('heading',{name:'Josh Allen',exact:true}).waitFor();
  await page.getByLabel('Include inactive players').check();assert.equal(await page.locator('.candidate').count(),2);
  await search('<img src=x onerror=alert(1)>'); assert.equal(await page.locator('#player-name img').count(),0);
  await search('Unlisted Mystery Player'); assert.equal(await page.locator('#profile').isVisible(),false); assert.equal(await page.locator('#sources a').count(),5);
  await page.getByRole('button',{name:'Favorite YouTube',exact:true}).click();
  await page.reload(); await page.getByRole('button',{name:'Up to date'}).waitFor();
  await search('Justin Herbert'); assert.equal(await page.getByRole('button',{name:'Favorite YouTube',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await page.getByLabel('Include inactive players').isChecked(),true);
  // Session requests are scoped to the current browser window and update an already-open panel.
  await page.evaluate(async () => { const win=await chrome.windows.getCurrent(); await chrome.storage.session.set({[`research:${win.id+100}`]:{query:'DK Metcalf'}}); });
  assert.equal(await page.getByRole('searchbox').inputValue(),'Justin Herbert');
  await page.evaluate(async () => { const win=await chrome.windows.getCurrent(); await chrome.storage.session.set({[`research:${win.id}`]:{query:'DK Metcalf'}}); });
  await page.getByRole('heading',{name:'DK Metcalf',exact:true}).waitFor();
  await page.reload(); await page.getByRole('heading',{name:'DK Metcalf',exact:true}).waitFor();
  await context.setOffline(true); await page.reload();await page.getByRole('heading',{name:'DK Metcalf',exact:true}).waitFor();await context.setOffline(false);
  // A real directory can optionally be used for a local visual/scale check, never committed.
  if (process.env.PLAYER_DIRECTORY_FILE) {
    const players = normalizeDirectory(JSON.parse(await readFile(process.env.PLAYER_DIRECTORY_FILE,'utf8')));
    await worker.evaluate(players => chrome.storage.local.set({playerDirectoryV1:{version:1,fetchedAt:Date.now(),players}}),players);
    await page.reload();await page.getByRole('button',{name:'Up to date'}).waitFor();
  }
  await search('Justin Herbert');
  await mkdir('test-results',{recursive:true});
  await page.screenshot({path:'test-results/player-panel.png',fullPage:true});
  await page.setViewportSize({width:280,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'panel must fit a narrow sidebar');
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'test-results/player-panel-dark.png',fullPage:true});
  await page.getByText('Data & privacy',{exact:true}).click();
  await page.getByRole('button',{name:'Remove downloaded directory'}).click();
  await page.getByRole('button',{name:'Enable directory'}).waitFor();
  assert.equal(await page.locator('#profile').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('Installed MV3 extension: onboarding, lookup, disambiguation, links, favorites, persistence, window isolation, offline use, narrow layout, and deletion passed.');
} finally { await context.close(); }
