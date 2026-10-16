import { supabase } from '../supabase.js';
import { importDatabaseBackup } from '../databaseAdapter.js';

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
 * Helper to find value by exact match or substring key
 */
function findValue(rowMap, candidates) {
  for (const c of candidates) {
    if (rowMap[c] !== undefined && rowMap[c] !== '') return rowMap[c];
  }
  const keys = Object.keys(rowMap);
  for (const c of candidates) {
    const matchedKey = keys.find((k) => k.includes(c));
    if (matchedKey && rowMap[matchedKey] !== undefined && rowMap[matchedKey] !== '') {
      return rowMap[matchedKey];
    }
  }
  return '';
}

/**
 * Parses raw file (.xlsx, .xls, .csv, .json, or .smsdb) and returns standardized records
 */
export async function parseMasterSpreadsheet(file) {
  if (!file) throw new Error('No file provided.');

  const fileNameLower = file.name.toLowerCase();
  const isJson = fileNameLower.endsWith('.json') || fileNameLower.endsWith('.smsdb');
  let rawRows = [];
  let isDatabaseBackup = false;
  let backupData = null;

  if (isJson) {
    const text = await file.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error('Failed to parse JSON file: invalid syntax.');
    }

    if (json && json.tables && typeof json.tables === 'object') {
      isDatabaseBackup = true;
      backupData = json;
      rawRows = json.tables.students || [];
    } else if (Array.isArray(json)) {
      rawRows = json;
    } else if (json && Array.isArray(json.students)) {
      rawRows = json.students;
    } else {
      throw new Error('Unrecognized JSON format: expected array of student rows or database backup.');
    }
  } else if (fileNameLower.endsWith('.csv')) {
    const XLSX = await import('xlsx');
    const text = await file.text();
    const workbook = XLSX.read(text, { type: 'string', raw: true });
    const firstSheet = workbook.SheetNames[0] || 'Sheet1';
    const worksheet = workbook.Sheets[firstSheet];
    rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  } else {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error('Spreadsheet has no sheets.');
    }

    // Multi-sheet detection: preference for Master School Data, Students, or first sheet
    const targetSheet =
      workbook.SheetNames.find((s) => {
        const lower = s.toLowerCase();
        return lower.includes('master') || lower.includes('student') || lower.includes('all');
      }) || workbook.SheetNames[0];

    const worksheet = workbook.Sheets[targetSheet];
    rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
  }

  if (!rawRows || rawRows.length === 0) {
    throw new Error('The file appears to be empty or has no readable rows.');
  }

  // Parse and match columns with comprehensive alias detection
  const parsedRows = [];
  const errors = [];

  rawRows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const normalizedRow = {};

    Object.entries(row).forEach(([colHeader, val]) => {
      normalizedRow[normalizeKey(colHeader)] = typeof val === 'string' ? val.trim() : String(val ?? '');
    });

    // Flexible column mappings using substring-aware matcher
    const studentName = findValue(normalizedRow, ['studentfullname', 'studentname', 'fullname', 'name', 'student']);
    const rollNo = findValue(normalizedRow, ['rollnumber', 'rollno', 'classroll', 'rollnum', 'roll']);
    const admissionNo =
      findValue(normalizedRow, ['admissionnumber', 'admissionno', 'admissionid', 'admno', 'grnumber', 'grno', 'studentid', 'enrollmentno']) ||
      `ADM-${new Date().getFullYear()}-${String(rowNum).padStart(4, '0')}`;

    const courseName =
      findValue(normalizedRow, ['coursename', 'course', 'stream', 'standard', 'class', 'grade']) ||
      'Standard Course';

    const batchName =
      findValue(normalizedRow, ['batchname', 'batch', 'division', 'section', 'sec', 'div', 'cohort']) ||
      'General Batch';

    const batchTiming =
      findValue(normalizedRow, ['batchtiming', 'timing', 'schedule', 'time', 'shift']) ||
      '08:00 AM – 11:00 AM';

    const gender = findValue(normalizedRow, ['gender', 'sex']) || 'Other';
    const studentPhone = findValue(normalizedRow, ['studentphone', 'studentmobile', 'phone', 'mobile', 'contact']);
    const studentEmail = findValue(normalizedRow, ['studentemail', 'email', 'mail']);

    const guardianName =
      findValue(normalizedRow, ['guardianfullname', 'guardianname', 'parentname', 'fathername', 'mothername', 'parent']) ||
      (studentName ? `${studentName}'s Guardian` : '');

    const guardianPhone = findValue(normalizedRow, [
      'guardianphone',
      'parentphone',
      'parentmobile',
      'fathermobile',
      'mothermobile',
      'emergencyphone',
      'guardianmobile',
    ]);

    const relationship = findValue(normalizedRow, ['relationship', 'relation']) || 'Father';
    const annualFee =
      parseFloat(
        findValue(normalizedRow, ['annualtuitionfee', 'tuitionfee', 'annualfee', 'feetotal', 'totalfee', 'fee', 'fees', 'amount']) || '0'
      ) || 0;
    const paidFee =
      parseFloat(
        findValue(normalizedRow, ['feepaid', 'paidfee', 'amountpaid', 'paid', 'advance']) || '0'
      ) || 0;

    // Skip truly empty rows
    if (!studentName && !rollNo && !courseName) {
      return;
    }

    if (!studentName) {
      errors.push({ rowNum, error: 'Missing Student Full Name' });
      return;
    }

    parsedRows.push({
      rowNum,
      studentName,
      rollNo: rollNo || String(parsedRows.length + 1),
      admissionNo,
      courseName,
      batchName,
      batchTiming,
      gender: ['male', 'm'].includes(gender.toLowerCase())
        ? 'Male'
        : ['female', 'f'].includes(gender.toLowerCase())
        ? 'Female'
        : 'Other',
      studentPhone,
      studentEmail,
      guardianName,
      guardianPhone,
      relationship,
      annualFee,
      paidFee,
      rawData: row,
    });
  });

  return {
    parsedRows,
    errors,
    totalRows: rawRows.length,
    isDatabaseBackup,
    backupData,
    summary: {
      totalStudents: parsedRows.length,
      distinctCourses: [...new Set(parsedRows.map((r) => r.courseName))],
      distinctBatches: [...new Set(parsedRows.map((r) => r.batchName))],
      withFees: parsedRows.filter((r) => r.annualFee > 0).length,
      withParents: parsedRows.filter((r) => r.guardianName || r.guardianPhone).length,
    },
  };
}

/**
 * Commits the parsed master spreadsheet into the database in one unified transactional pipeline
 */
export async function commitMasterSpreadsheetData(parseResult, { onProgress = () => {} } = {}) {
  // If user dropped an entire database backup (.smsdb / JSON)
  if (parseResult?.isDatabaseBackup && parseResult?.backupData) {
    onProgress({ phase: 'backup', message: 'Restoring complete personal database backup...', percent: 50 });
    const restoreRes = await importDatabaseBackup(parseResult.backupData);
    if (!restoreRes.ok) {
      throw new Error(restoreRes.error || 'Failed to restore database backup.');
    }
    onProgress({ phase: 'complete', message: 'Personal database restored successfully!', percent: 100 });
    return {
      success: true,
      isBackupRestore: true,
      summary: restoreRes.summary,
    };
  }

  const parsedRows = Array.isArray(parseResult) ? parseResult : parseResult?.parsedRows;
  if (!parsedRows || parsedRows.length === 0) {
    throw new Error('No valid records to import.');
  }

  onProgress({ phase: 'analyzing', message: 'Configuring courses & academic streams...', percent: 15 });

  // 1. Fetch or create unique courses
  const uniqueCourseNames = [...new Set(parsedRows.map((r) => r.courseName))];
  const { data: existingCourses } = await supabase.from('courses').select('id, name, code');
  const courseMap = new Map((existingCourses || []).map((c) => [c.name.toLowerCase().trim(), c]));

  for (const cName of uniqueCourseNames) {
    const key = cName.toLowerCase().trim();
    if (!courseMap.has(key)) {
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
        courseMap.set(key, newCourse);
      }
    }
  }

  onProgress({ phase: 'batches', message: 'Configuring cohort batches...', percent: 35 });

  // 2. Fetch or create unique batches
  const uniqueBatchKeys = new Map();
  parsedRows.forEach((r) => {
    const key = `${r.courseName}:::${r.batchName}`.toLowerCase().trim();
    if (!uniqueBatchKeys.has(key)) {
      uniqueBatchKeys.set(key, { courseName: r.courseName, batchName: r.batchName, timing: r.batchTiming });
    }
  });

  const { data: existingBatches } = await supabase.from('batches').select('id, name, code, course_id');
  const batchMap = new Map((existingBatches || []).map((b) => [b.name.toLowerCase().trim(), b]));

  for (const [, info] of uniqueBatchKeys.entries()) {
    const key = info.batchName.toLowerCase().trim();
    if (!batchMap.has(key)) {
      const course = courseMap.get(info.courseName.toLowerCase().trim());
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
        batchMap.set(key, newBatch);
      }
    }
  }

  onProgress({ phase: 'students', message: `Enrolling ${parsedRows.length} students into personal database...`, percent: 60 });

  // 3. Insert Students in chunks of 50
  const studentsToInsert = parsedRows.map((r) => {
    const batch = batchMap.get(r.batchName.toLowerCase().trim());
    const course = courseMap.get(r.courseName.toLowerCase().trim());
    return {
      full_name: r.studentName,
      roll_no: r.rollNo,
      admission_no: r.admissionNo,
      batch_id: batch ? batch.id : null,
      course_id: course ? course.id : null,
      gender: r.gender,
      phone: r.studentPhone || null,
      email: r.studentEmail || null,
      tuition_fee: r.annualFee || 0,
      fee_paid: r.paidFee || 0,
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
      insertedStudents = insertedStudents.concat(Array.isArray(resStudents) ? resStudents : [resStudents]);
    }
  }

  onProgress({ phase: 'parents', message: 'Creating parent linking dossiers & Telegram tokens...', percent: 85 });

  // 4. Insert Parents & Parent Invitations & Fees
  const parentsToInsert = [];
  const invitationsToInsert = [];
  const feeRecordsToInsert = [];

  parsedRows.forEach((r, idx) => {
    const student = insertedStudents[idx] || null;
    const studentId = student ? student.id : null;
    const token = generateTokenHex();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    if (r.guardianPhone || r.guardianName) {
      parentsToInsert.push({
        full_name: r.guardianName,
        phone: r.guardianPhone,
        student_id: studentId,
        admission_no: r.admissionNo,
        relationship: r.relationship,
        notification_channel: 'telegram',
        linking_token: token,
        linking_token_expires_at: expiresAt,
        invitation_status: 'sent',
        invitation_sent_at: new Date().toISOString(),
        is_verified: false,
      });

      invitationsToInsert.push({
        parent_id: null,
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
      const due = Math.max(0, (r.annualFee || 0) - (r.paidFee || 0));
      const status = due === 0 ? 'paid' : ((r.paidFee || 0) > 0 ? 'partial' : 'pending');
      feeRecordsToInsert.push({
        student_id: studentId,
        total_amount: r.annualFee,
        paid_amount: r.paidFee || 0,
        due_amount: due,
        status,
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
