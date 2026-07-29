@echo off
cd /d "%~dp0"
python download-nrcs-soil-props.py %*
if errorlevel 1 pause
