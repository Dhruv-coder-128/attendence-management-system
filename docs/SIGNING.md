# Signing the apps

## Android (APK) — done
- Release key: `%USERPROFILE%\.sms-admin\android-release.jks` + `android-signing.properties` (passwords). **Back both up** next to `signing-key.json`. If lost, phones with the app installed can't be updated (they'd need uninstall + reinstall).
- Build: `npx cap sync android` then `android\gradlew.bat assembleRelease` (from the `S:` drive, see below) → `android/app/build/outputs/apk/release/app-release.apk`.
- Phones that have an older (debug-signed) version must **uninstall it once**; after that, updates install over the top.
- Sideloaded apps still show Android's "unknown source" prompt. Only the Play Store removes that.

## Windows (EXE + installer) — needs a certificate you buy
Without one, Windows SmartScreen shows "Unknown publisher" (clients can still click More info → Run anyway).
The build already calls `src-tauri/windows/sign-file.ps1` for every file; it signs when a certificate is configured, otherwise leaves files as they are.

Set ONE of these before `npx tauri build`:
```
$env:SMS_CERT_PFX = 'C:\certs\sms.pfx'; $env:SMS_CERT_PASSWORD = '...'      # certificate file
$env:SMS_CERT_THUMBPRINT = 'ABCD...'                                         # certificate in Windows / USB token
```
Where to get a certificate: an OV or EV code-signing certificate from a CA (DigiCert, Sectigo, SSL.com, …) — roughly US$100–400/year; EV removes the SmartScreen warning immediately, OV builds reputation over time. Check current prices and whether your country/business type qualifies.

## Building (the project path has a space, which breaks the Windows resource compiler)
```
subst S: "X:\ALL PROJECTS\attendence-management-system"
cd S:\ ; npx tauri build
```
