@echo off
chcp 65001 > nul
cd /d "%~dp0"
title HyperChess 능력별 학습

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

echo 대국 수집 - 기록 반영 - 학습 - 적용을 반복합니다. 멈추려면 Ctrl+C 또는 창을 닫으세요.
echo 진행 기록: reports\learn-log.md
echo.
call "node_modules\.bin\tsx.cmd" "packages\ai\tools\learn.ts" %*
echo.
pause
