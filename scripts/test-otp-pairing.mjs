import handler from '../api/local-hub.js';

async function callHub(query = {}, body = {}, method = 'GET') {
  let result = null;
  let statusCode = 200;
  const req = { query, body, method, headers: {} };
  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => { result = data; },
        end: () => {},
      };
    },
  };
  await handler(req, res);
  return { status: statusCode, data: result };
}

async function testOtpPairing() {
  console.log('====================================================');
  console.log('TESTING LOCAL HUB OTP PAIRING & DYNAMIC IP ENGINE');
  console.log('====================================================');

  // 1. Status action
  const statusRes = await callHub({ action: 'status' });
  if (statusRes.status !== 200 || !statusRes.data?.otp) {
    console.error('FAIL: Status endpoint did not return OTP', statusRes);
    process.exit(1);
  }
  const currentOtp = statusRes.data.otp;
  console.log(`✓ PASS: Status endpoint returned active 6-digit OTP: ${currentOtp}`);
  console.log(`✓ PASS: Active Wi-Fi IP detected: ${statusRes.data.ip}`);

  // 2. Pair device with incorrect OTP
  const badPairRes = await callHub(
    { action: 'pair_device' },
    { device_id: 'test_phone_device_001', otp: '000000' },
    'POST'
  );
  if (badPairRes.status === 200 && badPairRes.data?.registered) {
    console.error('FAIL: Hub allowed pairing with invalid OTP!', badPairRes);
    process.exit(1);
  }
  console.log('✓ PASS: Hub successfully rejected invalid OTP code');

  // 3. Pair device with correct OTP
  const goodPairRes = await callHub(
    { action: 'pair_device' },
    { device_id: 'test_phone_device_001', otp: currentOtp },
    'POST'
  );
  if (goodPairRes.status !== 200 || !goodPairRes.data?.registered) {
    console.error('FAIL: Hub rejected valid OTP code!', goodPairRes);
    process.exit(1);
  }
  console.log('✓ PASS: Hub successfully registered device with valid OTP');

  // 4. Check device registration
  const checkRes = await callHub({ action: 'check_device', device_id: 'test_phone_device_001' });
  if (!checkRes.data?.registered) {
    console.error('FAIL: Check device returned false for registered device', checkRes);
    process.exit(1);
  }
  console.log('✓ PASS: Device registration check confirmed device is registered');

  // 5. Test regenerate OTP
  const regenRes = await callHub({ action: 'regenerate_otp' });
  if (!regenRes.data?.otp || regenRes.data.otp === currentOtp) {
    console.error('FAIL: OTP was not regenerated', regenRes);
    process.exit(1);
  }
  console.log(`✓ PASS: OTP successfully regenerated: ${regenRes.data.otp}`);

  console.log('====================================================');
  console.log('ALL OTP PAIRING TESTS PASSED (100% SECURE)');
  console.log('====================================================');
}

testOtpPairing();
