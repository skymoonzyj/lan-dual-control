@echo off
setlocal
pushd "%~dp0" >nul
node scripts\windows\start-windows-control-mac.mjs %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows control Mac entry failed with exit code %exitCode%.
  echo Try: node scripts\windows\start-windows-control-mac.mjs --dryRun --boardSummary
  echo.
  pause
)
exit /b %exitCode%