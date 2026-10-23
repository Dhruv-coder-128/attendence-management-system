import assert from 'node:assert/strict';
import { DEFAULT_ACADEMY_SETTINGS } from '../src/lib/academySettings.js';
import { isStudentBirthdayToday } from '../src/lib/telegramClient.js';

console.log('--- Testing Automated Birthday Wishes & Pagination Logic ---');

// 1. Verify Default Academy Settings
assert.equal(typeof DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_enabled, 'boolean', 'auto_birthday_wish_enabled should be boolean');
assert.equal(DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_enabled, false, 'Default auto_birthday_wish_enabled should be false');
assert.equal(DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_channel, 'both', 'Default auto_birthday_wish_channel should be both');
console.log('✓ DEFAULT_ACADEMY_SETTINGS verification passed');

// 2. Verify Birthday Matching Logic
const today = new Date();
const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
const currentDay = String(today.getDate()).padStart(2, '0');

// Student born today in any year (e.g., 2008)
const bdayTodayIso = `2008-${currentMonth}-${currentDay}`;
assert.equal(isStudentBirthdayToday(bdayTodayIso), true, 'Student born today should match birthday');

// Student born on a different day
const bdayOther = '2008-01-01';
if (`${currentMonth}-${currentDay}` !== '01-01') {
  assert.equal(isStudentBirthdayToday(bdayOther), false, 'Student born on other date should not match today');
}
console.log('✓ isStudentBirthdayToday verification passed');

// 3. Verify Pagination Slice Logic (10 and 20 record sections)
const testDataset = Array.from({ length: 45 }, (_, i) => ({ id: i + 1, name: `Student ${i + 1}` }));

function sliceDataset(data, page, pageSize) {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

// 20 per section
const page1_20 = sliceDataset(testDataset, 1, 20);
assert.equal(page1_20.length, 20, 'Page 1 with pageSize 20 should have 20 items');
assert.equal(page1_20[0].id, 1);
assert.equal(page1_20[19].id, 20);

const page2_20 = sliceDataset(testDataset, 2, 20);
assert.equal(page2_20.length, 20, 'Page 2 with pageSize 20 should have 20 items');
assert.equal(page2_20[0].id, 21);
assert.equal(page2_20[19].id, 40);

const page3_20 = sliceDataset(testDataset, 3, 20);
assert.equal(page3_20.length, 5, 'Page 3 with pageSize 20 should have remaining 5 items');
assert.equal(page3_20[0].id, 41);
assert.equal(page3_20[4].id, 45);

// 10 per section
const page1_10 = sliceDataset(testDataset, 1, 10);
assert.equal(page1_10.length, 10, 'Page 1 with pageSize 10 should have 10 items');
assert.equal(page1_10[0].id, 1);
assert.equal(page1_10[9].id, 10);

const totalPages_10 = Math.ceil(testDataset.length / 10);
assert.equal(totalPages_10, 5, '45 items with pageSize 10 should yield 5 total pages');

const totalPages_20 = Math.ceil(testDataset.length / 20);
assert.equal(totalPages_20, 3, '45 items with pageSize 20 should yield 3 total pages');

console.log('✓ Sectional Pagination slice math passed (10/20 items per page)');
console.log('ALL UNIT LOGIC TESTS PASSED SUCCESSFULLY! ✓');
