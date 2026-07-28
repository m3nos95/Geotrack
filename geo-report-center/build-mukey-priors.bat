@echo off
REM Build refs\mukey_priors.json analogs from feature-store.csv (statewide Step 2).

cd /d "%~dp0"

if not exist "feature-store.csv" (
  echo Missing feature-store.csv in:
  echo   %CD%
  echo.
  echo Export it from GeoTrak ^(Reference data → Export feature store^)
  echo or run build-feature-store.bat first.
  echo.
  pause
  exit /b 1
)

if not exist "refs" mkdir refs

python "%~dp0build-mukey-priors.py" . --csv feature-store.csv --out refs\mukey_priors.json
if errorlevel 1 (
  echo.
  echo build-mukey-priors failed.
  pause
  exit /b 1
)

echo.
echo Done. Re-open the project folder in GeoTrak so mukey_priors.json loads.
pause
