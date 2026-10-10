@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Cai tro ly AI cho Claude Desktop (chi XEM so lieu, khong sua). Go bo: CaiTroLyAI.bat go
rem Huong dan: HUONG_DAN_TRO_LY_AI.md
if /i "%~1"=="go" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cai-tro-ly-ai.ps1" -Goc "%~dp0." -Go
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\cai-tro-ly-ai.ps1" -Goc "%~dp0."
)
if errorlevel 1 (
  echo.
  echo   Chua cai duoc tro ly AI. Xem thong bao o tren va file HUONG_DAN_TRO_LY_AI.md.
) else (
  echo.
  echo   XONG. Hay THOAT HAN Claude Desktop ^(chuot phai bieu tuong Claude o goc phai thanh tac vu - Quit^)
  echo   roi mo lai, sau do hoi thu: "Con no nha cung cap bao nhieu?"
)
pause
