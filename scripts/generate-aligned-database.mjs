import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';

const excelPath = 'C:/Users/dusha/Downloads/sms_students_complete.xlsx';
const wb = xlsx.readFile(excelPath);
const excelRows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

const CANONICAL_COURSES = [
  { id: 'C11', name: '11th Commerce', code: '11-COM', level: 'Higher Secondary' },
  { id: 'C12', name: '12th Commerce', code: '12-COM', level: 'Higher Secondary' },
  { id: 'CFY', name: 'First Year — Bachelor of Computer Applications', code: 'FY-BCA', level: 'Undergraduate' },
  { id: 'CSY', name: 'Second Year — Bachelor of Computer Applications', code: 'SY-BCA', level: 'Undergraduate' },
  { id: 'CTY', name: 'Third Year — Bachelor of Computer Applications', code: 'TY-BCA', level: 'Undergraduate' },
];

const CANONICAL_BATCHES = [
  {
    id: 'B11',
    code: '11-COM',
    name: '11th Commerce',
    course_id: 'C11',
    timing: '08:00 AM - 10:30 AM',
    classroom: 'Room 101',
    max_capacity: 40,
    is_active: true,
  },
  {
    id: 'B12',
    code: '12-COM',
    name: '12th Commerce',
    course_id: 'C12',
    timing: '11:00 AM - 01:30 PM',
    classroom: 'Room 102',
    max_capacity: 40,
    is_active: true,
  },
  {
    id: 'BFY',
    code: 'FY-BCA',
    name: 'FY',
    course_id: 'CFY',
    timing: '08:00 AM - 10:30 AM',
    classroom: 'Room 201',
    max_capacity: 40,
    is_active: true,
  },
  {
    id: 'BSY',
    code: 'SY-BCA',
    name: 'SY',
    course_id: 'CSY',
    timing: '11:00 AM - 01:30 PM',
    classroom: 'Room 202',
    max_capacity: 40,
    is_active: true,
  },
  {
    id: 'BTY',
    code: 'TY-BCA',
    name: 'TY',
    course_id: 'CTY',
    timing: '02:00 PM - 04:30 PM',
    classroom: 'Room 203',
    max_capacity: 40,
    is_active: true,
  },
];

const CANONICAL_STUDENTS = [];

for (let i = 0; i < excelRows.length; i++) {
  const r = excelRows[i];
  const batchIdx = i % 5;
  const bDef = CANONICAL_BATCHES[batchIdx];
  const sId = r['Student ID'];

  let sName = r['Student Name'];
  let phone = String(r['Contact Number'] || '9876543210').trim();
  let parentName = r['Parent Name'] || 'Parent';
  let email = r['Email ID'] || (sId.toLowerCase() + '@gmail.com');

  if (sId === 'ST1019') {
    sName = 'Dhruv Shah';
    phone = '8866039007';
    parentName = 'Uday shah';
    email = 'dhruv.shah@gmail.com';
  }

  CANONICAL_STUDENTS.push({
    id: sId,
    admission_no: sId,
    roll_no: Number(r['Roll No'] || (i + 1)),
    full_name: sName,
    batch_id: bDef.id,
    batch_name: bDef.name,
    gender: r['Gender'] || 'Male',
    contact_number: phone,
    parent_name: parentName,
    email: email,
  });
}

// 1. Generate src/data/canonicalSchoolData.js
const canonicalJsContent = `/**
 * SMS — Student Management System
 * Production Canonical School Cohort & Student Roster
 * 
 * 100% synchronized with PC Desktop EXE and Android Mobile App.
 * Contains 5 Batches (20 Students each = 100 total students)
 * Aligns ST1019 as Dhruv Shah in SY (BSY) and exact B11 20-student cohort.
 */

export const CANONICAL_COURSES = ${JSON.stringify(CANONICAL_COURSES, null, 2)};

export const CANONICAL_BATCHES = ${JSON.stringify(CANONICAL_BATCHES, null, 2)};

export const CANONICAL_STUDENTS = ${JSON.stringify(CANONICAL_STUDENTS, null, 2)};

/**
 * Helper to fetch canonical students by batch ID or code
 */
export function getBatchStudents(batchIdentifier) {
  if (!batchIdentifier) return [];
  const cleanId = String(batchIdentifier).trim().toLowerCase();
  
  return CANONICAL_STUDENTS.filter((s) => {
    const bId = String(s.batch_id).trim().toLowerCase();
    const bName = String(s.batch_name).trim().toLowerCase();
    return bId === cleanId || bName === cleanId || (cleanId.includes('11') && (bId === 'b11' || bName.includes('11')));
  });
}

/**
 * Helper to get batch details by ID or code
 */
export function getBatchById(batchIdentifier) {
  if (!batchIdentifier) return null;
  const clean = String(batchIdentifier).trim().toLowerCase();
  return CANONICAL_BATCHES.find(
    (b) => b.id.toLowerCase() === clean || b.code.toLowerCase() === clean || b.name.toLowerCase() === clean
  ) || null;
}
`;

fs.writeFileSync(path.resolve('src/data/canonicalSchoolData.js'), canonicalJsContent, 'utf-8');
console.log('✅ Generated src/data/canonicalSchoolData.js');

// 2. Generate src/data/school_database.json
const schoolDbJson = {
  version: 2,
  lastModified: new Date().toISOString(),
  academy: {
    name: 'SMS International Academy',
    code: 'SMS-DEMO-2026',
    address: 'Near City Center, Rajkot, Gujarat',
    phone: '+91 8866039007',
  },
  courses: CANONICAL_COURSES,
  batches: CANONICAL_BATCHES,
  students: CANONICAL_STUDENTS,
};

fs.writeFileSync(path.resolve('src/data/school_database.json'), JSON.stringify(schoolDbJson, null, 2), 'utf-8');
console.log('✅ Generated src/data/school_database.json');
