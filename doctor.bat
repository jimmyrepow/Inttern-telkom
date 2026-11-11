@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Memasang dependency...
  call npm install
  if errorlevel 1 exit /b 1
)

call npm run doctor
endlocal
