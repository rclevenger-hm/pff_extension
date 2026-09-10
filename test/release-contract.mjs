import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const version = String(manifest.version || '');

assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, 'manifest version must be numeric dotted notation');
assert.equal(manifest.manifest_version, 3, 'extension must remain Manifest V3');
assert.ok(!manifest.host_permissions || manifest.host_permissions.length === 0, 'extension should not request host permissions');
assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'tabs'], 'permission set changed; review security boundary before expanding');
assert.equal(manifest.background?.service_worker, 'background.js');

const expectedIcons = ['16', '48', '128'];
for (const size of expectedIcons) {
  assert.equal(manifest.icons?.[size], `icon${size}.png`, `icon mapping changed for ${size}px`);
  assert.equal(manifest.action?.default_icon?.[size], `icon${size}.png`, `action icon mapping changed for ${size}px`);
}

console.log(`release contract valid for PFF Search ${version}`);
