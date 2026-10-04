"""Private, checksum-verified source/build restore point. No browser data or retail files."""
import datetime, hashlib, json, pathlib, subprocess, zipfile

root = pathlib.Path(__file__).resolve().parents[1]
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
destination = root / 'output' / 'backups' / f'Zero-Hour-Web-v1.0.0-{stamp}'
destination.mkdir(parents=True, exist_ok=False)
names = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=root).decode().split('\0')
files = [root / n for n in names if n and (root / n).is_file()]
files += [p for p in (root / 'release').rglob('*') if p.is_file()]
manifest = []
archive = destination / 'Zero-Hour-Web-v1.0.0.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as output:
    for file in sorted(set(files)):
        name = file.relative_to(root).as_posix()
        if file.suffix.lower() in {'.big', '.bik', '.mix', '.sav', '.rep', '.exe', '.dll'} or any(part in {'.local', '.git', 'node_modules', 'output'} for part in file.relative_to(root).parts) or file.name.startswith('.env'):
            raise RuntimeError(f'Excluded private file: {name}')
        digest = hashlib.file_digest(file.open('rb'), 'sha256').hexdigest()
        output.write(file, name)
        manifest.append({'path': name, 'bytes': file.stat().st_size, 'sha256': digest})
with zipfile.ZipFile(archive) as backup:
    if backup.testzip():
        raise RuntimeError('ZIP CRC check failed')
    for item in manifest:
        with backup.open(item['path']) as file:
            if hashlib.file_digest(file, 'sha256').hexdigest() != item['sha256']:
                raise RuntimeError(f"Restored checksum differs: {item['path']}")
subprocess.run(['git', 'bundle', 'create', str(destination / 'history.bundle'), '--all'], cwd=root, check=True)
subprocess.run(['git', 'bundle', 'verify', str(destination / 'history.bundle')], cwd=root, check=True)
report = {'version': '1.0.0', 'createdAt': stamp, 'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip(), 'workingChanges': subprocess.check_output(['git', 'status', '--short'], cwd=root).decode(), 'archive': str(archive), 'archiveSha256': hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest(), 'verification': 'All ZIP entries passed CRC and restored SHA-256; Git bundle verified.', 'files': manifest}
(destination / 'manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
(destination / 'RESTORE.txt').write_text('Version 1.0.0 restore point\n\nExtract Zero-Hour-Web-v1.0.0.zip into a NEW folder. It preserves the actual working source including uncommitted guides, plus release/site. Run npm ci then npm start, or serve release/site with isolation headers. Git history is in history.bundle; git clone history.bundle recovered-history restores committed history separately. Overlay the ZIP for the exact working snapshot.\n\nBrowser libraries, saves, retail files and credentials are excluded. Export the game library from the website separately.\n', encoding='utf-8')
print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))
