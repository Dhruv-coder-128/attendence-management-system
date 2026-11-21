// Dates (India is UTC+5:30), academic year, and the setup wizard's class helpers. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayLocal, currentAcademicYear } from '../src/lib/dateUtils.js';
import { codeFromName, parseClassLines } from '../src/lib/classSetup.js';

test('todayLocal uses the device date, not UTC (at 2:30 AM in India UTC still says yesterday)', () => {
  const d = new Date(2026, 10, 21, 2, 30); // 21 Nov 2026, 02:30 local time
  assert.equal(todayLocal(d), '2026-11-21');
  assert.equal(todayLocal(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(todayLocal(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('academic year: starts in June', () => {
  assert.equal(currentAcademicYear(new Date(2026, 4, 31)), '2025-26'); // May
  assert.equal(currentAcademicYear(new Date(2026, 5, 1)), '2026-27');  // June
  assert.equal(currentAcademicYear(new Date(2026, 10, 20)), '2026-27');
  assert.equal(currentAcademicYear(new Date(2027, 1, 10)), '2026-27');
  assert.equal(currentAcademicYear(new Date(2099, 6, 1)), '2099-00');  // century roll-over stays two digits
});

test('class lines: one per line or comma, blanks and case-duplicates dropped', () => {
  assert.deepEqual(parseClassLines('Class 8 A\nClass 8 B\n\n 11th Commerce , 12th  Science A\nclass 8 a'),
    ['Class 8 A', 'Class 8 B', '11th Commerce', '12th Science A']);
  assert.deepEqual(parseClassLines(''), []);
  assert.deepEqual(parseClassLines(null), []);
});

test('batch codes: short, readable, unique', () => {
  assert.equal(codeFromName('11th Commerce A'), '11CA');
  assert.equal(codeFromName('Class 8 B'), 'C8B');
  assert.equal(codeFromName('Typing'), 'TYPING');
  assert.equal(codeFromName('Class 8 A', new Set(['C8A'])), 'C8A2');
  assert.equal(codeFromName('Class 8 A', new Set(['C8A', 'C8A2'])), 'C8A3');
  assert.equal(codeFromName('!!!'), 'B');
});
