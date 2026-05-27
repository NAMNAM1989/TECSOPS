# Chuyển INV.xlsx đã điền → PDF (cùng engine in như Excel / mẫu INV.pdf)
param(
  [Parameter(Mandatory)][string]$XlsxPath,
  [Parameter(Mandatory)][string]$PdfPath
)

$ErrorActionPreference = "Stop"
$xlTypePDF = 0

$xlsxFull = [System.IO.Path]::GetFullPath($XlsxPath)
$pdfFull = [System.IO.Path]::GetFullPath($PdfPath)

if (-not (Test-Path -LiteralPath $xlsxFull)) {
  Write-Error "Không thấy file: $xlsxFull"
}

$pdfDir = Split-Path -Parent $pdfFull
if ($pdfDir -and -not (Test-Path -LiteralPath $pdfDir)) {
  New-Item -ItemType Directory -Path $pdfDir -Force | Out-Null
}

$excel = $null
$wb = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $wb = $excel.Workbooks.Open($xlsxFull)
  $wb.ExportAsFixedFormat($xlTypePDF, $pdfFull)
} finally {
  if ($wb) { $wb.Close($false) | Out-Null }
  if ($excel) {
    $excel.Quit() | Out-Null
    [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

if (-not (Test-Path -LiteralPath $pdfFull)) {
  Write-Error "Không tạo được PDF: $pdfFull"
}
