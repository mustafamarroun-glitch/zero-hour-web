"""Extract the pinned engine source on Linux, preserving case and symlinks."""
import pathlib,zipfile,os,stat,subprocess,sys
archive_path,patch_path,output_path=map(pathlib.Path,sys.argv[1:4])
output_path.mkdir(parents=True,exist_ok=True)
destination=output_path.resolve()
links=[]
with zipfile.ZipFile(archive_path) as archive:
    for item in archive.infolist():
        path=pathlib.PurePosixPath(item.filename)
        if path.is_absolute() or '..' in path.parts or path.parts[0]!='NewShoes-main':
            raise ValueError('Unsafe archive path: '+item.filename)
        target=destination.joinpath(*path.parts)
        mode=item.external_attr>>16
        if stat.S_ISLNK(mode):
            links.append((target,archive.read(item).decode()));continue
        if item.is_dir():target.mkdir(parents=True,exist_ok=True);continue
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(archive.read(item))
        if mode:target.chmod(mode & 0o777)
for target,link in links:
    resolved=(target.parent/link).resolve()
    if os.path.commonpath([str(resolved),str(destination)])!=str(destination):raise ValueError('Unsafe symlink: '+str(target))
    target.parent.mkdir(parents=True,exist_ok=True)
    os.symlink(link,target)
source=destination/'NewShoes-main'
subprocess.run(['git','apply','--check',str(patch_path.resolve())],cwd=source,check=True)
subprocess.run(['git','apply',str(patch_path.resolve())],cwd=source,check=True)
print('Prepared engine source:',source)
