@echo off
chcp 65001 >nul
title Ke Toan Cong Trinh - Phan mem ke toan
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
rem Du lieu luu bang SQLite co san trong Node.js: can Node 24.16.0 tro len (dong 24) hoac 26.1.0 tro len.
rem Ban cu hon co loi cat mat chu sau ky tu NUL khi ghi vao SQLite (dong 25 va 26.0 cung khong dung duoc).
for /f "delims=" %%v in ('node -v') do set NODEV=%%v
node -e "process.exit(require('./lib/node-version').nodeOk(process.versions.node)?0:1)" >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js tren may la ban %NODEV% - khong dung duoc voi phan mem nay.
  echo   Phan mem can Node.js 24.16.0 tro len ^(ban LTS dong 24^) hoac 26.1.0 tro len.
  echo   Cach sua: vao https://nodejs.org , tai ban "LTS" ^(Windows Installer .msi^),
  echo   cai dat ^(bam Next den het^), roi bam dup lai file KhoiDong.bat nay.
  echo   Du lieu cua ban trong thu muc data khong bi anh huong.
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
