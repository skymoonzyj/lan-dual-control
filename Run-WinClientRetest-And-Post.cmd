@echo off
setlocal
pushd "%~dp0" >nul
node scripts\windows\run-winclient-retest-and-post.mjs %*
set "exitCode=%ERRORLEVEL%"
popd >nul
if not "%exitCode%"=="0" (
  echo.
  echo Windows client retest-and-post failed with exit code %exitCode%.
  echo Try: Run-WinClientRetest.cmd first, then post W2W3Retest with scripts\windows\post-w2w3-retest-board.mjs.
  echo.
  pause
)
exit /b %exitCode%