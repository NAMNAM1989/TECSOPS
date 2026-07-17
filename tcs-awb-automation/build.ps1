# Đóng gói sidecar (tùy chọn). Cần: pip install pyinstaller
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
python -m pip install -r requirements.txt pyinstaller
python -m playwright install chromium
pyinstaller --noconfirm --onefile --name tcs-awb-agent `
  --add-data "templates;templates" `
  app/main.py
Write-Host "Xong: dist/tcs-awb-agent.exe"