@echo off
setlocal
title Gecko for Antigravity - Windows Companion Setup
echo ==================================================
echo   Gecko for Antigravity - Windows Companion Setup
echo ==================================================
echo.

set "EXT_ID=%~1"
:ask_id
if "%EXT_ID%"=="" (
  echo Mo Chrome -^> chrome://extensions -^> sao chep Extension ID cua Gecko for Antigravity (32 chu cai).
  set /p "EXT_ID=Dan Extension ID vao day: "
  if "%EXT_ID%"=="" goto ask_id
)

set "EXTRA_ARGS=--mcp"
where agy >nul 2>&1
if errorlevel 1 (
  echo.
  echo Khong thay lenh 'agy' CLI tren may nay.
  set /p "USE_SDK=Ban co muon cai them Antigravity Python SDK de dung Side Panel khong? [Y/n]: "
  if /i not "%USE_SDK%"=="n" set "EXTRA_ARGS=--mcp --sdk"
)

echo.
echo Dang cai dat companion...
python "%~dp0install_host.py" --extension-id "%EXT_ID%" --browser all %EXTRA_ARGS%
if errorlevel 1 (
  echo.
  echo Cai dat that bai. Kiem tra Python 3.10+ da cai va co ket noi Internet.
  pause
  exit /b 1
)

echo.
echo Hoan tat! Quay lai Chrome Side Panel, ket noi se tu dong chuyen sang trang thai San sang.
pause
