"""Keep all browser engine/build sources; exclude unused Windows binaries."""
import hashlib, io, json, pathlib, zipfile
root = pathlib.Path(__file__).resolve().parent.parent
directory = root / 'public/source'
paths = [directory / f'NewShoes-source.zip.part0{i}' for i in (1, 2)]
original = b''.join(p.read_bytes() for p in paths)
archive = zipfile.ZipFile(io.BytesIO(original))
excluded = [n for n in archive.namelist() if n.lower().endswith(('.exe', '.dll'))]
if not excluded:
    raise SystemExit('Source already has no Windows binaries; no rewrite needed.')
output = io.BytesIO()
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as clean:
    for entry in archive.infolist():
        if entry.filename not in excluded:
            clean.writestr(entry, archive.read(entry), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
filtered = output.getvalue()
split = (len(filtered) + 1) // 2
paths[0].write_bytes(filtered[:split]); paths[1].write_bytes(filtered[split:])
manifest_path = root / 'docs/foundation-manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8-sig'))
manifest['sourceArchive'] = {'originalSha256': hashlib.sha256(original).hexdigest(),
    'publishedSha256': hashlib.sha256(filtered).hexdigest(), 'excludedWindowsBinaries': excluded,
    'reason': 'Unused Windows DLLs and legacy shader compiler; no browser build source removed.'}
for item in manifest['files']:
    for p in paths:
        if item['path'] == f'source/{p.name}':
            item['publishedSha256'] = hashlib.sha256(p.read_bytes()).hexdigest()
            item['publishedBytes'] = p.stat().st_size
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
for name in ['public/source/index.html', 'Dockerfile']:
    p = root / name
    p.write_text(p.read_text(encoding='utf-8').replace(hashlib.sha256(original).hexdigest(), hashlib.sha256(filtered).hexdigest()).replace('Original ZIP SHA-256:', 'Published source ZIP SHA-256:'), encoding='utf-8')
print(f'Preserved {len(archive.namelist())-len(excluded)} source entries; excluded {len(excluded)} unused Windows binaries.')
