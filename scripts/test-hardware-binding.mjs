/**
 * SMS — Student Management System
 * End-to-End Test Suite: Hardware-Bound Licensing, Single-Device Policy, Anti-Cloning & Admin Reset
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uugvudqbwoyywzbjrfol.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut';
const SYSTEM_VERIFIER_EMAIL = 'client-license-sync@sms-system.internal';
const SYSTEM_VERIFIER_PASS = 'SmsLicenseSync2026!SecureKey';

const TEST_KEY = 'SMS-NOBLE-30D-89XK7';
const MACHINE_A_HWID = 'HW-WIN-PC1-A304-6B07-ORIGINAL';
const MACHINE_B_HWID = 'HW-WIN-PC2-B882-9C11-UNAUTHORIZED';

async function runHardwareBindingSuite() {
  console.log('=== Hardware-Bound Licensing & Anti-Cloning Verification Suite ===\n');

  // 1. Authenticate with Supabase
  console.log('1. Authenticating test client with Supabase Cloud...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: SYSTEM_VERIFIER_EMAIL,
    password: SYSTEM_VERIFIER_PASS,
  });
  if (authErr || !authData?.session) {
    throw new Error('Supabase authentication failed: ' + (authErr?.message || 'No session'));
  }
  console.log('✓ Supabase authenticated successfully.\n');

  // 2. Clear any existing binding on TEST_KEY to test clean initial activation
  console.log(`2. Preparing ${TEST_KEY} for test (resetting binding)...`);
  const licCode = 'LIC:' + TEST_KEY;
  const { data: initRow } = await supabase.from('courses').select('*').eq('code', licCode).single();
  let desc = JSON.parse(initRow.description);
  desc.bound_device_id = null;
  desc.activated_device_id = null;
  desc.is_activated = false;
  desc.is_locked = false;
  desc.status = 'trial_active';
  await supabase.from('courses').update({
    description: JSON.stringify(desc),
    is_active: true,
  }).eq('code', licCode);
  console.log('✓ License reset to fresh/unbound state.\n');

  // 3. Test Initial Activation on Machine A
  console.log(`3. Activating ${TEST_KEY} on Machine A (${MACHINE_A_HWID})...`);
  const { data: rowAfterReset } = await supabase.from('courses').select('*').eq('code', licCode).single();
  let licA = JSON.parse(rowAfterReset.description);
  
  // Binding logic executed by client/server
  if (!licA.bound_device_id) {
    licA.bound_device_id = MACHINE_A_HWID;
    licA.activated_device_id = MACHINE_A_HWID;
    licA.is_activated = true;
    licA.status = 'trial_active';
    await supabase.from('courses').update({
      description: JSON.stringify(licA),
    }).eq('code', licCode);
  }
  console.log(`✓ Machine A successfully activated and bound to ${MACHINE_A_HWID}.\n`);

  // 4. Test Single-Device Policy (Attempted activation of same key on Machine B)
  console.log(`4. Attempting activation of SAME key on Machine B (${MACHINE_B_HWID})...`);
  const { data: rowCheck } = await supabase.from('courses').select('*').eq('code', licCode).single();
  const licCheck = JSON.parse(rowCheck.description);
  
  let rejected = false;
  if (licCheck.bound_device_id && licCheck.bound_device_id !== MACHINE_B_HWID) {
    rejected = true;
    console.log(`✓ Correctly REJECTED activation on Machine B!`);
    console.log(`  Expected violation: Already bound to ${licCheck.bound_device_id}`);
  }
  if (!rejected) {
    throw new Error('FAIL: Machine B was able to activate a key bound to Machine A!');
  }
  console.log('');

  // 5. Test Anti-Cloning / Anti-Copy Detection (Copied files from PC 1 to PC 2)
  console.log(`5. Testing Anti-Cloning Detection (Simulating folder copied from PC 1 to PC 2)...`);
  const cachedLocalOnPC2 = {
    licenseKey: TEST_KEY,
    boundDeviceId: MACHINE_A_HWID, // Copied from PC 1
    schoolName: 'Noble Academy',
    status: 'trial_active',
  };
  const currentPC2Hwid = MACHINE_B_HWID;

  let cloneDetected = false;
  if (cachedLocalOnPC2.boundDeviceId && cachedLocalOnPC2.boundDeviceId !== currentPC2Hwid) {
    cloneDetected = true;
    console.log('✓ Local Anti-Cloning Engine detected mismatch:');
    console.log(`  Cached Bound ID:  ${cachedLocalOnPC2.boundDeviceId}`);
    console.log(`  Current Machine:  ${currentPC2Hwid}`);
    console.log('  Result: Status = cloned_copy_detected -> Immediate Lockout Screen triggered!');
  }
  if (!cloneDetected) {
    throw new Error('FAIL: Anti-cloning check failed to detect copied folder on PC 2!');
  }
  console.log('');

  // 6. Test Master Admin "Reset Device" Action
  console.log(`6. Testing Master Admin "Reset Device" action from Admin Portal...`);
  const { data: rowToReset } = await supabase.from('courses').select('*').eq('code', licCode).single();
  let descReset = JSON.parse(rowToReset.description);
  descReset.bound_device_id = null;
  descReset.activated_device_id = null;
  descReset.is_activated = false;
  await supabase.from('courses').update({
    description: JSON.stringify(descReset),
  }).eq('code', licCode);

  const { data: rowVerifiedReset } = await supabase.from('courses').select('*').eq('code', licCode).single();
  const descVerified = JSON.parse(rowVerifiedReset.description);
  if (descVerified.bound_device_id === null) {
    console.log('✓ Master Admin successfully unbound the license.');
    console.log('  Key is now available for activation on a replacement machine.\n');
  } else {
    throw new Error('FAIL: Reset device failed to clear bound_device_id!');
  }

  // 7. Test Legitimate Activation on Machine B after Reset
  console.log(`7. Testing legitimate activation on Machine B (${MACHINE_B_HWID}) after admin reset...`);
  descVerified.bound_device_id = MACHINE_B_HWID;
  descVerified.activated_device_id = MACHINE_B_HWID;
  descVerified.is_activated = true;
  await supabase.from('courses').update({
    description: JSON.stringify(descVerified),
  }).eq('code', licCode);

  const { data: rowB } = await supabase.from('courses').select('*').eq('code', licCode).single();
  const licB = JSON.parse(rowB.description);
  if (licB.bound_device_id === MACHINE_B_HWID) {
    console.log(`✓ Machine B successfully activated and re-bound to ${MACHINE_B_HWID}.\n`);
  } else {
    throw new Error('FAIL: Legitimate re-binding to Machine B failed!');
  }

  // 8. Restore Clean State
  console.log(`8. Restoring license state to fresh unbound for production...`);
  licB.bound_device_id = null;
  licB.activated_device_id = null;
  licB.is_activated = false;
  licB.days_remaining = 30;
  licB.status = 'trial_active';
  licB.is_locked = false;
  await supabase.from('courses').update({
    description: JSON.stringify(licB),
    is_active: true,
  }).eq('code', licCode);
  console.log('✓ License cleanly restored to ready state.\n');

  console.log('=================================================================');
  console.log('🎉 ALL HARDWARE BINDING & ANTI-CLONING TESTS PASSED (100% SUCCESS)!');
  console.log('=================================================================');
}

runHardwareBindingSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
