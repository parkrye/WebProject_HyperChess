@echo off
chcp 65001 > nul
cd /d "%~dp0"
title HyperChess 평가 가중치 튜닝

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

echo 밸런스 측정 보고서를 기록으로 가져옵니다...
call "node_modules\.bin\tsx.cmd" "packages\server\tools\import-reports.ts"
echo.
call "node_modules\.bin\tsx.cmd" "packages\ai\tools\tune.ts" %*
echo.
pause
