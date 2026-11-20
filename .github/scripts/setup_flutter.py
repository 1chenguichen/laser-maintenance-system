import hashlib,json,os,pathlib,platform,subprocess,urllib.request
version='3.50.1'
system='macos' if platform.system()=='Darwin' else 'linux'
arch='arm64' if platform.machine() in ('arm64','aarch64') else 'x64'
base='https://storage.googleapis.com/flutter_infra_release/releases/'
with urllib.request.urlopen(base+'releases_'+system+'.json') as response:meta=json.load(response)
release=next(r for r in meta['releases'] if r['version']==version and r['channel']=='stable' and r.get('dart_sdk_arch','x64')==arch)
root=pathlib.Path(os.environ['RUNNER_TEMP'])/'zhixiugong-flutter';root.mkdir(exist_ok=True)
archive=root/pathlib.Path(release['archive']).name
urllib.request.urlretrieve(base+release['archive'],archive)
hash=hashlib.sha256()
with archive.open('rb') as source:
 for chunk in iter(lambda:source.read(1048576),b''):hash.update(chunk)
if hash.hexdigest()!=release['sha256']:raise SystemExit('Flutter SDK checksum mismatch')
subprocess.run(['unzip','-q',str(archive),'-d',str(root)] if system=='macos' else ['tar','-xf',str(archive),'-C',str(root)],check=True)
with open(os.environ['GITHUB_PATH'],'a') as f:f.write(str(root/'flutter/bin')+'\n')
