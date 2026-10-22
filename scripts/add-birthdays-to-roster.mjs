import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const canonicalPath = path.join(rootDir, 'src/data/canonicalSchoolData.js');
let content = fs.readFileSync(canonicalPath, 'utf-8');

// Parse the file or regex replace CANONICAL_STUDENTS
import { CANONICAL_BATCHES, CANONICAL_COURSES, CANONICAL_PARENTS, CANONICAL_PARENT_STUDENTS, CANONICAL_STUDENTS } from '../src/data/canonicalSchoolData.js';

// Base birth years by batch
const birthYearMap = {
  B11: 2008, // 11th Grade ~16 years old
  B12: 2007, // 12th Grade ~17 years old
  BFY: 2006, // FY ~18 years old
  BSY: 2005, // SY ~19 years old
  BTY: 2004, // TY ~20 years old
};

const updatedStudents = CANONICAL_STUDENTS.map((s, idx) => {
  const baseYear = birthYearMap[s.batch_id] || 2006;
  let dob;

  if (s.id === 'ST1001') {
    // Today's birthday: October 22
    dob = `${baseYear}-10-22`;
  } else if (s.id === 'ST1025') {
    // Also today's birthday: October 22
    dob = `${baseYear}-10-22`;
  } else if (s.id === 'ST1042') {
    // Tomorrow's birthday: October 23
    dob = `${baseYear}-10-23`;
  } else {
    // Spread evenly across the year
    const month = (idx % 12) + 1;
    const day = (idx % 28) + 1;
    dob = `${baseYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return {
    ...s,
    dob,
  };
});

// Re-generate file preserving export declarations
const newContent = `/**
 * SMS — Canonical School Batches & Student Roster
 * Embedded institutional data from official school records.
 * 5 Cohort Batches & 100 Enrolled Students (20 students per batch).
 */

export const CANONICAL_COURSES = ${JSON.stringify(CANONICAL_COURSES, null, 2)};

export const CANONICAL_BATCHES = ${JSON.stringify(CANONICAL_BATCHES, null, 2)};

export const CANONICAL_STUDENTS = ${JSON.stringify(updatedStudents, null, 2)};

export const CANONICAL_PARENTS = ${JSON.stringify(CANONICAL_PARENTS, null, 2)};

export const CANONICAL_PARENT_STUDENTS = ${JSON.stringify(CANONICAL_PARENT_STUDENTS, null, 2)};

export function getBatchStudents(batchId) {
  if (!batchId) return [];
  const normalized = String(batchId).trim().toUpperCase();
  return CANONICAL_STUDENTS.filter((s) => {
    return (
      s.batch_id.toUpperCase() === normalized ||
      s.batch_code.toUpperCase() === normalized ||
      s.batch_name.toUpperCase() === normalized
    );
  });
}
`;

fs.writeFileSync(canonicalPath, newContent, 'utf-8');
console.log(`✓ Updated ${updatedStudents.length} canonical students with DOB in canonicalSchoolData.js`);

// Also update AppData local school_database.json if present
const appDataDir = path.join(
  process.env.APPDATA || 'C:\\Users\\dusha\\AppData\\Roaming',
  'com.sms.studentmanagementsystem'
);

const appDbPath = path.join(appDataDir, 'school_database.json');
if (fs.existsSync(appDbPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(appDbPath, 'utf-8'));
    raw.students = updatedStudents;
    fs.writeFileSync(appDbPath, JSON.stringify(raw, null, 2), 'utf-8');
    console.log(`✓ Synchronized DOB into ${appDbPath}`);
  } catch (e) {
    console.warn('Failed to update appData school_database.json:', e);
  }
}
