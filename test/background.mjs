import assert from 'node:assert/strict';
const listeners = {}, menus = [], tabs = [], panels = [], order = [], session = {}, errors = [];
let tabError = null, removalError = null;
const local = {}, permissionRemovals = [];
function storageArea(data) {
  return {
    get: async keys => Object.fromEntries((keys === null ? Object.keys(data) : Array.isArray(keys) ? keys : [keys]).filter(key => Object.hasOwn(data, key)).map(key => [key, structuredClone(data[key])])),
    set: async value => { order.push('store'); Object.assign(data, structuredClone(value)); },
    remove: async key => { if (removalError) throw removalError; delete data[key]; },
  };
}
const oldConsole = console.error;
console.error = (...args) => errors.push(args);
globalThis.chrome = {
  runtime: { id: 'test', lastError: null, onInstalled:{addListener:fn=>listeners.install=fn}, onStartup:{addListener:fn=>listeners.start=fn}, onMessage:{addListener:fn=>listeners.message=fn} },
  contextMenus: { removeAll:fn=>{menus.length=0;fn();}, create:(menu,fn)=>{menus.push(menu);fn();}, onClicked:{addListener:fn=>listeners.click=fn} },
  tabs: { create:(options,fn)=>{tabs.push(options);chrome.runtime.lastError=tabError;fn();chrome.runtime.lastError=null;} },
  sidePanel: { setPanelBehavior:async options=>assert.equal(options.openPanelOnActionClick,true), open:options=>{order.push('open');panels.push(options);return Promise.resolve();} },
  storage: { session: storageArea(session), local: storageArea(local) },
  permissions: { remove: async request => { permissionRemovals.push(request); return false; } },
  action: { setBadgeText:async()=>{},setTitle:async()=>{} },
};
try {
  await import('../background.js');
  listeners.install(); listeners.start();
  assert.deepEqual(menus.map(m=>m.id),['playerResearch','pffSearch']);
  assert.ok(menus.every(m=>m.contexts[0]==='selection'));
  for(const selectionText of ['', ' ', null]) listeners.click({menuItemId:'playerResearch',selectionText},{windowId:1});
  listeners.click({menuItemId:'other',selectionText:'ignored'},{windowId:1});
  assert.equal(panels.length,0);
  listeners.click({menuItemId:'playerResearch',selectionText:' Justin Herbert '},{windowId:7});
  assert.deepEqual(order,['open','store']); assert.equal(session['research:7'].query,'Justin Herbert');
  assert.equal(panels[0].windowId,7);
  listeners.click({menuItemId:'playerResearch',selectionText:'Josh Allen'},{windowId:8});
  assert.equal(session['research:7'].query,'Justin Herbert'); assert.equal(session['research:8'].query,'Josh Allen');
  listeners.click({menuItemId:'pffSearch',selectionText:' Justin Herbert & pass rush '});
  assert.equal(tabs[0].url,'https://www.pff.com/search?q=Justin%20Herbert%20%26%20pass%20rush');
  listeners.click({menuItemId:'pffSearch',selectionText:'x'.repeat(499)+'🏈'+'y'.repeat(100)});
  const query = new URL(tabs[1].url).searchParams.get('q'); assert.equal(Array.from(query).length,500);assert.ok(query.endsWith('🏈'));
  tabError={message:'blocked'};listeners.click({menuItemId:'pffSearch',selectionText:'failure'});assert.equal(errors.length,1);
  assert.equal(listeners.message({type:'loadDirectory'},{id:'foreign'},()=>{}),false);
  assert.equal(listeners.message({type:'unknown'},{id:'test'},()=>{}),false);
  const message = request => new Promise(resolve => assert.equal(listeners.message(request, { id: 'test' }, resolve), true));
  for (const type of ['loadResearchSession', 'saveResearchSession', 'clearDirectory']) {
    assert.equal(listeners.message({ type }, { id: 'foreign' }, () => assert.fail('Foreign message must not receive data')), false);
  }
  // The worker owns cleanup even when these windows have no live panel document.
  Object.assign(session, {
    'researchUI:7': { query: 'Justin Herbert', selectedId: '1', recentIds: ['1', '2'], lastRequestAt: 42 },
    'researchUI:8': { query: 'Josh Allen', selectedId: '3', recentIds: ['3'], lastRequestAt: 43 },
    unrelated: { keep: true },
  });
  local.playerDirectoryV1 = { version: 1 };
  const cleared = await message({ type: 'clearDirectory' });
  assert.equal(typeof cleared.generation, 'string');
  assert.deepEqual(permissionRemovals, [{ origins: ['https://api.sleeper.app/*'] }]);
  assert.equal(local.playerDirectoryV1, undefined);
  for (const id of [7, 8]) {
    assert.deepEqual(session[`researchUI:${id}`].recentIds, []);
    assert.equal(session[`researchUI:${id}`].selectedId, null);
  }
  assert.equal(session['researchUI:7'].query, 'Justin Herbert');
  assert.equal(session['researchUI:7'].lastRequestAt, 42);
  assert.deepEqual(session.unrelated, { keep: true });
  assert.equal(session['research:8'].query, 'Josh Allen');
  const stale = await message({ type: 'saveResearchSession', windowId: 8, generation: null,
    state: { query: 'New typed search', selectedId: '3', recentIds: ['3'], lastRequestAt: 43 } });
  assert.equal(stale.cleared, true);
  const loaded = await message({ type: 'loadResearchSession', windowId: 8 });
  assert.equal(loaded.generation, cleared.generation);
  assert.deepEqual(loaded.state.recentIds, []);
  assert.equal(loaded.state.selectedId, null);
  assert.equal(loaded.state.query, 'Josh Allen', 'stale saves must not overwrite committed research');
  // A partial removal failure must reach the panel, not be announced as success.
  local.playerDirectoryV1 = { version: 1 }; removalError = new Error('Storage unavailable');
  assert.ok((await message({ type: 'clearDirectory' })).error);
  assert.ok(local.playerDirectoryV1);
  removalError = null;
  assert.ok((await message({ type: 'clearDirectory' })).generation);
  assert.equal(local.playerDirectoryV1, undefined);
  console.log('Context menus, per-window requests, worker session saves, and all-window directory removal validated.');
} finally { console.error=oldConsole;delete globalThis.chrome; }
