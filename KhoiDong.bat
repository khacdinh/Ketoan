@echo off
chcp 65001 >nul
title So Thu Chi - Phan mem ke toan
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   May chua cai Node.js - phan mem can Node.js de chay.
  echo   Hay cai ban LTS tai https://nodejs.org roi bam dup lai file nay.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])<18?1:0)" >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js tren may qua cu - phan mem can Node.js 18 tro len.
  echo   Hay cai ban LTS moi tai https://nodejs.org roi bam dup lai file nay.
  echo.
  start "" "https://nodejs.org"
  pause
  exit /b 1
)
if not exist "node_modules\exceljs\package.json" (
  echo   Dang cai thu vien lan dau, vui long cho...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo   Cai thu vien that bai. Kiem tra ket noi mang roi chay lai.
    pause
    exit /b 1
  )
)
node server.js
if errorlevel 1 pause
