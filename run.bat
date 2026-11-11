@echo off
setlocal
cd /d "%~dp0"
title TELKOM AKSES Server

if not exist node_modules (
  echo Memasang dependency...
  call npm install
  if errorlevel 1 exit /b 1
)

node server.js --open
if errorlevel 1 pause
endlocal
