param([switch]$CheckOnly,[switch]$CheckNetwork)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$projectRoot=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $projectRoot
function Run-Git([string[]]$GitArguments) {
    & git -c core.autocrlf=false @GitArguments
    if($LASTEXITCODE -ne 0){throw ('Git command failed: '+$GitArguments[0])}
}
function Run-NetworkGit([string[]]$GitArguments) {
    for($attempt=1;$attempt -le 3;$attempt++){
        & git @script:GitTransport @GitArguments
        if($LASTEXITCODE -eq 0){return}
        if($attempt -lt 3){Write-Host "GitHub connection interrupted; retry $attempt/3...";Start-Sleep -Seconds (2*$attempt)}
    }
    throw ('GitHub network command failed after 3 attempts: '+$GitArguments[0])
}
$sourceFiles=@(
 '.github/workflows/ios-trollstore.yml',
 'apps/ios-shell/Main.m',
 'apps/ios-shell/AssetServer.m',
 'scripts/ios/build-ipas.py',
 'scripts/ios/asset-server-probe.m',
 'scripts/ios/upload-github.ps1',
 'build-ios-github.cmd',
 'docs/IOS-TROLLSTORE.md',
 'apps/engineer-app-web/visual-media.css',
 'packages/iot-web/console.css',
 'apps/customer-app-web/iot/console.css',
 'apps/engineer-app-web/iot/console.css'
)
foreach($relative in $sourceFiles){if(-not(Test-Path -LiteralPath (Join-Path $projectRoot $relative))){throw "Missing source: $relative"}}
if($CheckOnly){
 Write-Host ('Source paths OK: '+$projectRoot)
 & python scripts/ios/build-ipas.py --prepare-only --output .local-preview/ios-preflight
 if($LASTEXITCODE -ne 0){throw 'Resource preflight failed.'}
 Write-Host 'Launcher preflight passed. No Git operation performed.'
 exit 0
}
$script:GitTransport=@('-c','http.sslBackend=openssl','-c','http.version=HTTP/1.1')
# Git does not automatically use the Windows Internet Settings proxy. Python's
# standard library reads those same settings; apply them to these commands only.
$proxyValue=(& python -c "import urllib.request; p=urllib.request.getproxies(); print(p.get('https',p.get('http','')))")
if($LASTEXITCODE -ne 0){throw 'Unable to read the current system proxy.'}
$proxyValue=([string]$proxyValue).Trim()
if($proxyValue){
    if($proxyValue -notmatch '^[a-zA-Z][a-zA-Z0-9+.-]*://'){$proxyValue='http://'+$proxyValue}
    $proxyUri=[Uri]$proxyValue
    Write-Host ('Using existing system proxy: '+$proxyUri.Host+':'+$proxyUri.Port)
    $script:GitTransport+=@('-c',('http.proxy='+$proxyValue))
}
if($CheckNetwork){
    Run-NetworkGit @('ls-remote','origin','refs/heads/master')
    Write-Host 'GitHub network preflight passed. Nothing uploaded.'
    exit 0
}
Write-Host 'Fetching master. If authentication opens, sign in to your own GitHub account.'
Run-NetworkGit @('fetch','origin','master')
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$branchName='codex/ios-trollstore-'+$stamp
$runtime=Join-Path $projectRoot '.local-preview'
$worktreePath=Join-Path $runtime ('ios-submit-'+$stamp)
if(Test-Path -LiteralPath $worktreePath){throw 'Build checkout already exists; retry after a few seconds.'}
Write-Host "Preparing isolated branch: $branchName"
Run-Git @('worktree','add','-b',$branchName,$worktreePath,'FETCH_HEAD')
$utf8=New-Object System.Text.UTF8Encoding($false)
foreach($relative in $sourceFiles){
 $from=Join-Path $projectRoot $relative
 $to=Join-Path $worktreePath $relative
 New-Item -ItemType Directory -Force (Split-Path $to -Parent) | Out-Null
 $content=[IO.File]::ReadAllText($from).Replace("`r`n","`n").TrimEnd([char[]]"`r`n")+"`n"
 [IO.File]::WriteAllText($to,$content,$utf8)
}
$ignorePath=Join-Path $worktreePath '.gitignore'
$ignore=[IO.File]::ReadAllText($ignorePath).Replace("`r`n","`n")
if(-not $ignore.Contains('!/scripts/ios/')){$ignore+="`n# iOS packaging source`n!/scripts/ios/`n!/scripts/ios/**`n__pycache__/`n*.py[cod]`n"}
[IO.File]::WriteAllText($ignorePath,$ignore.TrimEnd([char[]]"`r`n")+"`n",$utf8)
Push-Location $worktreePath
try{
 Write-Host 'Checking both bundled clients before upload...'
 & python scripts/ios/build-ipas.py --prepare-only --output .local-preview/ios-preflight
 if($LASTEXITCODE -ne 0){throw 'iOS resource preflight failed; nothing pushed.'}
 Run-Git (@('add','--','.gitignore')+$sourceFiles)
 Run-Git @('diff','--cached','--check')
 Write-Host 'Files in this iOS commit:'
 Run-Git @('diff','--cached','--stat')
 Run-Git @('commit','-m','feat: add two iOS TrollStore clients and macOS build workflow')
 Run-NetworkGit @('push','-u','origin','HEAD')
 $commit=(& git rev-parse HEAD).Trim()
 $record=@{branch=$branchName;commit=$commit;worktree=$worktreePath;actions='https://github.com/1chenguichen/laser-maintenance-system/actions/workflows/ios-trollstore.yml';submittedAt=(Get-Date).ToString('o')}
 $record|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $runtime 'ios-submission.json') -Encoding UTF8
 Write-Host ''
 Write-Host 'Upload complete. GitHub macOS build should start automatically.'
 Write-Host ('Branch: '+$branchName)
 Write-Host ('Commit: '+$commit)
 Write-Host $record.actions
 Write-Host 'After success, download the ios-trollstore-ipas artifact. Real-device testing remains pending.'
}finally{Pop-Location}
