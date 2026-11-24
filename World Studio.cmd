@echo off
pwsh.exe -NoProfile -File "%~dp0scripts\Start-Client.ps1" -WithChat
if errorlevel 1 pause
