@echo off
chcp 65001 > nul
cd /d "%~dp0"
title HyperChess 밸런스 측정

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

call "node_modules\.bin\tsx.cmd" "packages\ai\tools\balance.ts" %*
echo.
pause
