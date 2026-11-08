@echo off
setlocal
cd /d "%~dp0"
set "BROWSER_EXE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%BROWSER_EXE%" (
  echo Microsoft Edge was not found.
  exit /b 1
)
"%BROWSER_EXE%" --remote-debugging-address=127.0.0.1 --remote-debugging-port=9324 --user-data-dir="%~dp0.local-preview\browser-check-profile" --no-first-run --no-default-browser-check http://localhost:3100/
endlocal
