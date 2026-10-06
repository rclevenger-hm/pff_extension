import assert from 'node:assert/strict';
const listeners = {}, menus = [], tabs = [], panels = [], order = [], session = {}, errors = [];
let tabError = null;
const oldConsole = console.error;
console.error = (...args) => errors.push(args);
globalThis.chrome = {
  runtime: { id: 'test', lastError: null, onInstalled:{addListener:fn=>listeners.install=fn}, onStartup:{addListener:fn=>listeners.start=fn}, onMessage:{addListener:fn=>listeners.message=fn} },
  contextMenus: { removeAll:fn=>{menus.length=0;fn();}, create:(menu,fn)=>{menus.push(menu);fn();}, onClicked:{addListener:fn=>listeners.click=fn} },
  tabs: { create:(options,fn)=>{tabs.push(options);chrome.runtime.lastError=tabError;fn();chrome.runtime.lastError=null;} },
  sidePanel: { setPanelBehavior:async options=>assert.equal(options.openPanelOnActionClick,true), open:options=>{order.push('open');panels.push(options);return Promise.resolve();} },
  storage: {session:{set:async value=>{order.push('store');Object.assign(session,value);}}},
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
  console.log('Context menus, immediate panel opening, per-window requests, and legacy search validated.');
} finally { console.error=oldConsole;delete globalThis.chrome; }
