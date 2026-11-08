$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$nodePath=(Get-Command node.exe).Source
$runtime=Join-Path $projectRoot '.local-preview'
New-Item -ItemType Directory -Force $runtime | Out-Null
foreach($port in 3100,3101,3102,3103,8180){
 $probe=New-Object System.Net.Sockets.TcpClient
 $inUse=$false
 try{$probe.Connect('127.0.0.1',$port);$inUse=$probe.Connected}catch{}finally{$probe.Dispose()}
 if($inUse){throw "Port $port is in use. Stop the existing preview first."}
}
if(-not (Test-Path (Join-Path $runtime 'platform-credentials.json'))){
 & $nodePath scripts/platform-setup.mjs
 if($LASTEXITCODE -ne 0){throw 'Platform setup failed'}
}
& $nodePath scripts/build-iot-web.mjs
if($LASTEXITCODE -ne 0){throw 'IoT UI build failed'}
& $nodePath backend/node_modules/typescript/bin/tsc -p backend/tsconfig.build.json
if($LASTEXITCODE -ne 0){throw 'Backend type check failed'}
& $nodePath apps/cs-admin/node_modules/typescript/bin/tsc --noEmit -p apps/cs-admin/tsconfig.json
if($LASTEXITCODE -ne 0){throw 'Admin type check failed'}
$env:NODE_ENV='production'
$env:PORT='8180'
$databaseFile=Join-Path $runtime 'database.txt'
if(Test-Path $databaseFile){
 $databaseName=(Get-Content $databaseFile -Raw).Trim()
 if($databaseName -notmatch '^laser_[a-z0-9_]+$'){throw 'Invalid preview database name'}
 $env:DB_DATABASE=$databaseName
}
$env:REACT_APP_API_BASE='http://localhost:8180'
$backendProcess=Start-Process $nodePath -ArgumentList 'dist/main.js' -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -RedirectStandardOutput "$runtime/backend.log" -RedirectStandardError "$runtime/backend.err.log" -PassThru
$ready=$false
foreach($attempt in 1..30){try{$null=Invoke-WebRequest 'http://localhost:8180/' -UseBasicParsing -TimeoutSec 1;$ready=$true;break}catch{Start-Sleep -Milliseconds 300}}
if(-not $ready){if(-not $backendProcess.HasExited){Stop-Process -Id $backendProcess.Id};throw "Backend failed; check $runtime/backend.err.log. Make sure PostgreSQL and Redis are running."}
$webProcess=Start-Process $nodePath -ArgumentList 'scripts/web-preview.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput "$runtime/web.log" -RedirectStandardError "$runtime/web.err.log" -PassThru
$adminProcess=Start-Process $nodePath -ArgumentList 'scripts/admin-preview.cjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput "$runtime/admin.log" -RedirectStandardError "$runtime/admin.err.log" -PassThru
@{backend=$backendProcess.Id;web=$webProcess.Id;admin=$adminProcess.Id}|ConvertTo-Json|Set-Content "$runtime/pids.json"
Write-Output 'Preview started: admin http://localhost:3100, customer http://localhost:3101, engineer http://localhost:3102, platform http://localhost:3103'
