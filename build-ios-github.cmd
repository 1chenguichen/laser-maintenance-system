@echo off
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ios\upload-github.ps1" %*
if errorlevel 1 echo Upload failed. Copy the last error message so it can be fixed.
pause
