"""Compare the private exported ZIP against original, unmodified retail files."""
import hashlib,json,pathlib,zipfile
original=pathlib.Path(r'C:\Program Files (x86)\DODI-Repacks\Generals Zero Hour\Data')
files={p.name.lower():p for p in original.rglob('*.big')}
report_path=pathlib.Path('.local/backup-verification.json')
report=json.loads(report_path.read_text())
def digest(stream):
    value=hashlib.sha256()
    for chunk in iter(lambda:stream.read(4*1024*1024),b''):value.update(chunk)
    return value.hexdigest()
with zipfile.ZipFile('.local/backup/Zero-Hour-backup.zip') as archive:
    entries=archive.infolist()
    assert len(entries)==17, 'Expected all 17 compatible archives'
    for entry in entries:
        assert entry.filename.lower() in files, 'Unexpected exported archive'
        with archive.open(entry) as exported,files[entry.filename.lower()].open('rb') as source:
            assert digest(exported)==digest(source), 'Exported bytes differ: '+entry.filename
report['checks'].append('All 17 ZIP entries pass CRC validation and match original file SHA-256 byte-for-byte')
report['status']='passed'
report_path.write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
