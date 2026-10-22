$dir = 'C:\Users\dusha\AppData\Local\com.sms.studentmanagementsystem\EBWebView'
Get-ChildItem -Path $dir -Recurse -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'lock|singleton' } | Select-Object FullName, LastWriteTime
