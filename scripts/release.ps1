# One command to make a full release:   npm run release   (optional:  npm run release -- -Notes "What changed")
#
#  1. checks the code (tests)
#  2. builds the Windows installer, signed for updates with YOUR updater key (and code-signed if a certificate is set)
#  3. builds the signed Android APK
#  4. copies everything into release-exe / release-apk and prepares  release-upload\v<version>\  =
#     the files to put on a GitHub release so every installed app updates itself.
#
# Keys live outside the project, in %USERPROFILE%\.sms-admin :  updater.key + updater-key-password.txt, android-release.jks.
param(
  [string]$Notes = 'Improvements and fixes.',
  [string]$Repo = 'Dhruv-coder-128/sms-releases',   # the public repo that holds the releases (see docs/UPDATES.md)
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..").Path
$admin = Join-Path $env:USERPROFILE '.sms-admin'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version

foreach ($f in 'updater.key', 'updater-key-password.txt', 'android-release.jks', 'android-signing.properties') {
  if (-not (Test-Path (Join-Path $admin $f))) { throw "Missing $admin\$f - copy your backed-up key files there first." }
}
Write-Host "== Releasing version $version ==" -ForegroundColor Cyan

Set-Location $root
if (-not $SkipTests) {
  Write-Host '[1/4] Tests...' -ForegroundColor Cyan
  npm test --silent
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed - release stopped.' }
}

# The project path has a space, which breaks the Windows resource compiler: build from a space-free drive.
if (-not (Test-Path 'S:\')) { subst S: $root }
try {
  Set-Location 'S:\'
  $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content (Join-Path $admin 'updater.key') -Raw)
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content (Join-Path $admin 'updater-key-password.txt') -Raw).Trim()

  Write-Host '[2/4] Windows installer...' -ForegroundColor Cyan
  npx tauri build
  if ($LASTEXITCODE -ne 0) { throw 'Windows build failed.' }

  Write-Host '[3/4] Android APK...' -ForegroundColor Cyan
  npx cap sync android
  $jdk = 'C:\Users\dusha\.jdks\jbr-21.0.11'
  if (-not (Test-Path $jdk)) { $jdk = 'C:\Program Files\Android\Android Studio\jbr' }
  $env:JAVA_HOME = $jdk; $env:PATH = "$jdk\bin;$env:PATH"
  Push-Location 'S:\android'
  .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
  Pop-Location
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY, Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  Set-Location $root
  subst S: /D | Out-Null
}

Write-Host '[4/4] Collecting files...' -ForegroundColor Cyan
$nsis = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$installer = Get-ChildItem $nsis -Filter "*_${version}_x64-setup.exe" | Select-Object -First 1
$sigFile = Get-Item "$($installer.FullName).sig"
if (-not $installer -or -not $sigFile) { throw 'Installer or its .sig file is missing.' }
$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'

New-Item -ItemType Directory -Force (Join-Path $root 'release-exe'), (Join-Path $root 'release-apk') | Out-Null
Copy-Item $installer.FullName (Join-Path $root 'release-exe') -Force
Copy-Item $apk (Join-Path $root "release-apk\SMS-Teacher-Attendance-v$version.apk") -Force
try { Copy-Item (Join-Path $root 'src-tauri\target\release\sms_app.exe') (Join-Path $root "release-exe\SMS-Student-Management-System-v$version.exe") -Force } catch { Write-Host '  (the plain EXE is in use - skipped; the installer is what schools need)' }

# Files for the GitHub release (space-free names, because GitHub rewrites spaces in asset names)
$up = Join-Path $root "release-upload\v$version"
New-Item -ItemType Directory -Force $up | Out-Null
$assetName = "SMS-Student-Management-System_${version}_x64-setup.exe"
Copy-Item $installer.FullName (Join-Path $up $assetName) -Force
Copy-Item (Join-Path $root "release-apk\SMS-Teacher-Attendance-v$version.apk") $up -Force
$manifest = [ordered]@{
  version  = $version
  notes    = $Notes
  pub_date = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  platforms = @{ 'windows-x86_64' = [ordered]@{
    signature = (Get-Content $sigFile.FullName -Raw).Trim()
    url       = "https://github.com/$Repo/releases/download/v$version/$assetName"
  } }
}
# UTF-8 WITHOUT a byte-order mark: a BOM makes the updater's JSON parser reject the file.
[System.IO.File]::WriteAllText((Join-Path $up 'latest.json'), ($manifest | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host "Done. Version $version" -ForegroundColor Green
Write-Host "  Give to schools:  release-exe\$($installer.Name)   and   release-apk\SMS-Teacher-Attendance-v$version.apk"
Write-Host "  To update every installed app: create a GitHub release 'v$version' in $Repo and upload the 3 files in"
Write-Host "  $up   (installer, APK, latest.json).  See docs/UPDATES.md."
