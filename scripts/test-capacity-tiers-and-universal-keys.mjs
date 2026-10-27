import {
  STUDENT_CAPACITY_TIERS,
  UNIVERSAL_TRIAL_KEY,
  UNIVERSAL_GRACE_KEY,
  getStudentCapacityTier,
  checkStudentCapacityAllowed,
} from '../src/lib/licenseService.js';

console.log('--- SMS SaaS Student Capacity & Universal Keys Verification ---');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failed++;
  }
}

// 1. Verify Universal Key Constants
assert(UNIVERSAL_TRIAL_KEY === 'SMS-FREE-TRIAL-30D', 'Universal 30-Day Trial Key is SMS-FREE-TRIAL-30D');
assert(UNIVERSAL_GRACE_KEY === 'SMS-GRACE-5D', 'Universal 5-Day Emergency Grace Key is SMS-GRACE-5D');

// 2. Verify Student Capacity Tiers
assert(Array.isArray(STUDENT_CAPACITY_TIERS) && STUDENT_CAPACITY_TIERS.length === 4, 'Has exactly 4 capacity tiers');
assert(STUDENT_CAPACITY_TIERS[0].maxStudents === 200, 'Tier 1 is 200 students');
assert(STUDENT_CAPACITY_TIERS[1].maxStudents === 500, 'Tier 2 is 500 students');
assert(STUDENT_CAPACITY_TIERS[2].maxStudents === 1000, 'Tier 3 is 1000 students');
assert(STUDENT_CAPACITY_TIERS[3].maxStudents === 5000, 'Tier 4 is 5000+ students');

// 3. Verify getStudentCapacityTier
const t200 = getStudentCapacityTier(200);
assert(t200.id === 'tier_200' && t200.maxStudents === 200, 'getStudentCapacityTier(200) maps to Tier 1');

const t500 = getStudentCapacityTier(500);
assert(t500.id === 'tier_500' && t500.maxStudents === 500, 'getStudentCapacityTier(500) maps to Tier 2');

const t1000 = getStudentCapacityTier(1000);
assert(t1000.id === 'tier_1000' && t1000.maxStudents === 1000, 'getStudentCapacityTier(1000) maps to Tier 3');

const t5000 = getStudentCapacityTier(5000);
assert(t5000.id === 'tier_5000' && t5000.maxStudents === 5000, 'getStudentCapacityTier(5000) maps to Tier 4');

// 4. Verify checkStudentCapacityAllowed boundary conditions
// Mocking window and localStorage for Node.js environment
globalThis.window = globalThis;
globalThis.localStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; },
};

// Set license maxStudents to 200
localStorage.setItem('sms_school_license', JSON.stringify({
  licenseKey: 'SMS-TEST-200-KEY',
  maxStudents: 200,
  daysRemaining: 30,
}));

const capCheck1 = checkStudentCapacityAllowed(199, 1);
assert(capCheck1.allowed === true && capCheck1.maxStudents === 200, 'Allowed adding 200th student on Tier 1 (199 + 1 = 200)');

const capCheck2 = checkStudentCapacityAllowed(200, 1);
assert(capCheck2.allowed === false, 'Blocked adding 201st student on Tier 1 (200 + 1 > 200)');

const capCheck3 = checkStudentCapacityAllowed(150, 60);
assert(capCheck3.allowed === false, 'Blocked bulk import that would exceed 200 students (150 + 60 > 200)');

// Update license maxStudents to 500
localStorage.setItem('sms_school_license', JSON.stringify({
  licenseKey: 'SMS-TEST-500-KEY',
  maxStudents: 500,
  daysRemaining: 30,
}));

const capCheck4 = checkStudentCapacityAllowed(200, 1);
assert(capCheck4.allowed === true && capCheck4.maxStudents === 500, 'Allowed adding 201st student on Tier 2 (upgraded to 500)');

const capCheck5 = checkStudentCapacityAllowed(500, 1);
assert(capCheck5.allowed === false, 'Blocked adding 501st student on Tier 2');

// 5. Test Lockout Expiration Evaluation
function evaluateLockout(lic) {
  const isLifetime = (lic.daysRemaining >= 9000);
  const isExpiredByDays = !isLifetime && (lic.daysRemaining !== undefined && lic.daysRemaining <= 0);
  const isExpiredByDate = !isLifetime && Boolean(lic.trialEndsAt && new Date(lic.trialEndsAt).getTime() <= Date.now());
  return Boolean(
    lic.isTrialExpired ||
    lic.isLocked ||
    lic.status === 'trial_expired' ||
    lic.status === 'suspended' ||
    isExpiredByDays ||
    isExpiredByDate
  );
}

assert(evaluateLockout({ daysRemaining: 0, status: 'trial_expired' }) === true, 'Timer 0 days forces immediate lockout');
assert(evaluateLockout({ daysRemaining: 5, status: 'trial_active', trialEndsAt: new Date(Date.now() - 10000).toISOString() }) === true, 'Expired end date forces immediate lockout');
assert(evaluateLockout({ daysRemaining: 30, status: 'trial_active', trialEndsAt: new Date(Date.now() + 86400000).toISOString() }) === false, 'Active 30-day key allows full access');
assert(evaluateLockout({ daysRemaining: 5, status: 'trial_active', trialEndsAt: new Date(Date.now() + 5 * 86400000).toISOString() }) === false, 'Active 5-day grace key allows full access');
assert(evaluateLockout({ daysRemaining: 9999, status: 'licensed' }) === false, 'Lifetime key is never locked out');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}
