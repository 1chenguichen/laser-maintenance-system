@echo off
cd /d "%~dp0"
node scripts\check-iot.mjs
if errorlevel 1 pause
