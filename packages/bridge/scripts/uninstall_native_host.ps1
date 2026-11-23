param(
    [ValidateSet("Chrome", "Chromium", "Edge", "Brave")]
    [string]$Browser = "Chrome",
    [string]$PythonPath = "python.exe"
)

$ErrorActionPreference = "Stop"
$installer = Join-Path $PSScriptRoot 'install_host.py'
& $PythonPath $installer '--uninstall' '--browser' $Browser.ToLowerInvariant()
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
