import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const version = String(manifest.version || '');

assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, 'manifest version must be numeric dotted notation');
assert.equal(manifest.manifest_version, 3, 'extension must remain Manifest V3');
assert.ok(!manifest.host_permissions || manifest.host_permissions.length === 0, 'extension should not request host permissions');
assert.deepEqual([...manifest.permissions].sort(), ['contextMenus', 'tabs'], 'permission set changed; review security boundary before expanding');
assert.equal(manifest.background?.service_worker, 'background.js');

function assertPngIcon(relativePath, expectedSize) {
  const bytes = readFileSync(new URL(`../${relativePath}`, import.meta.url));
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  assert.ok(bytes.length >= 24, `${relativePath} is too small to be a valid PNG`);
  assert.ok(signature.every((value, index) => bytes[index] === value), `${relativePath} must be a PNG file`);
  assert.equal(bytes.readUInt32BE(16), expectedSize, `${relativePath} width must be ${expectedSize}px`);
  assert.equal(bytes.readUInt32BE(20), expectedSize, `${relativePath} height must be ${expectedSize}px`);
}

const expectedIcons = ['16', '48', '128'];
for (const size of expectedIcons) {
  const relativePath = `icon${size}.png`;
  assert.equal(manifest.icons?.[size], relativePath, `icon mapping changed for ${size}px`);
  assert.equal(manifest.action?.default_icon?.[size], relativePath, `action icon mapping changed for ${size}px`);
  assertPngIcon(relativePath, Number(size));
}

console.log(`release contract valid for PFF Search ${version}`);
