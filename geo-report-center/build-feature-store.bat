@echo off
REM Build feature-store.csv/json from db.json + refs\ (geology, soils, recharge, lab, screening infil).

cd /d "%~dp0"
if not exist "%~dp0db.json" (
  echo Missing db.json in:
  echo   %~dp0
  pause
  exit /b 1
)

python "%~dp0build-feature-store.py" "%~dp0"
echo.
echo Open feature-store.csv in Excel. Re-open the app folder if you also want map-click infil estimates (v0.8 HTML).
pause
