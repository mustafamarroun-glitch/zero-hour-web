"""Import only checksum-inventoried RA2 VM code from a read-only reference.

Usage: python tools/import-yuri-runtime.py <Online-Games directory>
No player files, caches, credentials or source checkout are copied.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
reference = Path(sys.argv[1]).resolve()
replacements = {
    'ra2-vm-game-files': 'zhweb-yuri-game-files-v1',
    'ra2-vm-development-files': 'zhweb-yuri-saves-v1',
    'ra2-vm-preferred-game': 'zhweb-yuri-preferred-game',
    'ra2-vm-edge-mouse-notice-skipped': 'zhweb-yuri-edge-mouse-notice-skipped',
    'ra2-vm-touch-controls-hidden': 'zhweb-yuri-touch-controls-hidden',
    'vm-master-volume': 'zhweb-yuri-master-volume',
    'vm-clock-rate': 'zhweb-yuri-clock-rate',
    'vm-resolution-': 'zhweb-yuri-resolution-',
    './winchester-mark.svg': 'data:,',
    './public/winchester-mark.svg': 'data:,',
    'winchester-library.json': 'library.json',
}

def transform(data, name):
    if Path(name).suffix in {'.js', '.ts', '.tsx', '.mts', '.html', '.json', '.md'}:
        text = data.decode('utf-8')
        for before, after in replacements.items():
            text = text.replace(before, after)
        if name.endswith('index.html'):
            text = text.replace('Red Alert 2 in your browser', "Yuri's Revenge in your browser")
        return text.encode('utf-8')
    return data

for folder in ['yuris-revenge', 'yuri-relay']:
    origin = reference / 'experiments' / folder
    manifest = json.loads((origin / 'provenance.json').read_text())
    if manifest['commit'] != 'a10ac9899c258b01be1edd80492397e9de225ba5':
        raise ValueError('Unexpected RA2 VM revision')
    target = root / 'public/yuri' / ('engine' if folder == 'yuris-revenge' else 'relay')
    artifacts = []
    for item in manifest['artifacts']:
        name = item['path']
        parts = Path(name).parts
        if any(part.startswith('.') for part in parts) or Path(name).suffix.lower() in {'.exe', '.dll', '.mix', '.big', '.sav', '.rep'}:
            raise ValueError('Unsafe or retail artifact: ' + name)
        data = (origin / name).read_bytes()
        if hashlib.sha256(data).hexdigest() != item['sha256']:
            raise ValueError('Reference checksum mismatch: ' + name)
        if name == 'runtime/winchester-mark.svg':
            continue
        if name == 'relay.cjs':
            destination = root / 'tools/yuri-relay/relay.cjs'
        else:
            name = name.replace('winchester-library.json', 'library.json')
            destination = target / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        if name == 'RA2-VM-source.zip':
            # Keep complete corresponding source, with the same namespace
            # substitutions as the compiled chunks. No gameplay edits.
            with zipfile.ZipFile(origin / item['path']) as source, zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as out:
                for entry in source.infolist():
                    out.writestr(entry.filename, transform(source.read(entry), entry.filename))
                out.writestr('ZERO_HOUR_WEB_BUILD.md',
                    'RA2 VM a10ac9899c258b01be1edd80492397e9de225ba5. '
                    'The original modified source and build instructions are retained. '
                    'This integration changes browser storage key strings and the page title/favicon only. '
                    'Use pnpm 11.24.0, pnpm install --frozen-lockfile, '
                    'then pnpm exec vite build --base ./; retain the documented .rom firmware packaging.\n')
        else:
            destination.write_bytes(transform(data, name))
        published = destination.read_bytes()
        artifacts.append({'path': destination.relative_to(root).as_posix(), 'bytes': len(published),
                          'sha256': hashlib.sha256(published).hexdigest(), 'referenceSha256': item['sha256']})
    target.mkdir(parents=True, exist_ok=True)
    (target / 'provenance.json').write_text(json.dumps({
        'engine': manifest['engine'], 'commit': manifest['commit'], 'license': manifest['license'],
        'upstream': 'https://github.com/ra2-games/ra2',
        'changes': manifest['changes'] + ['Independent Zero Hour Web Yuri storage namespace', 'Website page title and empty favicon'],
        'artifacts': artifacts,
    }, indent=2) + '\n')
    print(f'{folder}: {len(artifacts)} verified code/source/license artifacts')
