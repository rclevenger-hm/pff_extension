import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const listeners={};
const opened=[];
const menus=[];
let removeAllCalls=0;
const chrome={
  runtime:{
    lastError:null,
    onInstalled:{addListener:handler=>{listeners.installed=handler;}},
    onStartup:{addListener:handler=>{listeners.startup=handler;}},
  },
  contextMenus:{
    removeAll:callback=>{removeAllCalls+=1;menus.length=0;callback?.();},
    create:(options,callback)=>{menus.push(options);callback?.();},
    onClicked:{addListener:handler=>{listeners.clicked=handler;}},
  },
  tabs:{create:options=>opened.push(options)},
};
const consoleStub={log:()=>{},error:()=>{}};
vm.runInNewContext(fs.readFileSync('background.js','utf8'),{chrome,console:consoleStub,encodeURIComponent},{filename:'background.js'});

assert.equal(typeof listeners.installed,'function');
assert.equal(typeof listeners.startup,'function');
assert.equal(typeof listeners.clicked,'function');
listeners.installed();
assert.equal(removeAllCalls,1,'installation should clear stale menu state before creation');
assert.equal(menus.length,1,'installation should create the selection context menu');
assert.equal(menus[0].id,'pffSearch');
assert.deepEqual(Array.from(menus[0].contexts),['selection']);

listeners.startup();
assert.equal(removeAllCalls,2,'startup should rebuild rather than duplicate the context menu');
assert.equal(menus.length,1,'startup should leave exactly one selection context menu');
assert.equal(menus[0].id,'pffSearch');

listeners.clicked({menuItemId:'other',selectionText:'ignored'});
assert.equal(opened.length,0,'unrelated context-menu actions must be ignored');

listeners.clicked({menuItemId:'pffSearch'});
listeners.clicked({menuItemId:'pffSearch',selectionText:'   '});
assert.equal(opened.length,0,'missing or blank selections must not open a tab');

listeners.clicked({menuItemId:'pffSearch',selectionText:'  Justin Herbert & pass rush  '});
assert.equal(opened.length,1);
assert.equal(opened[0].url,'https://www.pff.com/search?q=Justin%20Herbert%20%26%20pass%20rush','selected text should be trimmed and URL encoded');
assert.ok(opened[0].url.startsWith('https://www.pff.com/search?q='),'search destination must remain fixed to PFF');

console.log('Context-menu search behavior validated.');
