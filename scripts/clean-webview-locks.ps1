# Kill any orphaned msedgewebview2 processes belonging to SMS app
Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*com.sms.studentmanagementsystem*' } | ForEach-Object {
    Write-Host "Killing zombie WebView2 PID:" $_.ProcessId
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Remove all lock files in EBWebView
$ebDir = "C:\Users\dusha\AppData\Local\com.sms.studentmanagementsystem\EBWebView"
if (Test-Path $ebDir) {
    Get-ChildItem -Path $ebDir -Recurse -Force | Where-Object { $_.Name -match 'lock|singleton' } | ForEach-Object {
        try {
            Remove-Item -Path $_.FullName -Force -ErrorAction Stop
            Write-Host "Removed lock:" $_.FullName
        } catch {
            Write-Host "Could not remove lock (in use?):" $_.FullName
        }
    }
}
