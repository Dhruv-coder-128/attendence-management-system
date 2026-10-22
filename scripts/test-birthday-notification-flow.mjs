import assert from 'assert';
import {
  isStudentBirthdayToday,
  getTodayBirthdayStudents,
  renderNotificationMessage,
  formatStudentBirthdayWhatsAppUrl,
  DEFAULT_NOTIFICATION_TEMPLATES,
} from '../src/lib/telegramClient.js';
import { CANONICAL_STUDENTS } from '../src/data/canonicalSchoolData.js';

console.log('--- Running Student Birthday Notification Flow Verification ---');

// 1. Verify Template Definition
assert.ok(DEFAULT_NOTIFICATION_TEMPLATES.birthday_greeting, 'birthday_greeting template must exist');
console.log('✓ birthday_greeting template exists in DEFAULT_NOTIFICATION_TEMPLATES');

// 2. Verify Template Rendering with Placeholders
const rendered = renderNotificationMessage('birthday_greeting', {
  student_name: 'Krishna Dave',
  roll_no: 'FY-01',
  batch_name: 'FY Batch',
  school_name: 'Apex Academy',
  date: '22-Oct-2026',
});
assert.ok(rendered.includes('Krishna Dave'), 'Rendered message must contain student name');
assert.ok(rendered.includes('FY-01'), 'Rendered message must contain roll number');
assert.ok(rendered.includes('Apex Academy'), 'Rendered message must contain school name');
console.log('✓ Template variable substitution verified successfully');

// 3. Verify Date-agnostic Birthday Matcher
const targetTestDate = new Date(2026, 9, 22); // Month is 0-indexed: 9 = October, 22 = 22nd
assert.strictEqual(isStudentBirthdayToday('2008-10-22', targetTestDate), true, '2008-10-22 must match 22-Oct');
assert.strictEqual(isStudentBirthdayToday('2007-10-22T00:00:00.000Z', targetTestDate), true, 'ISO string must match 22-Oct');
assert.strictEqual(isStudentBirthdayToday('2008-10-23', targetTestDate), false, '2008-10-23 must NOT match 22-Oct');
assert.strictEqual(isStudentBirthdayToday(null, targetTestDate), false, 'null dob must return false');
assert.strictEqual(isStudentBirthdayToday('', targetTestDate), false, 'empty dob must return false');
console.log('✓ isStudentBirthdayToday date matcher logic verified');

// 4. Verify WhatsApp URL Generator
const waUrl = formatStudentBirthdayWhatsAppUrl('+91 98765 43210', 'Happy Birthday Krishna! 🎂');
assert.ok(waUrl.startsWith('https://wa.me/919876543210?text='), 'WhatsApp URL must start with cleaned number');
assert.ok(waUrl.includes('Happy%20Birthday'), 'WhatsApp URL text must be properly encoded');
console.log('✓ formatStudentBirthdayWhatsAppUrl URL encoding verified');

// 5. Verify Roster Birthday Data
assert.strictEqual(CANONICAL_STUDENTS.length, 100, 'Must have exactly 100 students');
for (const s of CANONICAL_STUDENTS) {
  assert.ok(s.dob, `Student ${s.admission_no} (${s.full_name}) must have a dob field`);
  assert.match(s.dob, /^\d{4}-\d{2}-\d{2}$/, `Student ${s.admission_no} dob must match YYYY-MM-DD format`);
}
console.log('✓ All 100 canonical students possess valid YYYY-MM-DD dob attributes');

// 6. Verify Target Birthday Students
const todayBirthdays = getTodayBirthdayStudents(CANONICAL_STUDENTS, targetTestDate);
console.log(`✓ Detected ${todayBirthdays.length} birthday students today:`, todayBirthdays.map(s => `${s.admission_no} - ${s.full_name}`));
assert.ok(todayBirthdays.length >= 2, 'Should find at least 2 students celebrating today');
assert.ok(todayBirthdays.some(s => s.admission_no === 'ST1001'), 'ST1001 Krishna D. Dave must be celebrating today');
assert.ok(todayBirthdays.some(s => s.admission_no === 'ST1025'), 'ST1025 Parth Shah must be celebrating today');

console.log('--- ALL BIRTHDAY NOTIFICATION TESTS PASSED PERFECTLY! ---');
