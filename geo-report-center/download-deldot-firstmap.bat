@echo off
setlocal
cd /d "%~dp0"
echo ============================================================
echo  DelDOT FirstMap pack → refs\deldot_firstmap\
echo  Default: layers ≤50k features (skips Street View + huge roads)
echo  Options: --full   or   --street-view
echo ============================================================
python download-deldot-firstmap.py %*
if errorlevel 1 (
  echo FAILED — need Python 3 + internet to FirstMap.
  pause
  exit /b 1
)
echo.
echo Re-open / Reload refs in GeoTrak, then toggle layers under Layers.
pause
