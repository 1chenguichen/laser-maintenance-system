"""Prepare/build ordinary-sandbox arm64 iOS shells for TrollStore testing.
No Apple account, certificate, private entitlement, Flutter or CocoaPods is used.
Actual compilation must run on macOS with the iPhoneOS SDK.
"""
import argparse,hashlib,ipaddress,json,math,os,pathlib,plistlib,posixpath,re,shutil,struct,subprocess,sys,urllib.parse,zipfile,zlib
root=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--server',default=os.environ.get('BACKEND_URL','http://192.168.0.100:8180'));p.add_argument('--prepare-only',action='store_true');p.add_argument('--output',default='outputs/ios');a=p.parse_args()
u=urllib.parse.urlsplit(a.server)
if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('','/'):raise SystemExit('Provide a backend root URL without credentials or path')
if u.scheme=='http':
 try:ip=ipaddress.IPv4Address(u.hostname)
 except ValueError:raise SystemExit('LAN HTTP requires a private IPv4 address')
 if not any(ip in ipaddress.ip_network(n) for n in ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16']):raise SystemExit('LAN HTTP requires RFC1918 IPv4')
elif u.scheme!='https':raise SystemExit('Use LAN HTTP or public HTTPS')
if u.port is not None and not 1<=u.port<=65535:raise SystemExit('Invalid port')
server=a.server.rstrip('/')
out=(root/a.output).resolve()
if not any(out.is_relative_to(root/f) for f in ['outputs','.local-preview']):raise SystemExit('Build outputs must stay under outputs/ or .local-preview/')
out.mkdir(parents=True,exist_ok=True)
version=os.environ.get('GITHUB_RUN_NUMBER','1')
if not version.isdigit():raise SystemExit('Build number must be numeric')
def run(*cmd):
 result=subprocess.run([str(x) for x in cmd],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 print(result.stdout,flush=True)
 if result.returncode:
  # Expose the actual compiler/probe error through the public check annotation,
  # so a failed build can be diagnosed without asking for authenticated job logs.
  detail=result.stdout[-10000:].replace('%','%25').replace('\r','%0D').replace('\n','%0A')
  if os.environ.get('GITHUB_ACTIONS')=='true':print('::error title=iOS build command failed::'+detail,flush=True)
  raise SystemExit('Build failed: '+str(cmd[0]))
 return result.stdout.strip()
def icon(path,size,base):
 # Code-native rendering of the existing equipment-service brand mark.
 segments=[(14,15,14,33),(14,33,33,33),(34,13,24,24),(24,19,24,29),(19,24,29,24)]
 def distance(x,y,line):
  x1,y1,x2,y2=line;dx=x2-x1;dy=y2-y1;t=max(0,min(1,((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy)));return math.hypot(x-x1-t*dx,y-y1-t*dy)
 rows=[]
 for y in range(size):
  row=bytearray([0])
  for x in range(size):
   px=(x+.5)*48/size;py=(y+.5)*48/size
   d=min(distance(px,py,s) for s in segments);coverage=max(0,min(1,(1.7-d)*size/48+.5))
   shade=1.08-.16*y/size
   row.extend(round(min(255,c*shade)*(1-coverage)+255*coverage) for c in base)
  rows.append(bytes(row))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b''))
if not a.prepare_only:
 if sys.platform!='darwin':raise SystemExit('Use --prepare-only on Windows; actual IPA compilation runs in GitHub macOS Actions.')
 sdk=run('xcrun','--sdk','iphoneos','--show-sdk-path').splitlines()[-1]
 sdkversion=run('xcrun','--sdk','iphoneos','--show-sdk-version').splitlines()[-1]
 probe=out/'asset-server-probe'
 run('xcrun','--sdk','macosx','clang','-fobjc-arc','-fblocks','-fmodules','-framework','Foundation',root/'scripts/ios/asset-server-probe.m','-o',probe)
reports=[]
for role,name,label,color in [('customer','LaserCustomer','激光设备服务',(25,107,225)),('engineer','LaserEngineer','激光工程师',(20,119,91))]:
 work=out/('build-'+role)
 if work.exists():
  if work.resolve().parent!=out:raise SystemExit('Unsafe generated build directory')
  shutil.rmtree(work)
 app=work/'Payload'/(name+'.app');web=app/'web';web.mkdir(parents=True)
 source=root/('apps/'+role+'-app-web')
 for f in source.rglob('*'):
  if not f.is_file() or f.suffix.lower() not in {'.html','.js','.css','.json','.woff','.woff2','.png','.jpg','.jpeg','.webp','.svg','.ico'} or f.name=='server.js' or any(x in f.parts for x in ['node_modules','备份']):continue
  target=web/f.relative_to(source);target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,target)
 market=web/'market-ui.js';text=market.read_text(encoding='utf-8')
 old='\'<p>审核已通过，可前往工程师端使用同一手机号登录。</p><a class="market-primary" href="http://\' +\n            location.hostname +\n            \':3102/login.html">进入工程师端</a>\''
 market.write_text(text.replace(old,'\'<p>审核已通过，请打开单独安装的“激光工程师”App，使用同一手机号登录。</p>\''),encoding='utf-8')
 for filename,size in [('Icon60@2x.png',120),('Icon60@3x.png',180),('Icon76.png',76),('Icon76@2x.png',152),('Icon83.5@2x.png',167)]:icon(app/filename,size,color)
 info={
  'CFBundleIdentifier':'com.laser.maintenance.'+role,'CFBundleExecutable':name,'CFBundleName':name,'CFBundleDisplayName':label,
  'CFBundlePackageType':'APPL','CFBundleShortVersionString':'2.0.0','CFBundleVersion':version,
  'CFBundleSupportedPlatforms':['iPhoneOS'],'LSRequiresIPhoneOS':True,'MinimumOSVersion':'14.0','UIDeviceFamily':[1,2],
  'UILaunchScreen':{},'UIViewControllerBasedStatusBarAppearance':True,'UIRequiresFullScreen':True,
  'UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait'],
  'NSCameraUsageDescription':'用于扫描设备二维码，识别设备档案与售后服务企业。',
  'NSPhotoLibraryUsageDescription':'用于选择故障或维修照片，补充服务记录。',
  'NSLocalNetworkUsageDescription':'用于连接同一局域网内电脑运行的售后系统后端，读取和提交业务数据。',
  'NSAppTransportSecurity':{'NSAllowsArbitraryLoads':True,'NSAllowsArbitraryLoadsInWebContent':True,'NSAllowsLocalNetworking':True},
  'CFBundleIcons':{'CFBundlePrimaryIcon':{'CFBundleIconFiles':['Icon60']}},
  'CFBundleIcons~ipad':{'CFBundlePrimaryIcon':{'CFBundleIconFiles':['Icon76','Icon83.5']}},
  'LaserDefaultServer':server,'LaserLocalPort':43102 if role=='engineer' else 43101
 }
 with (app/'Info.plist').open('wb') as f:plistlib.dump(info,f)
 (app/'PkgInfo').write_bytes(b'APPL????')
 # Validate root-relative and relative references before spending cloud build time.
 missing=[]
 for html in web.rglob('*.html'):
  for ref in re.findall(r'(?:src|href)=[\"\']([^\"\']+)',html.read_text(encoding='utf-8-sig')):
   if re.match(r'^(?:https?:|//|data:|#|javascript:|mailto:|tel:)',ref):continue
   clean=ref.split('?')[0].split('#')[0]
   if not clean:continue
   dest=web/clean.lstrip('/') if clean.startswith('/') else html.parent/clean
   if not dest.is_file():missing.append({'page':str(html.relative_to(web)),'reference':ref})
 if missing:raise SystemExit('Missing bundled references: '+json.dumps(missing,ensure_ascii=False))
 report={'role':role,'bundleIdentifier':info['CFBundleIdentifier'],'defaultBackend':server,'minimumIOS':'14.0','build':version,'bundledFiles':sum(1 for x in web.rglob('*') if x.is_file()),'missingReferences':missing,'compiled':False,'deviceTest':'pending','installation':'TrollStore only; not App Store or ordinary sideload signing'}
 if not a.prepare_only:
  nativecheck=run(probe,web)
  (out/(role+'-asset-server-test.json')).write_text(nativecheck+'\n',encoding='utf-8')
  report['nativeAssetServerTest']='passed'
  run('xcrun','--sdk','iphoneos','clang','-arch','arm64','-isysroot',sdk,'-miphoneos-version-min=14.0','-fobjc-arc','-fblocks','-fmodules','-O2','-Wno-deprecated-declarations',root/'apps/ios-shell/Main.m','-framework','UIKit','-framework','Foundation','-framework','WebKit','-framework','AVFoundation','-framework','QuartzCore','-o',app/name)
  (app/name).chmod(0o755)
  with (work/'Entitlements.plist').open('wb') as f:plistlib.dump({},f)
  run('codesign','--force','--sign','-','--timestamp=none','--entitlements',work/'Entitlements.plist',app)
  run('codesign','--verify','--deep','--strict','--verbose=2',app)
  binary=run('file',app/name)
  if 'arm64' not in binary or 'Mach-O' not in binary:raise SystemExit('Expected arm64 iOS executable')
  run('xcrun','vtool','-show-build',app/name)
  ipa=out/('laser-'+role+'-2.0.0-trollstore.ipa')
  with zipfile.ZipFile(ipa,'w',compression=zipfile.ZIP_DEFLATED) as z:
   for f in app.rglob('*'):
    if f.is_file():z.write(f,f.relative_to(work).as_posix())
  with zipfile.ZipFile(ipa) as z:
   assert z.testzip() is None
   assert 'Payload/'+name+'.app/'+name in z.namelist()
   assert 'Payload/'+name+'.app/_CodeSignature/CodeResources' in z.namelist()
  report.update(compiled=True,sdk=sdkversion,ipa=ipa.name,bytes=ipa.stat().st_size,sha256=hashlib.sha256(ipa.read_bytes()).hexdigest())
 reports.append(report);print(json.dumps(report,ensure_ascii=False),flush=True)
(out/'build-report.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
if not a.prepare_only:shutil.copyfile(root/'docs/IOS-TROLLSTORE.md',out/'INSTALL.md')
print('Prepared only; no IPA compiled.' if a.prepare_only else 'Two IPA files built and locally ad-hoc signed for TrollStore testing.',flush=True)
