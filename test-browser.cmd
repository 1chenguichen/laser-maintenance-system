@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-product.ps1" -BrowserChecks
exit /b %errorlevel%
