# Gửi file TSPL/RAW tới hàng đợi máy in Windows (USB) — dùng bởi local-thermal-print-bridge.mjs
param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
  Write-Error "File not found: $FilePath"
  exit 2
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class TecsopsRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr hPrinter, IntPtr pDefault);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
}
"@

$di = New-Object TecsopsRawPrint+DOCINFO
$di.pDocName = "TECSOPS Label"
$di.pDataType = "RAW"

[IntPtr]$h = [IntPtr]::Zero
if (-not [TecsopsRawPrint]::OpenPrinter($PrinterName, [ref]$h, [IntPtr]::Zero)) {
  Write-Error "OpenPrinter failed for: $PrinterName"
  exit 3
}

try {
  if (-not [TecsopsRawPrint]::StartDocPrinter($h, 1, $di)) {
    Write-Error "StartDocPrinter failed"
    exit 4
  }
  try {
    if (-not [TecsopsRawPrint]::StartPagePrinter($h)) {
      Write-Error "StartPagePrinter failed"
      exit 5
    }
    try {
      [int]$written = 0
      if (-not [TecsopsRawPrint]::WritePrinter($h, $bytes, $bytes.Length, [ref]$written)) {
        Write-Error "WritePrinter failed"
        exit 6
      }
    } finally {
      [void][TecsopsRawPrint]::EndPagePrinter($h)
    }
  } finally {
    [void][TecsopsRawPrint]::EndDocPrinter($h)
  }
} finally {
  [void][TecsopsRawPrint]::ClosePrinter($h)
}

Write-Output "OK written $($bytes.Length) bytes to $PrinterName"
