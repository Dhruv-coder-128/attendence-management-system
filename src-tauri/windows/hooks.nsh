; Teacher phones reach the School PC's Wi-Fi hub through Windows Firewall.
; Windows' own first-run prompt allows only Private networks, but school Wi-Fi is often marked Public,
; so the installer (running as admin) allows the app on every network type.
!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="SMS Attendance Hub"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="SMS Attendance Hub" dir=in action=allow program="$INSTDIR\sms_app.exe" enable=yes profile=any'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="SMS Attendance Hub"'
!macroend
