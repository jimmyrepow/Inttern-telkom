@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Memasang dependency...
  call npm install
  if errorlevel 1 exit /b 1
)

echo.
echo === Migrasi skema ===
call npm run migrate
if errorlevel 1 exit /b 1

echo.
echo === Seed akun awal ===
call npm run seed
if errorlevel 1 exit /b 1

echo.
echo === Pemeriksaan sistem ===
call npm run doctor

endlocal
