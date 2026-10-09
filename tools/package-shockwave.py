"""Audit player-owned ShockWave assets and build a verified, browser-compatible ZIP.

Outputs stay private. Sources are read only; no files or old saves are deleted.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import runpy
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE = runpy.run_path(str(ROOT / 'tools/prepare-shockwave.py'))['BASE']

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def validate_big(path):
    size = path.stat().st_size
    with path.open('rb') as stream:
        data = stream.read(min(size, 64 * 1024 * 1024))
    if len(data) < 16 or data[:4] != b'BIGF':
        raise ValueError(f'{path.name}: invalid BIG header')
    sizes = {order: struct.unpack_from(order + 'I', data, 4)[0] for order in ('<', '>')}
    count = struct.unpack_from('>I', data, 8)[0]
    if size not in sizes.values() or count > 200000:
        raise ValueError(f'{path.name}: invalid size or entry count')
    position = 16
    first = size
    names = set()
    duplicates = []
    for _ in range(count):
        if position + 9 > len(data):
            raise ValueError(f'{path.name}: incomplete directory')
        offset, length = struct.unpack_from('>II', data, position)
        end = data.find(b'\0', position + 8, position + 269)
        if end <= position + 8 or offset + length > size:
            raise ValueError(f'{path.name}: invalid entry name or extent')
        name = data[position + 8:end].decode('latin1').replace('\\', '/').lower()
        if name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/')):
            raise ValueError(f'{path.name}: unsafe entry path {name}')
        if name in names:
            duplicates.append(name)
        names.add(name)
        first = min(first, offset)
        position = end + 1
    if first < position:
        raise ValueError(f'{path.name}: payload overlaps directory')
    return {'entries': count, 'sizeByteOrder': 'little' if sizes['<'] == size else 'big', 'duplicateEntries': duplicates}

def category(name):
    lower = name.lower()
    if 'patch1.06' in lower:
        return 'Excluded incompatible Patch 1.06'
    if lower.endswith('.bik'):
        return 'Excluded cinematics'
    if lower.endswith(('.exe', '.dll', '.msi', '.bat', '.cmd')):
        return 'Excluded native programs'
    if lower.endswith(('.sav', '.rep')):
        return 'Excluded saves and replays'
    if 'cicons' in lower or 'ptchicon' in lower:
        return 'Excluded optional classic icons'
    if 'german' in lower:
        return 'Excluded other-language resources'
    if 'shwlnchr/' in lower:
        return 'Excluded native launcher artwork'
    return 'Other files outside browser profile'

def build(folder, base, mod, output):
    folder, base, mod, output = [Path(p).resolve() for p in (folder, base, mod, output)]
    if output.exists():
        raise ValueError('Output exists. Choose a new directory; existing packages are never overwritten.')
    if any(output == p or output in p.parents or p in output.parents for p in (folder, base, mod)):
        raise ValueError('Output must be separate from the input directories.')
    spec = json.loads((ROOT / 'public/shockwave/manifest.json').read_text())
    sources = [(name, base / name, None) for name in BASE]
    for archive in spec['archives']:
        sources.append((archive['name'], mod / archive['sourceName'], archive))
    originals = sorted((base / 'Data/Cursors').glob('*.ani'))
    if not {'sccpointer.ani', 'sccattack.ani'}.issubset({p.name.lower() for p in originals}):
        raise ValueError('Missing original cursor artwork in the base installation.')
    sources += [('Data/Cursors/' + p.name, p, None) for p in originals]
    records = []
    for name, original, pinned in sources:
        current = folder / name
        if not current.is_file() or not original.is_file():
            raise ValueError(f'Missing required file: {name}')
        digest = sha(current)
        if digest != sha(original):
            raise ValueError(f'{name}: prepared copy differs from its original')
        if pinned and (digest != pinned['sha256'] or current.stat().st_size != pinned['bytes']):
            raise ValueError(f'{name}: official ShockWave archive differs')
        record = {'path': name, 'bytes': current.stat().st_size, 'sha256': digest}
        if current.suffix.lower() == '.big':
            record.update(validate_big(current))
        else:
            data = current.read_bytes()
            if data[:4] != b'RIFF' or data[8:12] != b'ACON' or len(data) < 12:
                raise ValueError(f'{name}: invalid animated cursor container')
        records.append(record)
        print('AUDIT', name, flush=True)
    names = {r['path'] for r in records}
    extras = [{'path': p.relative_to(folder).as_posix(), 'bytes': p.stat().st_size}
              for p in folder.rglob('*') if p.is_file() and p.relative_to(folder).as_posix() not in names]
    excluded = []
    kept_sources = {p.resolve() for _, p, _ in sources}
    for label, root in [('base', base), ('mod', mod)]:
        for p in root.rglob('*'):
            if p.is_file() and p.resolve() not in kept_sources:
                name = p.relative_to(root).as_posix()
                excluded.append({'source': label, 'path': name, 'bytes': p.stat().st_size, 'reason': category(name)})
    output.mkdir(parents=True, exist_ok=False)
    archive = output / 'ShockWave-Browser-English-1.201.zip'
    with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as package:
        for item in records:
            print('ZIP', item['path'], flush=True)
            package.write(folder / item['path'], item['path'])
    with zipfile.ZipFile(archive) as package:
        if set(package.namelist()) != names or len(package.infolist()) != len(records):
            raise ValueError('ZIP inventory differs from audited files')
        for item in records:
            with package.open(item['path']) as stream:
                # Fully reading each entry checks its ZIP CRC as well as its SHA.
                if hashlib.file_digest(stream, 'sha256').hexdigest() != item['sha256']:
                    raise ValueError(f"ZIP restored checksum differs: {item['path']}")
    digest = sha(archive)
    unpacked = sum(r['bytes'] for r in records)
    report = {'status': 'passed', 'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'archive': str(archive), 'archiveBytes': archive.stat().st_size, 'archiveSha256': digest,
              'expandedBytes': unpacked, 'reductionPercent': round((1 - archive.stat().st_size / unpacked) * 100, 2),
              'baseArchives': len(BASE), 'modArchives': len(spec['archives']), 'cursorFiles': len(originals),
              'files': records, 'excludedPreparedFiles': extras, 'excludedSourceFiles': excluded,
              'verification': 'All required copies match source SHA-256. All BIG entry bounds valid. Every ZIP entry fully restored with CRC and SHA-256 verification. Native browser import and gameplay are separate gates.'}
    (output / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (output / (archive.name + '.sha256')).write_text(digest + '  ' + archive.name + '\n', encoding='utf-8')
    (output / 'README.txt').write_text('ShockWave 1.201 browser package\n\nOpen the ShockWave page, choose ZIP or RAR, and select ShockWave-Browser-English-1.201.zip. Import the ZIP directly; do not install its contents as a Windows program.\n\nIncludes the combined English Zero Hour base, 11 active ShockWave archives and original cursor artwork. No cinematics, native programs, optional classic icons, saves or replays.\n\nThe website code is a separate release/site package. These game files stay local when imported.\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k not in ('files', 'excludedSourceFiles')}, indent=2), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--folder', required=True)
    parser.add_argument('--base', required=True)
    parser.add_argument('--mod', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    build(args.folder, args.base, args.mod, args.output)
