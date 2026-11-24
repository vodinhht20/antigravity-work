function Install-Gecko {
    param(
        [Parameter(Position = 0)]
        [string]$ExtensionId = "",
        [string]$Browser = "all",
        [switch]$Sdk,
        [switch]$SkipCli,
        [string]$Ref = "main"
    )

    $ErrorActionPreference = "Stop"
    $Repo = "vodinhht20/antigravity-work"

    if (-not $ExtensionId) {
        $ExtensionId = (Read-Host "Paste Gecko for Antigravity Extension ID (32 letters from chrome://extensions)").Trim()
    }

    if ($ExtensionId -notmatch '^[a-p]{32}$') {
        Write-Error "Invalid Extension ID '$ExtensionId'. Expected 32 lowercase letters (a-p). Example: irm https://raw.githubusercontent.com/$Repo/main/install.ps1 | iex; Install-Gecko <EXTENSION_ID>"
        return
    }

    $PythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $PythonCmd) {
        $PythonCmd = Get-Command py -ErrorAction SilentlyContinue
    }
    if (-not $PythonCmd) {
        Write-Error "Python 3.9+ is required. Install from https://www.python.org/downloads/ and ensure 'Add Python to PATH' is checked."
        return
    }

    $TmpDir = Join-Path $env:TEMP ("gecko-antigravity-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null

    try {
        $ZipPath = Join-Path $TmpDir "repo.zip"
        $ZipUrl = "https://codeload.github.com/$Repo/zip/refs/heads/$Ref"
        Write-Host "Downloading Gecko for Antigravity companion from github.com/$Repo ($Ref)..."
        Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
        Expand-Archive -Path $ZipPath -DestinationPath $TmpDir -Force

        $Installer = Get-ChildItem -Path $TmpDir -Recurse -Filter "install_host.py" | Select-Object -First 1
        if (-not $Installer) {
            throw "Could not find packages/bridge/scripts/install_host.py in downloaded archive."
        }

        $InstallArgs = @($Installer.FullName, "--extension-id", $ExtensionId, "--browser", $Browser, "--mcp")
        if ($Sdk) { $InstallArgs += "--sdk" }

        $CliJustInstalled = $false
        $HasAgy = (Get-Command agy -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $env:LOCALAPPDATA "agy\bin\agy.exe"))
        if (-not $SkipCli -and -not $HasAgy) {
            Write-Host "Antigravity CLI ('agy') not found. Installing official Antigravity CLI..."
            try {
                irm https://antigravity.google/cli/install.ps1 | iex
                $CliJustInstalled = $true
            } catch {
                Write-Warning "Could not auto-install Antigravity CLI ($_). Continuing with companion & MCP installation..."
            }
        }

        Write-Host "Installing companion..."
        & $PythonCmd.Source @InstallArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Companion installation exited with code $LASTEXITCODE."
        }

        Write-Host ""
        Write-Host "Done! Return to Chrome -> Gecko for Antigravity Side Panel (it will auto-connect within 3 seconds)."
        if ($CliJustInstalled) {
            Write-Host "Next step: Run 'agy' once in a new PowerShell window to sign in with your Google account, then start chatting in Gecko!"
        }
    }
    finally {
        if (Test-Path $TmpDir) {
            Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

if ($MyInvocation.InvocationName -and $args.Count -gt 0) {
    Install-Gecko @args
}
