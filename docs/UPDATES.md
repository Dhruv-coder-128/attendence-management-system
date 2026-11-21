# Updating installed apps automatically

Every installed PC app checks for a newer version about a minute after it starts, and every 6 hours.
When one exists, a bar appears at the top: **"Update 1.0.18 is available. Your data stays safe. [Update now]"**.
The app makes a backup, downloads the update, installs it and restarts itself. Student data is never touched.
Only updates signed with **your** updater key are accepted (the matching public key is built into the app).

## You publish an update in 3 steps
1. Raise `"version"` in `package.json` (e.g. `1.0.18`) and in `android/app/build.gradle` (`versionCode` +1, `versionName`).
2. `npm run release -- -Notes "What changed"` — builds the signed installer + APK and prepares `release-upload\v1.0.18\`.
3. On GitHub: open the releases repo → **Draft a new release** → tag `v1.0.18` → drag in the 3 files from `release-upload\v1.0.18\`
   (installer, APK, `latest.json`) → **Publish**. Installed apps pick it up within hours.

The installer you give to NEW schools is `release-exe\SMS - Student Management System_<version>_x64-setup.exe`.

## Where the releases live (important)
Installed apps look for `latest.json` at, in order:
1. `https://github.com/Dhruv-coder-128/sms-releases/releases/latest/download/latest.json`
2. `https://github.com/Dhruv-coder-128/attendence-management-system/releases/latest/download/latest.json`

**Recommended:** create a new **public** repo named `sms-releases` (empty, only for release files) and keep the source repo **private**.
A public source repo lets anyone read the app code, including how the licence check works. These addresses are built into every
installed app, so they must keep working: never rename or delete `sms-releases` once schools use it.

## Keys (outside the project, in `%USERPROFILE%\.sms-admin`) — back them all up
| File | Purpose | If lost |
|---|---|---|
| `updater.key` + `updater-key-password.txt` | signs updates | installed apps can never be updated again |
| `signing-key.json` | signs licence keys | existing apps reject new licence keys |
| `android-release.jks` + `android-signing.properties` | signs the APK | phones must uninstall/reinstall |
