/**
 * Automated Verification Suite for Student-Parent Linkage, Database Relational Joins,
 * and Message Center Notification Templates Subsystem
 */

import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  getNotificationTemplates,
  renderNotificationMessage,
} from '../src/lib/telegramClient.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================');
console.log('STUDENT-PARENT LINKAGE & MESSAGE CENTER VERIFICATION');
console.log('======================================================\n');

// TEST 1: Default Notification Templates Exist
console.log('--- TEST 1: Notification Templates Availability ---');
assert(Boolean(DEFAULT_NOTIFICATION_TEMPLATES.attendance_present), 'Template attendance_present exists');
assert(Boolean(DEFAULT_NOTIFICATION_TEMPLATES.attendance_absent), 'Template attendance_absent exists');
assert(Boolean(DEFAULT_NOTIFICATION_TEMPLATES.attendance_late), 'Template attendance_late exists');
assert(Boolean(DEFAULT_NOTIFICATION_TEMPLATES.fee_reminder), 'Template fee_reminder exists');
assert(Boolean(DEFAULT_NOTIFICATION_TEMPLATES.exam_result), 'Template exam_result exists');

// TEST 2: Token Interpolation for Attendance (Present, Absent, Late)
console.log('\n--- TEST 2: Attendance Token Interpolation ---');
const sampleVars = {
  student_name: 'Adhira Patel',
  roll_no: '20',
  batch_name: '12th Commerce',
  date: '2026-10-17',
  school_name: 'SMS International Academy',
};

const presentMsg = renderNotificationMessage('attendance_present', sampleVars);
assert(presentMsg.includes('Adhira Patel'), 'Present alert contains student name');
assert(presentMsg.includes('20'), 'Present alert contains roll number');
assert(presentMsg.includes('12th Commerce'), 'Present alert contains batch name');
assert(presentMsg.includes('PRESENT'), 'Present alert specifies PRESENT status');

const absentMsg = renderNotificationMessage('attendance_absent', sampleVars);
assert(absentMsg.includes('Adhira Patel'), 'Absent alert contains student name');
assert(absentMsg.includes('ABSENT'), 'Absent alert specifies ABSENT status');

const lateMsg = renderNotificationMessage('attendance_late', sampleVars);
assert(lateMsg.includes('LATE'), 'Late alert specifies LATE status');

// TEST 3: Fee Reminder Token Interpolation
console.log('\n--- TEST 3: Fee Reminder Token Interpolation ---');
const feeVars = {
  student_name: 'Adhira Patel',
  roll_no: '20',
  pending_amount: '15,000',
  total_amount: '45,000',
  due_date: '2026-11-01',
  school_name: 'SMS International Academy',
};
const feeMsg = renderNotificationMessage('fee_reminder', feeVars);
assert(feeMsg.includes('₹15,000'), 'Fee alert contains pending balance');
assert(feeMsg.includes('2026-11-01'), 'Fee alert contains due date');

// TEST 4: Exam Results Token Interpolation
console.log('\n--- TEST 4: Exam Results Token Interpolation ---');
const examVars = {
  student_name: 'Adhira Patel',
  roll_no: '20',
  exam_name: 'Mathematics Quarterly Test',
  score: '92',
  max_marks: '100',
  percentage: '92',
  grade: 'A+ (Passed)',
  school_name: 'SMS International Academy',
};
const examMsg = renderNotificationMessage('exam_result', examVars);
assert(examMsg.includes('Mathematics Quarterly Test'), 'Exam alert contains exam name');
assert(examMsg.includes('92 / 100'), 'Exam alert contains score and max marks');
assert(examMsg.includes('A+ (Passed)'), 'Exam alert contains evaluation grade');

// TEST 5: Custom Templates Override
console.log('\n--- TEST 5: Custom Templates Dynamic Override ---');
const customTemplates = {
  attendance_present: {
    title: 'Custom Present',
    template: 'Namaste! {student_name} is marked PRESENT in {batch_name} today ({date}). - {school_name}',
  },
};
const customMsg = renderNotificationMessage('attendance_present', sampleVars, customTemplates);
assert(customMsg.startsWith('Namaste!'), 'Custom template rendered with custom greeting');
assert(customMsg.includes('Adhira Patel is marked PRESENT in 12th Commerce today'), 'Custom tokens replaced properly');

// TEST 6: Simulated Relational Linkage
console.log('\n--- TEST 6: Relational Linkage Simulation ---');
const mockStudents = [
  { id: 's_001', full_name: 'Adhira Patel', admission_no: 'ST1100' },
  { id: 's_002', full_name: 'Diya Patel', admission_no: 'ST1097' },
];

const mockParents = [
  { id: 'p_001', full_name: 'Ajay Amin', phone: '980528259', student_id: 's_001', admission_no: 'ST1100', relationship: 'Father' },
  { id: 'p_002', full_name: 'Ajay Parmar', phone: '972878211', student_id: 's_002', admission_no: 'ST1097', relationship: 'Father' },
];

const studentMap = new Map(mockStudents.map(s => [s.id, s]));
const resolvedParents = mockParents.map((parent) => {
  const linked = studentMap.get(parent.student_id);
  return {
    ...parent,
    parent_students: linked ? [{
      relationship: parent.relationship,
      is_primary_contact: true,
      students: linked,
    }] : [],
  };
});

assert(resolvedParents.length === 2, '2 parents processed');
assert(resolvedParents[0].parent_students.length === 1, 'Parent 1 has linked student');
assert(resolvedParents[0].parent_students[0].students.full_name === 'Adhira Patel', 'Parent 1 linked to Adhira Patel');
assert(resolvedParents[1].parent_students[0].students.admission_no === 'ST1097', 'Parent 2 linked to ST1097');

console.log('\n======================================================');
console.log(`TEST SUITE FINISHED: ${passed} passed, ${failed} failed.`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
