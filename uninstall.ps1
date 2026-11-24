param(
    [ValidateSet("all", "chrome", "chromium", "edge", "brave")]
    [string]$Browser = "all"
)

$ErrorActionPreference = "Stop"
$HostName = "com.antigravity.browser_bridge"
$McpKey = "gecko-for-antigravity"

$RegMap = @{
    chrome   = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
    chromium = "HKCU:\Software\Chromium\NativeMessagingHosts\$HostName"
    edge     = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
    brave    = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
}

$Targets = if ($Browser -eq "all") { $RegMap.Keys } else { @($Browser) }

foreach ($b in $Targets) {
    $regPath = $RegMap[$b]
    if (Test-Path $regPath) {
        Remove-Item -Path $regPath -Recurse -Force
        Write-Host "Removed registry key for $b: $regPath"
    }
}

if ($Browser -eq "all") {
    $Dirs = @(
        (Join-Path $env:LOCALAPPDATA "GeckoAntigravity"),
        (Join-Path $env:LOCALAPPDATA "GravityPanel"),
        (Join-Path $env:LOCALAPPDATA "AntigravityBridge"),
        (Join-Path $env:LOCALAPPDATA "AntigravityWork")
    )
    foreach ($dir in $Dirs) {
        if (Test-Path $dir) {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "Removed companion directory: $dir"
        }
    }
}

# Remove MCP server entry without affecting other MCP servers
$McpConfig = Join-Path $HOME ".gemini\antigravity\mcp_config.json"
if (Test-Path $McpConfig) {
    try {
        $json = Get-Content -Path $McpConfig -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($json.mcpServers -and ($json.mcpServers.PSObject.Properties.Name -contains $McpKey)) {
            $json.mcpServers.PSObject.Properties.Remove($McpKey)
            $json | ConvertTo-Json -Depth 10 | Set-Content -Path $McpConfig -Encoding UTF8
            Write-Host "Removed MCP server '$McpKey' from $McpConfig"
        }
    } catch {
        Write-Warning "Could not update $McpConfig automatically: $_"
    }
}

Write-Host ""
Write-Host "Gecko for Antigravity companion has been uninstalled."
Write-Host "Note: To also remove the Chrome extension, open chrome://extensions and click Remove."
