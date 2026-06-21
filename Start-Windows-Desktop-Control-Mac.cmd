@echo off
setlocal
pushd "%~dp0" >nul
node scripts\windows\start-windows-desktop-control-mac.mjs %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows desktop control entry failed with exit code %exitCode%.
  echo Try: node scripts\windows\start-windows-desktop-control-mac.mjs --dryRun --boardSummary
  echo Or build first: Build-Windows-Desktop-Control-Mac.cmd
  echo.
  pause
)
exit /b %exitCode%
