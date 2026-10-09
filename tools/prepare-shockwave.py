"""Prepare a private browser folder from player-owned base and ShockWave files."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ["INIZH.big", "EnglishZH.big", "WindowZH.big", "MapsZH.big", "MusicZH.big",
        "GensecZH.big", "TerrainZH.big", "TexturesZH.big", "W3DZH.big", "W3DEnglishZH.big",
        "SpeechZH.big", "SpeechEnglishZH.big", "AudioZH.big", "AudioEnglishZH.big",
        "ShadersZH.big", "Music.big", "ScriptsZH.big"]

def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def copy_cursors(base, output):
    """Copy native artwork into the private package without changing the source."""
    source = base / 'Data' / 'Cursors'
    cursors = sorted(source.glob('*.ani'))
    if not {'sccpointer.ani', 'sccattack.ani'}.issubset({p.name.lower() for p in cursors}):
        raise ValueError(f'Missing original cursor artwork in {source}')
    destination = output / 'Data' / 'Cursors'
    destination.mkdir(parents=True, exist_ok=True)
    for cursor in cursors:
        target = destination / cursor.name
        if target.exists() and digest(target) != digest(cursor):
            raise ValueError(f'Existing cursor differs: {target}')
        if not target.exists():
            shutil.copyfile(cursor, target)
        if digest(target) != digest(cursor):
            raise ValueError(f'Cursor copy verification failed: {cursor.name}')
    return len(cursors)

def prepare(base, mod, output):
    base, mod, output = (Path(p).resolve() for p in (base, mod, output))
    if output == base or output == mod or output in base.parents or output in mod.parents:
        raise ValueError('Output must be a separate new folder.')
    if output.exists():
        raise ValueError('Output already exists. Choose a new folder; existing files are never overwritten.')
    cursor_sources = sorted((base / 'Data/Cursors').glob('*.ani'))
    if len(cursor_sources) != 52 or not {'sccpointer.ani', 'sccattack.ani'}.issubset({p.name.lower() for p in cursor_sources}):
        raise ValueError('The browser profile requires all 52 original ANI cursors. No output was created.')
    spec = json.loads((ROOT / 'public/shockwave/manifest.json').read_text())
    files = [(base / name, name, None) for name in BASE]
    for archive in spec['archives']:
        candidates = [mod / name for name in (archive['sourceName'], archive['name'], '!' + archive['name'])]
        found = [p for p in candidates if p.is_file()]
        if len(found) != 1:
            raise ValueError(f"Choose one mod installation: missing or duplicate {archive['name']}")
        files.append((found[0], archive['name'], archive))
    # Validate every source before creating the output. Native files and optional patches are excluded.
    inventory = []
    for source, name, archive in files:
        if not source.is_file():
            raise ValueError(f'Missing base archive: {source}')
        with source.open('rb') as stream:
            if stream.read(4) not in (b'BIGF', b'BIG4'):
                raise ValueError(f'Invalid archive: {source}')
        sha = digest(source)
        if archive and (source.stat().st_size != archive['bytes'] or sha != archive['sha256']):
            raise ValueError(f'{source.name} differs from official ShockWave 1.201.')
        inventory.append({'name': name, 'bytes': source.stat().st_size, 'sha256': sha})
    output.mkdir(parents=True)
    for (source, name, _), record in zip(files, inventory):
        shutil.copyfile(source, output / name)
        if digest(output / name) != record['sha256']:
            raise ValueError(f'Copy verification failed: {name}')
    cursor_count = copy_cursors(base, output)
    cursor_inventory = [{'name': 'Data/Cursors/' + p.name, 'bytes': p.stat().st_size, 'sha256': digest(p)} for p in cursor_sources]
    (output / 'browser-package.json').write_text(json.dumps({'game': 'shockwave', 'version': '1.201', 'files': inventory, 'cursorFiles': cursor_count, 'cursors': cursor_inventory}, indent=2))
    print(json.dumps({'folder': str(output), 'archives': len(files), 'cursorFiles': cursor_count, 'bytes': sum(i['bytes'] for i in inventory + cursor_inventory), 'verified': True}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--mod', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    prepare(args.base, args.mod, args.output)
