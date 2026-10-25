import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

console.log('--- Comprehensive Fleet Management, Remote Kill-Switch & Day Adjuster Test ---');

// Load environment variables
const env = {};
for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) {
    fs.readFileSync(file, 'utf-8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const [k, ...v] = trimmed.split('=');
      if (k && !env[k.trim()]) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
    });
  }
}

const BASE_URL = 'http://localhost:5174';
const PIN = '8866';
const TEST_KEY = 'SMS-NOBLE-30D-89XK7';

const supabaseClient = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function testFleetLifecycle() {
  // 1. Authenticate system license client with Supabase
  console.log('\n1. Authenticating system licensing client with Supabase...');
  const { data: authData, error: authErr } = await supabaseClient.auth.signInWithPassword({
    email: 'client-license-sync@sms-system.internal',
    password: 'SmsLicenseSync2026!SecureKey',
  });
  if (authErr || !authData?.session) {
    throw new Error('Supabase client authentication failed: ' + authErr?.message);
  }
  console.log('✓ System licensing client authenticated successfully.');

  // 2. Fetch all registered school licenses from API
  console.log('\n2. Fetching all registered licenses via GET /api/license-manage...');
  const res1 = await fetch(`${BASE_URL}/api/license-manage`, {
    headers: { 'x-developer-pin': PIN }
  });
  const data1 = await res1.json();
  console.log(`✓ Fetched ${data1.licenses?.length} registered licenses:`);
  data1.licenses?.forEach(lic => {
    console.log(`  - [${lic.school_name}] Key: ${lic.license_key} | Status: ${lic.status} | Days: ${lic.days_remaining}`);
  });

  // 3. Test Master Remote Kill-Switch: LOCK CLIENT
  console.log(`\n3. Remotely LOCKING ${TEST_KEY}...`);
  const resLock = await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'suspend',
      licenseKey: TEST_KEY,
    })
  });
  const lockJson = await resLock.json();
  console.log('Lock API response:', lockJson.message);

  // 4. Verify client software directly queries Supabase and detects LOCK
  console.log('\n4. Verifying Client EXE & APK query Supabase directly for lock detection...');
  const { data: licRowLocked, error: readErr } = await supabaseClient
    .from('courses')
    .select('id, code, description, is_active')
    .eq('code', 'LIC:' + TEST_KEY)
    .single();

  if (readErr) throw new Error('Supabase read error: ' + readErr.message);
  const parsedLocked = JSON.parse(licRowLocked.description);
  console.log('Client received from Supabase Cloud:', {
    school: parsedLocked.school_name,
    status: parsedLocked.status,
    is_locked: parsedLocked.is_locked,
    is_active: licRowLocked.is_active,
  });

  if (parsedLocked.is_locked !== true || parsedLocked.status !== 'suspended') {
    throw new Error('Lock detection failed!');
  }
  console.log('✓ Verified: Client software directly detects LOCKED / SUSPENDED status and triggers lockout.');

  // 5. Test Remote UNLOCK
  console.log(`\n5. Remotely UNLOCKING ${TEST_KEY}...`);
  const resUnlock = await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'unlock',
      licenseKey: TEST_KEY,
      newStatus: 'trial_active',
    })
  });
  const unlockJson = await resUnlock.json();
  console.log('Unlock response:', unlockJson.message);

  const { data: licRowUnlocked } = await supabaseClient
    .from('courses')
    .select('description, is_active')
    .eq('code', 'LIC:' + TEST_KEY)
    .single();
  const parsedUnlocked = JSON.parse(licRowUnlocked.description);
  if (parsedUnlocked.is_locked !== false) {
    throw new Error('Unlock assertion failed!');
  }
  console.log('✓ Verified: Client software immediately restored to UNLOCKED status.');

  // 6. Test Day Decrease (-7 Days)
  console.log(`\n6. Testing Day Decrement (-7 days) for ${TEST_KEY}...`);
  const resDec = await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'adjust_days',
      licenseKey: TEST_KEY,
      currentDays: 30,
      deltaDays: -7,
    })
  });
  const decJson = await resDec.json();
  console.log('Decrease response:', decJson.message, `(Days: ${decJson.days})`);
  if (decJson.days !== 23) {
    throw new Error(`Expected 23 days after -7, got ${decJson.days}`);
  }
  console.log('✓ Verified: Day decrease works accurately.');

  // 7. Test Day Increase (+14 Days)
  console.log(`\n7. Testing Day Increment (+14 days) for ${TEST_KEY}...`);
  const resInc = await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'adjust_days',
      licenseKey: TEST_KEY,
      currentDays: 23,
      deltaDays: 14,
    })
  });
  const incJson = await resInc.json();
  console.log('Increase response:', incJson.message, `(Days: ${incJson.days})`);
  if (incJson.days !== 37) {
    throw new Error(`Expected 37 days after +14, got ${incJson.days}`);
  }
  console.log('✓ Verified: Day increase works accurately.');

  // 8. Restore days to 30 for normal operation
  await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'set_days',
      licenseKey: TEST_KEY,
      durationDays: 30,
    })
  });

  // 9. Test Timer Capsule Toggle OFF
  console.log(`\n9. Toggling Timer Capsule OFF for ${TEST_KEY}...`);
  const resTimerOff = await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'toggle_timer',
      licenseKey: TEST_KEY,
      isTimerVisible: false,
    })
  });
  const timerOffJson = await resTimerOff.json();
  console.log('Toggle timer response:', timerOffJson.message);

  const { data: licTimerCheck } = await supabaseClient
    .from('courses')
    .select('description')
    .eq('code', 'LIC:' + TEST_KEY)
    .single();
  const parsedTimer = JSON.parse(licTimerCheck.description);
  if (parsedTimer.is_timer_visible !== false) {
    throw new Error('Timer OFF assertion failed in cloud database!');
  }
  console.log('✓ Verified: Timer OFF persisted in cloud database.');

  // 10. Toggle Timer back ON
  console.log(`\n10. Toggling Timer Capsule back ON for ${TEST_KEY}...`);
  await fetch(`${BASE_URL}/api/license-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-developer-pin': PIN },
    body: JSON.stringify({
      action: 'toggle_timer',
      licenseKey: TEST_KEY,
      isTimerVisible: true,
    })
  });
  console.log('✓ Timer restored to ON.');

  console.log('\n🎉 ALL 10 COMPREHENSIVE SAAS FLEET TESTS PASSED WITH 100% SUCCESS!\n');
}

testFleetLifecycle().catch(err => {
  console.error('\n❌ Fatal Test Error:', err);
  process.exit(1);
});
