"""Create a deterministic, runtime-only extension archive."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
files = ['manifest.json', 'background.js', 'sidepanel.html', 'sidepanel.css', 'sidepanel.js',
         'lib/players.js', 'lib/directory.js', 'lib/destinations.js',
         'icon16.png', 'icon48.png', 'icon128.png', 'README.md', 'PRIVACY.md']
output = root / 'dist' / f'pff-search-{manifest["version"]}.zip'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for filename in sorted(files):
        entry = ZipInfo(filename, date_time=(2020, 1, 1, 0, 0, 0))
        entry.compress_type = ZIP_DEFLATED
        entry.external_attr = 0o644 << 16
        archive.writestr(entry, (root / filename).read_bytes())
print(output.relative_to(root))
