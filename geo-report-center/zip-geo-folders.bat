@echo off
REM Zip unpacked GEOSYSTEM *.GEO folders in geo-zips\ and delete the folders.
REM Then run import-geo-zips.bat to load into db.json.

set GEO_ZIPS=%~dp0geo-zips

if not exist "%GEO_ZIPS%" (
  echo Creating geo-zips folder:
  echo   %GEO_ZIPS%
  mkdir "%GEO_ZIPS%"
)

python "%~dp0zip-geo-folders.py" "%GEO_ZIPS%"
pause
