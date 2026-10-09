"""Compress the already-built static site for upload; verify every manifest entry."""
import hashlib
import json
import argparse
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
if not version or any(c not in '0123456789abcdefghijklmnopqrstuvwxyz.-' for c in version):
    raise ValueError('Invalid version')
records = json.loads((root / 'release/manifest.json').read_text())['files']
site = root / 'release/site'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', help='A new destination directory; existing packages are never overwritten.')
args = parser.parse_args()
destination = Path(args.output).resolve() if args.output else root / 'output/releases' / ('v' + version)
destination.mkdir(parents=True, exist_ok=False)
archive = destination / f'Zero-Hour-Web-{version}-site.zip'
with zipfile.ZipFile(archive, 'x', zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as output:
    for record in records:
        name = record['name']
        path = site / name
        if not path.resolve().is_relative_to(site.resolve()) or path.suffix.lower() in {'.big', '.gib', '.ani', '.exe', '.dll', '.bik', '.sav', '.rep', '.mix'}:
            raise ValueError(f'Unsafe publication entry: {name}')
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        if digest != record['sha256'] or path.stat().st_size != record['bytes']:
            raise ValueError(f'Built asset changed: {name}')
        output.write(path, name)
with zipfile.ZipFile(archive) as saved:
    if len(saved.infolist()) != len(records):
        raise ValueError('ZIP inventory differs')
    for record in records:
        with saved.open(record['name']) as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != record['sha256']:
                raise ValueError(f"Restored asset changed: {record['name']}")
with archive.open('rb') as stream:
    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
(destination / (archive.name + '.sha256')).write_text(digest + '  ' + archive.name + '\n')
report = {'version': version, 'archive': str(archive), 'archiveBytes': archive.stat().st_size,
          'expandedBytes': sum(r['bytes'] for r in records), 'files': len(records), 'sha256': digest,
          'verification': 'Every published file matches the build manifest and passes ZIP CRC and restored SHA-256. Player-owned game assets are excluded.'}
(destination / 'site-package.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
