@echo off
setlocal
cd /d "%~dp0"
echo Downloading DelDOT bridges (BRIDGE_NO + GPS) from FirstMap...
python download-deldot-bridges.py
if errorlevel 1 (
  echo FAILED — need Python 3 and internet access to FirstMap.
  pause
  exit /b 1
)
echo.
echo Done. Re-open / Reload refs in GeoTrak, then Markers → Show DelDOT bridges.
pause
