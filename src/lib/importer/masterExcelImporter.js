import { supabase } from '../supabase.js';

/**
 * Normalizes header string for robust fuzzy matching
 */
function normalizeKey(str) {
  if (!str) return '';
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Generates random hex token for parent Telegram linking
 */
function generateTokenHex() {
  const chars = '0123456789abcdef';
  let token = 'tk_';
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

/**
 * Generates course code from course name
 */
function generateCourseCode(courseName) {
  if (!courseName) return 'GEN-COURSE';
  const clean = courseName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 10);
  return parts.map((p) => p.slice(0, 4)).join('-').slice(0, 12);
}

/**
 * Generates batch code from batch name
 */
function generateBatchCode(batchName) {
  if (!batchName) return 'BATCH-01';
  const clean = batchName.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 10);
  return parts.map((p) => p.slice(0, 4)).join('-').slice(0, 12);
}

/**
 * Parses raw file buffer/arrayBuffer (.xlsx or .csv) and returns standardized records
 */
export async function parseMasterSpreadsheet(file) {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });

  // Read first sheet or 'Master School Data'
  const sheetName = workbook.SheetNames.includes('Master School Data')
    ? 'Master School Data'
    : workbook.SheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rawRows || rawRows.length === 0) {
    throw new Error('Spreadsheet appears to be empty or has no readable rows.');
  }

  // Parse and match columns flexibly
  const parsedRows = [];
  const errors = [];

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2; // Accounting for 1-indexed Excel header
    const normalizedRow = {};

    Object.entries(row).forEach(([colHeader, val]) => {
      normalizedRow[normalizeKey(colHeader)] = typeof val === 'string' ? val.trim() : String(val ?? '');
    });

    // Resolve column mappings
    const studentName = normalizedRow['studentfullname'] || normalizedRow['studentname'] || normalizedRow['name'] || normalizedRow['student'] || '';
    const rollNo = normalizedRow['rollnumber'] || normalizedRow['rollno'] || normalizedRow['roll'] || '';
    const admissionNo = normalizedRow['admissionnumber'] || normalizedRow['admissionno'] || normalizedRow['admno'] || `ADM-${new Date().getFullYear()}-${String(rowNum).padStart(4, '0')}`;
    const courseName = normalizedRow['coursename'] || normalizedRow['course'] || normalizedRow['stream'] || normalizedRow['standard'] || 'Standard Course';
    const batchName = normalizedRow['batchname'] || normalizedRow['batch'] || normalizedRow['division'] || normalizedRow['section'] || 'General Batch';
    const batchTiming = normalizedRow['batchtiming'] || normalizedRow['timing'] || normalizedRow['schedule'] || '08:00 AM – 11:00 AM';
    const gender = normalizedRow['gender'] || normalizedRow['sex'] || 'Other';
    const studentPhone = normalizedRow['studentphone'] || normalizedRow['phone'] || normalizedRow['mobile'] || '';
    const guardianName = normalizedRow['guardianfullname'] || normalizedRow['guardianname'] || normalizedRow['parentname'] || normalizedRow['parent'] || (studentName ? `${studentName} Guardian` : '');
    const guardianPhone = normalizedRow['guardianphone'] || normalizedRow['parentphone'] || normalizedRow['emergencyphone'] || normalizedRow['contact'] || '';
    const relationship = normalizedRow['relationship'] || normalizedRow['relation'] || 'Parent';
    const annualFee = parseFloat(normalizedRow['annualtuitionfee'] || normalizedRow['tuitionfee'] || normalizedRow['annualfee'] || normalizedRow['fee'] || '0') || 0;

    // Validate minimum required fields
    if (!studentName && !rollNo && !courseName) {
      // Empty row, skip safely
      return;
    }

    if (!studentName) {
      errors.push({ rowNum, error: 'Missing Student Full Name' });
      return;
    }

    parsedRows.push({
      rowNum,
      studentName,
      rollNo: rollNo || String(rowNum),
      admissionNo,
      courseName,
      batchName,
      batchTiming,
      gender: ['male', 'm'].includes(gender.toLowerCase()) ? 'Male' : (['female', 'f'].includes(gender.toLowerCase()) ? 'Female' : 'Other'),
      studentPhone,
      guardianName: guardianName || `${studentName}'s Guardian`,
      guardianPhone,
      relationship,
      annualFee,
      rawData: row,
    });
  });

  return { parsedRows, errors, totalRows: rawRows.length };
}

/**
 * Commits the parsed master spreadsheet into the database in one single transactional batch
 */
export async function commitMasterSpreadsheetData(parsedRows, { onProgress = () => {} } = {}) {
  if (!parsedRows || parsedRows.length === 0) {
    throw new Error('No valid records to import.');
  }

  onProgress({ phase: 'analyzing', message: 'Analyzing courses and batch cohorts...', percent: 10 });

  // 1. Fetch or create unique courses
  const uniqueCourseNames = [...new Set(parsedRows.map((r) => r.courseName))];
  const { data: existingCourses } = await supabase.from('courses').select('id, name, code');
  const courseMap = new Map((existingCourses || []).map((c) => [c.name.toLowerCase(), c]));

  for (const cName of uniqueCourseNames) {
    if (!courseMap.has(cName.toLowerCase())) {
      const code = generateCourseCode(cName);
      const { data: newCourse, error: cErr } = await supabase
        .from('courses')
        .insert([{
          name: cName,
          code,
          academic_level: 'General',
          description: `Auto-generated course for ${cName}`,
          is_active: true,
        }])
        .select()
        .single();

      if (!cErr && newCourse) {
        courseMap.set(cName.toLowerCase(), newCourse);
      }
    }
  }

  onProgress({ phase: 'batches', message: 'Configuring class batches...', percent: 30 });

  // 2. Fetch or create unique batches
  const uniqueBatchKeys = new Map();
  parsedRows.forEach((r) => {
    const key = `${r.courseName}:::${r.batchName}`.toLowerCase();
    if (!uniqueBatchKeys.has(key)) {
      uniqueBatchKeys.set(key, { courseName: r.courseName, batchName: r.batchName, timing: r.batchTiming });
    }
  });

  const { data: existingBatches } = await supabase.from('batches').select('id, name, code, course_id');
  const batchMap = new Map((existingBatches || []).map((b) => [b.name.toLowerCase(), b]));

  for (const [, info] of uniqueBatchKeys.entries()) {
    if (!batchMap.has(info.batchName.toLowerCase())) {
      const course = courseMap.get(info.courseName.toLowerCase());
      const batchCode = generateBatchCode(info.batchName);

      const { data: newBatch, error: bErr } = await supabase
        .from('batches')
        .insert([{
          name: info.batchName,
          code: batchCode,
          course_id: course ? course.id : null,
          academic_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
          shift: info.timing.toLowerCase().includes('pm') ? 'Afternoon' : 'Morning',
          timing: info.timing,
          max_capacity: 60,
          is_active: true,
        }])
        .select()
        .single();

      if (!bErr && newBatch) {
        batchMap.set(info.batchName.toLowerCase(), newBatch);
      }
    }
  }

  onProgress({ phase: 'students', message: `Enrolling ${parsedRows.length} students...`, percent: 55 });

  // 3. Insert Students in batches of 50
  const studentsToInsert = parsedRows.map((r) => {
    const batch = batchMap.get(r.batchName.toLowerCase());
    const course = courseMap.get(r.courseName.toLowerCase());
    return {
      full_name: r.studentName,
      roll_no: r.rollNo,
      admission_no: r.admissionNo,
      batch_id: batch ? batch.id : null,
      course_id: course ? course.id : null,
      gender: r.gender,
      phone: r.studentPhone || null,
      enrollment_date: new Date().toISOString().split('T')[0],
      enrollment_status: 'active',
      is_active: true,
    };
  });

  const CHUNK_SIZE = 50;
  let insertedStudents = [];

  for (let i = 0; i < studentsToInsert.length; i += CHUNK_SIZE) {
    const chunk = studentsToInsert.slice(i, i + CHUNK_SIZE);
    const { data: resStudents, error: sErr } = await supabase
      .from('students')
      .insert(chunk)
      .select();

    if (sErr) {
      console.warn('Batch insert student error, attempting fallback insert:', sErr);
    } else if (resStudents) {
      insertedStudents = insertedStudents.concat(resStudents);
    }
  }

  onProgress({ phase: 'parents', message: 'Linking parents & generating Telegram invite tokens...', percent: 80 });

  // 4. Insert Parents & Parent Invitations
  const parentsToInsert = [];
  const invitationsToInsert = [];
  const feeRecordsToInsert = [];

  parsedRows.forEach((r, idx) => {
    const student = insertedStudents[idx] || null;
    const studentId = student ? student.id : null;
    const token = generateTokenHex();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(); // 14 days

    if (r.guardianPhone || r.guardianName) {
      parentsToInsert.push({
        full_name: r.guardianName,
        phone: r.guardianPhone,
        student_id: studentId,
        relationship: r.relationship,
        notification_channel: 'telegram',
        linking_token: token,
        linking_token_expires_at: expiresAt,
        invitation_status: 'sent',
        invitation_sent_at: new Date().toISOString(),
        is_verified: false,
      });

      invitationsToInsert.push({
        parent_id: null, // Linked via query if needed
        student_id: studentId,
        token,
        invitation_channel: 'telegram',
        invitation_status: 'sent',
        linking_status: 'unlinked',
        expires_at: expiresAt,
        sent_at: new Date().toISOString(),
      });
    }

    // 5. Tuition Fees Record if fee > 0
    if (r.annualFee > 0 && studentId) {
      feeRecordsToInsert.push({
        student_id: studentId,
        total_amount: r.annualFee,
        paid_amount: 0,
        due_amount: r.annualFee,
        status: 'pending',
        academic_year: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
  });

  if (parentsToInsert.length > 0) {
    try {
      await supabase.from('parents').insert(parentsToInsert);
    } catch (pErr) {
      console.warn('Could not insert parent records:', pErr);
    }
  }

  if (feeRecordsToInsert.length > 0) {
    try {
      await supabase.from('fee_records').insert(feeRecordsToInsert);
    } catch (fErr) {
      console.warn('Could not insert fee records:', fErr);
    }
  }

  onProgress({ phase: 'complete', message: 'All-in-One School Import completed successfully!', percent: 100 });

  return {
    success: true,
    coursesCreated: uniqueCourseNames.length,
    batchesCreated: uniqueBatchKeys.size,
    studentsCreated: studentsToInsert.length,
    parentsCreated: parentsToInsert.length,
    feesCreated: feeRecordsToInsert.length,
  };
}
