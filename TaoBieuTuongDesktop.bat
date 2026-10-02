@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Tao bieu tuong "Ke Toan Cong Trinh" (logo Dien Thuy) tren Desktop, bam vao la chay KhoiDong.bat.
rem "%~dp0." (co dau cham): duong dan ket thuc bang \ se lam hong dau ngoac kep khi truyen cho PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\tao-bieu-tuong.ps1" -Goc "%~dp0."
if errorlevel 1 (
  echo   Khong tao duoc bieu tuong. Ban co the bam dup truc tiep KhoiDong.bat.
) else (
  echo   Da tao bieu tuong "Ke Toan Cong Trinh" tren man hinh Desktop.
  echo   Neu Desktop van hien bieu tuong cu, bam chuot phai len Desktop roi chon Refresh.
)
pause
