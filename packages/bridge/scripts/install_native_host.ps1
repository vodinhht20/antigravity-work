param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,
    [ValidateSet("Chrome", "Chromium", "Edge", "Brave")]
    [string]$Browser = "Chrome",
    [string]$PythonPath = "python.exe",
    [switch]$Sdk
)

$ErrorActionPreference = "Stop"
$installer = Join-Path $PSScriptRoot 'install_host.py'
$installArgs = @($installer, '--extension-id', $ExtensionId, '--browser', $Browser.ToLowerInvariant())
if ($Sdk) { $installArgs += '--sdk' }
& $PythonPath @installArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
