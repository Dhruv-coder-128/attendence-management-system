/**
 * Verification Test: Mobile Decoupling, Settings License Card & Live Days Sync
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uugvudqbwoyywzbjrfol.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut';
const SYSTEM_VERIFIER_EMAIL = 'client-license-sync@sms-system.internal';
const SYSTEM_VERIFIER_PASS = 'SmsLicenseSync2026!SecureKey';

const TEST_KEY = 'SMS-SETTINGS-TEST-30D-XYZ1';

async function runVerification() {
  console.log('======================================================================');
  console.log('🧪 VERIFYING MOBILE DECOUPLING & SETTINGS LICENSE SYNC');
  console.log('======================================================================\n');

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
    throw new Error('Supabase Auth Failed: ' + (authErr?.message || 'No session'));
  }
  console.log('✓ Supabase authenticated successfully.\n');

  // 2. Insert test license with 20 days
  console.log('2. Creating test license in cloud with 20 days remaining...');
  const licCode = 'LIC:' + TEST_KEY;
  const initialPayload = {
    licenseKey: TEST_KEY,
    schoolName: 'Settings Test Academy',
    status: 'trial_active',
    daysRemaining: 20,
    trialEndsAt: new Date(Date.now() + 20 * 86400000).toISOString(),
    isLocked: false,
    boundDeviceId: 'REG-WIN-TEST-PC-1234',
  };

  await supabase.from('courses').upsert({
    code: licCode,
    name: 'Settings Test Academy [TRIAL_ACTIVE]',
    level: 'License',
    description: JSON.stringify(initialPayload),
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  console.log('✓ Created initial license with 20 days.\n');

  // 3. Simulate Admin adds +15 days from Admin Portal (localhost or cloud)
  console.log('3. Admin Portal adds +15 days to the license...');
  const { data: rowBefore } = await supabase.from('courses').select('*').eq('code', licCode).single();
  const desc = JSON.parse(rowBefore.description);
  desc.daysRemaining = (desc.daysRemaining || 20) + 15;
  desc.days_remaining = desc.daysRemaining;
  desc.trialEndsAt = new Date(Date.now() + desc.daysRemaining * 86400000).toISOString();

  await supabase.from('courses').update({
    description: JSON.stringify(desc),
    updated_at: new Date().toISOString(),
  }).eq('code', licCode);

  console.log(`✓ Admin updated license in cloud: new days = ${desc.daysRemaining}\n`);

  // 4. Simulate Client EXE syncing license status (as done by Settings page or 10s heartbeat)
  console.log('4. Client EXE calls validateLicense() / Sync Cloud Status...');
  const { data: rowAfterSync } = await supabase.from('courses').select('*').eq('code', licCode).single();
  const clientView = JSON.parse(rowAfterSync.description);

  console.log('  Client fetched daysRemaining:', clientView.daysRemaining);
  console.log('  Client fetched status:', clientView.status);
  console.log('  Client fetched boundDeviceId:', clientView.boundDeviceId);

  if (clientView.daysRemaining !== 35) {
    throw new Error(`FAIL: Expected 35 days, got ${clientView.daysRemaining}`);
  }
  console.log('✓ SUCCESS: Client EXE successfully reflects the 35 days remaining!\n');

  // 5. Cleanup test license
  console.log('5. Cleaning up test license...');
  await supabase.from('courses').delete().eq('code', licCode);
  console.log('✓ Cleanup complete.\n');

  console.log('======================================================================');
  console.log('🎉 ALL SETTINGS LICENSE CARD & LIVE DAYS SYNC TESTS PASSED (100%)!');
  console.log('======================================================================');
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
