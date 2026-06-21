@echo off
setlocal
pushd "%~dp0" >nul
node scripts\windows\start-windows-desktop-control-mac.mjs --build --noOpen %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows desktop build entry failed with exit code %exitCode%.
  echo Try: cd apps\windows-desktop ^&^& npm.cmd run build
  echo.
  pause
)
exit /b %exitCode%
