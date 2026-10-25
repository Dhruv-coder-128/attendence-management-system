/**
 * package-release.mjs
 * Automated build and deployment pipeline for SMS releases:
 * 1. Vite frontend build
 * 2. Capacitor Android sync + Gradle APK build
 * 3. Tauri Desktop Release compilation (via space-free drive S:)
 * 4. Placement exclusively into release-apk/ and release-exe/
 * 5. Root directory cleanup
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = process.cwd();
const RELEASE_APK_DIR = path.join(ROOT_DIR, 'release-apk');
const RELEASE_EXE_DIR = path.join(ROOT_DIR, 'release-exe');
const VERSION = 'v1.0.8';

console.log('====================================================');
console.log(`Starting SMS Full Release Packaging Pipeline [${VERSION}]`);
console.log('====================================================\n');

// 1. Ensure release directories exist
fs.mkdirSync(RELEASE_APK_DIR, { recursive: true });
fs.mkdirSync(RELEASE_EXE_DIR, { recursive: true });

// 2. Build Web Bundle
console.log('📦 Step 1: Building Web Assets (Vite)...');
execSync('npm run build', { stdio: 'inherit', cwd: ROOT_DIR });

// 3. Sync Android
console.log('\n📱 Step 2: Syncing Capacitor Android Assets...');
execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });

// 4. Build Android Debug APK
console.log('\n🤖 Step 3: Compiling Android APK (Gradle)...');
execSync('cmd /c "cd android && gradlew.bat assembleDebug"', { stdio: 'inherit', cwd: ROOT_DIR });

const builtApkPath = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
if (fs.existsSync(builtApkPath)) {
  const targetVersionedApk = path.join(RELEASE_APK_DIR, `SMS-Teacher-Attendance-${VERSION}.apk`);
  const targetMirrorApk = path.join(RELEASE_APK_DIR, 'SMS-Teacher-Attendance.apk');
  fs.copyFileSync(builtApkPath, targetVersionedApk);
  fs.copyFileSync(builtApkPath, targetMirrorApk);
  console.log(`✓ Copied APK to ${targetVersionedApk}`);
  console.log(`✓ Copied APK to ${targetMirrorApk}`);
} else {
  console.error('❌ Error: built APK not found at ' + builtApkPath);
}

// 5. Build Tauri Desktop EXE
console.log('\n💻 Step 4: Compiling Desktop Executable (Cargo Release)...');
try {
  execSync('powershell -Command "Stop-Process -Name \'sms_app\', \'SMS-App\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
} catch {}

// Ensure drive S: is mounted for space-free windres compilation
try {
  execSync(`powershell -Command "if (!(Test-Path S:)) { subst S: '${ROOT_DIR}' }"`, { stdio: 'inherit' });
} catch {}

execSync('cargo build --release', { stdio: 'inherit', cwd: 'S:\\src-tauri' });

const builtExePath = 'S:\\src-tauri\\target\\release\\sms_app.exe';
const webview2DllPath = 'S:\\src-tauri\\target\\release\\WebView2Loader.dll';

if (fs.existsSync(builtExePath)) {
  try {
    execSync('powershell -Command "Stop-Process -Name \'sms_app\', \'SMS-App\' -Force -ErrorAction SilentlyContinue"', { stdio: 'ignore' });
  } catch {}

  const exeTargets = [
    path.join(RELEASE_EXE_DIR, `SMS-Student-Management-System-${VERSION}.exe`),
    path.join(RELEASE_EXE_DIR, 'SMS - Student Management System.exe'),
    path.join(RELEASE_EXE_DIR, 'SMS-App.exe'),
    path.join(RELEASE_EXE_DIR, 'sms_app.exe')
  ];
  for (const t of exeTargets) {
    try {
      fs.copyFileSync(builtExePath, t);
      console.log(`✓ Copied EXE to ${t}`);
    } catch (err) {
      console.warn(`⚠️ Warning copying to ${t}:`, err.message);
    }
  }

  if (fs.existsSync(webview2DllPath)) {
    try {
      fs.copyFileSync(webview2DllPath, path.join(RELEASE_EXE_DIR, 'WebView2Loader.dll'));
    } catch {}
  }
} else {
  console.error('❌ Error: built EXE not found at ' + builtExePath);
}

// 6. Cleanup loose binaries from root
console.log('\n🧹 Step 5: Cleaning Loose Root Binaries...');
const rootFiles = fs.readdirSync(ROOT_DIR);
for (const file of rootFiles) {
  if (file.endsWith('.apk') || (file.endsWith('.exe') && !file.startsWith('node_modules'))) {
    const fullPath = path.join(ROOT_DIR, file);
    fs.unlinkSync(fullPath);
    console.log(`✓ Removed root binary: ${file}`);
  }
}

console.log('\n====================================================');
console.log('🎉 RELEASE PACKAGING COMPLETED SUCCESSFULLY!');
console.log(`Artifacts available in:`);
console.log(`  - ${RELEASE_APK_DIR}`);
console.log(`  - ${RELEASE_EXE_DIR}`);
console.log('====================================================\n');
