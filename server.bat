@echo off
chcp 65001 > nul
cd /d "%~dp0"
title HyperChess 서버

where node > nul 2> nul
if errorlevel 1 (
  echo Node.js 22 이상이 필요합니다: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo 의존성을 설치합니다...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo 클라이언트를 빌드합니다...
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo 서버를 종료하려면 이 창을 닫거나 Ctrl+C 를 누르세요.
call npm run start -w @hyperchess/server
echo.
pause
