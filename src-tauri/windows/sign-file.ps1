# Called by `tauri build` for every .exe it produces (the app, the uninstaller, the installer).
# Does nothing unless a code-signing certificate is configured, so normal builds keep working.
#
#   Certificate as a file:   $env:SMS_CERT_PFX = 'C:\path\cert.pfx'; $env:SMS_CERT_PASSWORD = '...'
#   Certificate in Windows (USB token / EV):   $env:SMS_CERT_THUMBPRINT = 'ABCD...'
param([Parameter(Mandatory = $true)][string]$File)

$cert = $null
if ($env:SMS_CERT_THUMBPRINT) {
  $cert = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue |
    Where-Object { $_.Thumbprint -eq $env:SMS_CERT_THUMBPRINT } | Select-Object -First 1
  if (-not $cert) { Write-Error "[sign] certificate $($env:SMS_CERT_THUMBPRINT) not found"; exit 1 }
} elseif ($env:SMS_CERT_PFX) {
  if (-not (Test-Path $env:SMS_CERT_PFX)) { Write-Error "[sign] certificate file not found: $($env:SMS_CERT_PFX)"; exit 1 }
  $pw = ConvertTo-SecureString $env:SMS_CERT_PASSWORD -AsPlainText -Force
  $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($env:SMS_CERT_PFX, $pw)
} else {
  Write-Host "[sign] no certificate configured - $File left unsigned"
  exit 0
}

# A timestamp keeps the signature valid after the certificate itself expires.
$servers = @($env:SMS_TIMESTAMP_URL, 'http://timestamp.digicert.com', 'http://timestamp.sectigo.com') | Where-Object { $_ }
foreach ($ts in $servers) {
  $r = Set-AuthenticodeSignature -FilePath $File -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $ts
  if ($r.SignerCertificate -and $r.TimeStamperCertificate) { Write-Host "[sign] signed $File"; exit 0 }
}
Write-Error "[sign] could not sign (or timestamp) $File"
exit 1
