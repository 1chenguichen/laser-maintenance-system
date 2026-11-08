param([switch]$BrowserChecks)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$nodePath=(Get-Command node.exe).Source
$runtime=Join-Path $projectRoot '.local-preview'
New-Item -ItemType Directory -Force $runtime | Out-Null
$probe=New-Object System.Net.Sockets.TcpClient
$inUse=$false
try{$probe.Connect('127.0.0.1',8280);$inUse=$probe.Connected}catch{}finally{$probe.Dispose()}
if($inUse){throw 'Audit port 8280 is in use; stop the existing audit server first.'}
& $nodePath backend/node_modules/typescript/bin/tsc -p backend/tsconfig.build.json
if($LASTEXITCODE -ne 0){throw 'Backend type check failed'}
& $nodePath apps/cs-admin/node_modules/typescript/bin/tsc --noEmit -p apps/cs-admin/tsconfig.json
if($LASTEXITCODE -ne 0){throw 'Admin type check failed'}
& $nodePath scripts/prepare-audit-db.mjs
if($LASTEXITCODE -ne 0){throw 'Audit database setup failed'}
$env:DB_DATABASE='laser_audit_20261025'
& $nodePath scripts/tenant-admin.mjs ensure-demo audit-alpha 'Audit Alpha' 13800138000 --demo
if($LASTEXITCODE -ne 0){throw 'Tenant alpha setup failed'}
& $nodePath scripts/tenant-admin.mjs ensure-demo audit-beta 'Audit Beta' 13800138000 --demo
if($LASTEXITCODE -ne 0){throw 'Tenant beta setup failed'}
$env:PORT='8280'
$env:NODE_ENV='development'
$env:DIFY_API_KEY=''
$env:TEST_API_BASE='http://127.0.0.1:8280'
$backendProcess=Start-Process $nodePath -ArgumentList 'dist/main.js' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput "$runtime/audit.log" -RedirectStandardError "$runtime/audit.err.log" -PassThru
$resultCode=1
try{
 $ready=$false
 foreach($attempt in 1..60){try{$null=Invoke-WebRequest 'http://localhost:8280/' -UseBasicParsing -TimeoutSec 1;$ready=$true;break}catch{Start-Sleep -Milliseconds 300}}
 if(-not $ready){throw "Audit backend failed; see $runtime/audit.err.log"}
 & $nodePath backend/test/unified-identity.mjs
 $resultCode=$LASTEXITCODE
 if($resultCode -eq 0){
  & $nodePath backend/test/platform-smoke.mjs
  $resultCode=$LASTEXITCODE
 }
 if($resultCode -eq 0){
  & $nodePath backend/test/product-smoke.mjs
  $resultCode=$LASTEXITCODE
 }
 if($resultCode -eq 0){
  & $nodePath backend/test/operations-smoke.mjs
  $resultCode=$LASTEXITCODE
 }
 if($resultCode -eq 0){
  & $nodePath backend/test/tenant-isolation.mjs
  $resultCode=$LASTEXITCODE
 }
 if($resultCode -eq 0 -and $BrowserChecks){
  & $nodePath backend/test/product-browser.cjs
  $resultCode=$LASTEXITCODE
  if($resultCode -eq 0){
   & $nodePath backend/test/operations-browser.cjs
   $resultCode=$LASTEXITCODE
  }
  if($resultCode -eq 0){
   & $nodePath backend/test/platform-browser.cjs
   $resultCode=$LASTEXITCODE
  }
  if($resultCode -eq 0){
   & $nodePath backend/test/unified-browser.cjs
   $resultCode=$LASTEXITCODE
  }
 }
}finally{if(-not $backendProcess.HasExited){Stop-Process -Id $backendProcess.Id}}
exit $resultCode
