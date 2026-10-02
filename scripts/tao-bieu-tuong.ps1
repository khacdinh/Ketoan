# Tạo biểu tượng "Kế Toán Công Trình" (logo Điền Thủy) trên Desktop, bấm vào là chạy KhoiDong.bat.
# Gọi từ TaoBieuTuongDesktop.bat. File này phải lưu UTF-8 có BOM (Windows PowerShell 5 mới đọc đúng chữ có dấu).
param([Parameter(Mandatory = $true)][string]$Goc)
$ErrorActionPreference = 'Stop'
$goc = (Resolve-Path -LiteralPath $Goc).Path.TrimEnd('\')
$bat = Join-Path $goc 'KhoiDong.bat'
if (-not (Test-Path -LiteralPath $bat)) { throw "Không thấy $bat" }
$desk = [Environment]::GetFolderPath('Desktop')
$sh = New-Object -ComObject WScript.Shell

# Bỏ biểu tượng tên cũ "So Thu Chi" nếu nó mở đúng phần mềm này (biểu tượng của thư mục khác thì để nguyên)
$cu = Join-Path $desk 'So Thu Chi.lnk'
if (Test-Path -LiteralPath $cu) {
  if ($sh.CreateShortcut($cu).TargetPath -ieq $bat) { Remove-Item -LiteralPath $cu -Force }
}

$ico = Join-Path $goc 'public\img\bieu-tuong.ico'
function Tao([string]$ten) {
  $lnk = $sh.CreateShortcut((Join-Path $desk ($ten + '.lnk')))
  $lnk.TargetPath = $bat
  $lnk.WorkingDirectory = $goc
  if (Test-Path -LiteralPath $ico) { $lnk.IconLocation = $ico + ',0' }
  else { $lnk.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',43' }
  $lnk.Description = 'Kế Toán Công Trình - phần mềm kế toán'
  $lnk.Save()
}
try { Tao 'Kế Toán Công Trình' }
catch { Tao 'Ke Toan Cong Trinh' } # máy không ghi được tên có dấu: dùng tên không dấu
