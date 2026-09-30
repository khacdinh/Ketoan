@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'So Thu Chi.lnk')); $s.TargetPath=(Join-Path '%~dp0' 'KhoiDong.bat'); $s.WorkingDirectory='%~dp0'; $s.IconLocation=(Join-Path $env:SystemRoot 'System32\shell32.dll')+',43'; $s.Description='So Thu Chi - phan mem ke toan'; $s.Save()"
if errorlevel 1 (
  echo   Khong tao duoc bieu tuong. Ban co the bam dup truc tiep KhoiDong.bat.
) else (
  echo   Da tao bieu tuong "So Thu Chi" tren man hinh Desktop.
)
pause
