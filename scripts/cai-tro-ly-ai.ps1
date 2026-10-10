# Cài (hoặc gỡ) trợ lý AI cho Claude Desktop: thêm cổng MCP "ke-toan-cong-trinh" (scripts\mcp-ketoan.js, CHỈ ĐỌC dữ liệu)
# vào file cấu hình claude_desktop_config.json. Gọi từ CaiTroLyAI.bat. File này phải lưu UTF-8 có BOM.
param([Parameter(Mandatory = $true)][string]$Goc, [switch]$Go)
$ErrorActionPreference = 'Stop'
trap { Write-Host ('  LỖI: ' + $_.Exception.Message); exit 1 }
$TEN = 'ke-toan-cong-trinh'
$goc = (Resolve-Path -LiteralPath $Goc).Path.TrimEnd('\')
$script = Join-Path $goc 'scripts\mcp-ketoan.js'
$data = if ($env:KETOAN_DATA) { $env:KETOAN_DATA } else { Join-Path $goc 'data' }
if (-not (Test-Path -LiteralPath $script)) { throw "Không thấy $script" }

# Thư mục cấu hình Claude Desktop: bản cài từ trang chủ (%APPDATA%\Claude) và bản Microsoft Store (LocalCache trong Packages)
$dirs = @()
$thuong = Join-Path $env:APPDATA 'Claude'
if (Test-Path -LiteralPath $thuong) { $dirs += $thuong }
$pk = Join-Path $env:LOCALAPPDATA 'Packages'
if (Test-Path -LiteralPath $pk) {
  Get-ChildItem -LiteralPath $pk -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue | ForEach-Object {
    $d = Join-Path $_.FullName 'LocalCache\Roaming\Claude'
    if (Test-Path -LiteralPath $d) { $dirs += $d }
  }
}
if (-not $dirs.Count) {
  if ($Go) { Write-Host '  Chưa thấy Claude Desktop trên máy: không có gì để gỡ.'; exit 0 }
  New-Item -ItemType Directory -Path $thuong -Force | Out-Null
  $dirs += $thuong
  Write-Host '  Chưa thấy Claude Desktop. Vẫn ghi cấu hình sẵn; cài Claude Desktop tại https://claude.ai/download rồi mở lên.'
}

$node = $null
if (-not $Go) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $cmd) { throw 'Máy chưa cài Node.js (cần cho phần mềm). Cài bản LTS tại https://nodejs.org rồi chạy lại.' }
  $node = $cmd.Source
  # đọc thử dữ liệu trước khi ghi cấu hình
  $env:KETOAN_DATA = $data
  # không gộp stderr (2>&1): PowerShell 5 coi mọi dòng stderr của chương trình ngoài là lỗi và dừng ngay
  $ErrorActionPreference = 'Continue'
  $kq = & $node $script --kiem-tra
  $ma = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $kq | ForEach-Object { Write-Host ('  ' + $_) }
  if ($ma -ne 0) { throw 'Cổng MCP không đọc được dữ liệu (xem dòng LỖI ở trên).' }
}

$utf8 = New-Object System.Text.UTF8Encoding $false
foreach ($d in $dirs) {
  $f = Join-Path $d 'claude_desktop_config.json'
  $cfg = $null
  if (Test-Path -LiteralPath $f) {
    $txt = [IO.File]::ReadAllText($f)
    if ($txt.Trim()) {
      try { $cfg = $txt | ConvertFrom-Json } catch { throw "File cấu hình $f đang bị lỗi định dạng JSON, chưa sửa được tự động. Hãy mở và sửa lại (hoặc đổi tên) rồi chạy lại." }
      Copy-Item -LiteralPath $f -Destination ($f + '.truoc-tro-ly-ai.bak') -Force
    }
  }
  if (-not $cfg) { $cfg = New-Object PSObject }
  if (-not ($cfg.PSObject.Properties.Name -contains 'mcpServers') -or -not $cfg.mcpServers) {
    if ($Go) { Write-Host "  $f : không có trợ lý để gỡ."; continue }
    $cfg | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue (New-Object PSObject) -Force
  }
  if ($Go) {
    $cfg.mcpServers.PSObject.Properties.Remove($TEN)
    Write-Host "  Đã gỡ trợ lý khỏi $f"
  } else {
    $muc = [ordered]@{ command = $node; args = @($script); env = [ordered]@{ KETOAN_DATA = $data } }
    $cfg.mcpServers | Add-Member -NotePropertyName $TEN -NotePropertyValue ([PSCustomObject]$muc) -Force
    Write-Host "  Đã ghi cấu hình: $f"
  }
  [IO.File]::WriteAllText($f, ($cfg | ConvertTo-Json -Depth 32), $utf8)
}
