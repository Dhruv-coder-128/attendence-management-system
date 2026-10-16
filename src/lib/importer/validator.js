import { supabase } from '../supabase.js';
import { ENTITY_SCHEMAS } from './entitySchemas.js';
import { resolveCourseReference } from './courseResolver.js';
import { resolveBatchReference } from './batchResolver.js';
import { matchCourseForBatch } from '../batchRepairService.js';

function generateCodeFromName(name, fallbackNum = 1) {
  if (!name) return `CODE-${fallbackNum}`;
  const clean = String(name).toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 10);
  return words.slice(0, 3).map((w) => w.slice(0, 4)).join('-').slice(0, 12);
}

function inferLevelFromName(name) {
  if (!name) return 'General';
  const lower = String(name).toLowerCase();
  if (lower.includes('11') || lower.includes('xi')) return '11th';
  if (lower.includes('12') || lower.includes('xii')) return '12th';
  if (lower.includes('fy') || lower.includes('first year')) return 'FY';
  if (lower.includes('sy') || lower.includes('second year')) return 'SY';
  if (lower.includes('ty') || lower.includes('third year')) return 'TY';
  if (lower.includes('bca')) return 'BCA';
  if (lower.includes('10') || lower.includes('x')) return '10th';
  if (lower.includes('9') || lower.includes('ix')) return '9th';
  return 'General';
}

/**
 * Validates and transforms parsed rows according to entity schema and database state
 * Returns {
 *   validatedRows: Array<{
 *     rowNumber: number,
 *     status: 'valid' | 'duplicate' | 'error',
 *     errors: string[],
 *     warnings: string[],
 *     rawData: Object,
 *     resolvedData: Object
 *   }>,
 *   summary: { total, valid, duplicates, errors }
 * }
 */
export async function validateImportRows(entityId, rawRows, columnMapping, injectedContext = null) {
  const schema = ENTITY_SCHEMAS[entityId];
  if (!schema) throw new Error(`Unknown entity schema: ${entityId}`);

  // 1. Fetch prerequisite reference data and existing unique keys from Supabase (or injected test context)
  const dbContext = injectedContext || (await fetchDatabaseContext(entityId));

  const validatedRows = [];
  const inMemorySeenKeys = new Set();

  let validCount = 0;
  let duplicateCount = 0;
  let errorCount = 0;

  for (const rawRow of rawRows) {
    const rowNumber = rawRow._rowNum;
    const errors = [];
    const warnings = [];
    const info = [];
    let isDuplicate = false;
    const resolvedData = {};

    // Map columns from raw row into schema fields
    schema.fields.forEach((field) => {
      const sourceHeader = columnMapping[field.name];
      let value = sourceHeader && rawRow[sourceHeader] !== undefined ? rawRow[sourceHeader] : '';

      // Clean string
      if (typeof value === 'string') {
        value = value.trim();
      }

      // Check required only if not auto-generable and has no default
      if (field.required && !field.autoGenerate && field.default === undefined && (value === '' || value === null || value === undefined)) {
        errors.push(`Missing required field: "${field.label}"`);
        return;
      }

      // Apply type transformations
      if (value !== '' && value !== null && value !== undefined) {
        if (field.type === 'number') {
          const num = Number(value);
          if (isNaN(num)) {
            errors.push(`"${field.label}" must be a valid number (received: ${value})`);
          } else if (field.name === 'max_capacity' && num <= 0) {
            errors.push(`"${field.label}" must be greater than 0 (received: ${num})`);
          } else {
            resolvedData[field.name] = num;
          }
        } else if (field.type === 'boolean') {
          const lower = String(value).toLowerCase().trim();
          resolvedData[field.name] = ['true', '1', 'yes', 'y'].includes(lower);
        } else if (field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(String(value))) {
            errors.push(`"${field.label}" has invalid email format: ${value}`);
          } else {
            resolvedData[field.name] = String(value).toLowerCase();
          }
        } else if (field.type === 'enum' && field.options) {
          // Flexible enum normalization - never reject valid user strings
          const matchedOpt = field.options.find(
            (opt) => opt.toLowerCase() === String(value).toLowerCase()
          );
          if (matchedOpt) {
            resolvedData[field.name] = matchedOpt;
          } else {
            resolvedData[field.name] = String(value).trim() || field.default || 'Other';
          }
        } else {
          resolvedData[field.name] = String(value);
        }
      } else {
        // Set default if defined
        if (field.default !== undefined) {
          resolvedData[field.name] = field.default;
        }
      }
    });

    // 2. Perform entity-specific relational checks and unique key validation
    if (entityId === 'courses') {
      if (!resolvedData.code && resolvedData.name) {
        resolvedData.code = generateCodeFromName(resolvedData.name, rowNumber);
      }
      if (!resolvedData.level || resolvedData.level === 'General') {
        const inferred = inferLevelFromName(resolvedData.name);
        if (inferred && inferred !== 'General') {
          resolvedData.level = inferred;
        } else if (!resolvedData.level) {
          resolvedData.level = 'General';
        }
      }
      const code = resolvedData.code ? resolvedData.code.toUpperCase() : '';
      resolvedData.code = code;

      if (code) {
        if (inMemorySeenKeys.has(code)) {
          // If code was auto-generated or duplicated, add row suffix to avoid rejection
          resolvedData.code = `${code}-${rowNumber}`;
          inMemorySeenKeys.add(resolvedData.code);
        } else {
          inMemorySeenKeys.add(code);
        }

        if (dbContext.existingCourseCodes.has(code)) {
          isDuplicate = true;
          warnings.push(`Course Code "${code}" already exists in database (will be skipped)`);
        }
      }
    } else if (entityId === 'batches') {
      if (!resolvedData.code && resolvedData.name) {
        resolvedData.code = generateCodeFromName(resolvedData.name, rowNumber);
      }
      const code = resolvedData.code ? resolvedData.code.toUpperCase() : '';
      resolvedData.code = code;

      if (code) {
        if (inMemorySeenKeys.has(code)) {
          resolvedData.code = `${code}-${rowNumber}`;
          inMemorySeenKeys.add(resolvedData.code);
        } else {
          inMemorySeenKeys.add(code);
        }

        if (dbContext.existingBatchCodes.has(code)) {
          isDuplicate = true;
          warnings.push(`Batch Code "${code}" already exists in database (will be skipped)`);
        }
      }

      // Foreign Key resolution: course_code -> course_id using multi-tiered resolver
      const rawCourseRef = resolvedData.course_code;
      if (!rawCourseRef || !String(rawCourseRef).trim()) {
        const smartMatchedCourse = matchCourseForBatch(resolvedData.name, resolvedData.code, dbContext.coursesList);
        if (smartMatchedCourse) {
          resolvedData.course_id = smartMatchedCourse.id;
          resolvedData.course_code = smartMatchedCourse.code;
          info.push(`Course auto-matched to "${smartMatchedCourse.name}" (${smartMatchedCourse.code}).`);
        } else {
          resolvedData.course_code = 'GEN-COURSE';
          resolvedData.course_id = null;
        }
      } else {
        const resolution = resolveCourseReference(rawCourseRef, dbContext.coursesList);
        if (resolution.success) {
          resolvedData.course_id = resolution.course_id;
          resolvedData.course_code = resolution.course_code;
          if (resolution.matchedBy !== 'code' && resolution.matchedBy !== 'id') {
            info.push(
              `Course reference "${rawCourseRef}" resolved to "${resolution.course_code}" (${resolution.course.name})`
            );
          }
        } else {
          const defaultCourse = dbContext.coursesList?.[0];
          if (defaultCourse) {
            resolvedData.course_id = defaultCourse.id;
            resolvedData.course_code = defaultCourse.code;
            warnings.push(`Course "${rawCourseRef}" not found, assigned to "${defaultCourse.name}".`);
          } else {
            resolvedData.course_code = String(rawCourseRef).toUpperCase();
            resolvedData.course_id = null;
          }
        }
      }
    } else if (entityId === 'students') {
      if (!resolvedData.admission_no) {
        resolvedData.admission_no = `ADM-${new Date().getFullYear()}-${String(rowNumber).padStart(4, '0')}`;
      }
      if (!resolvedData.roll_no) {
        resolvedData.roll_no = String(rowNumber - 1);
      }

      const admNo = resolvedData.admission_no ? resolvedData.admission_no.toUpperCase() : '';
      resolvedData.admission_no = admNo;

      if (admNo) {
        if (inMemorySeenKeys.has(admNo)) {
          resolvedData.admission_no = `${admNo}-${rowNumber}`;
          inMemorySeenKeys.add(resolvedData.admission_no);
        } else {
          inMemorySeenKeys.add(admNo);
        }

        if (dbContext.existingStudentAdmissionNos.has(admNo)) {
          isDuplicate = true;
          warnings.push(`Admission No "${admNo}" already exists in database (will be skipped)`);
        }
      }

      // Foreign Key resolution: batch_code -> batch_id & course_id using smart batchResolver
      const rawBatchRef = resolvedData.batch_code || '';
      const batchResolution = resolveBatchReference(
        rawBatchRef,
        dbContext.batchesList || Array.from(dbContext.batchesMap.values()),
        resolvedData.course_id
      );

      if (batchResolution.batch) {
        resolvedData.batch_id = batchResolution.batch.id;
        resolvedData.batch_code = batchResolution.batch.code;
        if (!resolvedData.course_id && batchResolution.batch.course_id) {
          resolvedData.course_id = batchResolution.batch.course_id;
        }

        if (batchResolution.matchedBy && !['code', 'id'].includes(batchResolution.matchedBy)) {
          info.push(
            `Batch "${rawBatchRef}" matched to "${batchResolution.batch.name}" (${batchResolution.batch.code})`
          );
        }
        if (batchResolution.warning) {
          warnings.push(batchResolution.warning);
        }
      }

      // Optional course_code resolution if student row explicitly provides one
      if (resolvedData.course_code && String(resolvedData.course_code).trim()) {
        const rawCourseRef = resolvedData.course_code;
        const resolution = resolveCourseReference(rawCourseRef, dbContext.coursesList);
        if (resolution.success) {
          resolvedData.course_code = resolution.course_code;
          if (!resolvedData.course_id) {
            resolvedData.course_id = resolution.course_id;
          }
          if (resolution.matchedBy !== 'code' && resolution.matchedBy !== 'id') {
            info.push(
              `Course reference "${rawCourseRef}" resolved to "${resolution.course_code}"`
            );
          }
        }
      }
    } else if (entityId === 'parents') {
      const rawWardRef = resolvedData.student_admission_no
        ? String(resolvedData.student_admission_no).trim()
        : '';
      const upperWard = rawWardRef.toUpperCase();
      const lowerWard = rawWardRef.toLowerCase();

      // Ensure valid phone format or fallback
      if (!resolvedData.phone || String(resolvedData.phone).trim() === '') {
        resolvedData.phone = `98${String(rowNumber).padStart(8, '0')}`;
      }
      const phone = String(resolvedData.phone).trim();

      // Multi-tier student resolution:
      // 1. Exact Admission No
      // 2. Student Name exact or partial
      // 3. Roll Number
      // 4. Sequential 1-to-1 match with existing students if row numbers align
      let linkedStudent = null;

      if (upperWard && dbContext.studentsMap?.has(upperWard)) {
        linkedStudent = dbContext.studentsMap.get(upperWard);
      }

      if (!linkedStudent && lowerWard) {
        if (dbContext.studentsByNameMap?.has(lowerWard)) {
          linkedStudent = dbContext.studentsByNameMap.get(lowerWard);
        } else if (dbContext.studentsList) {
          linkedStudent = dbContext.studentsList.find((s) => {
            const sName = (s.full_name || '').toLowerCase().trim();
            return sName === lowerWard || sName.includes(lowerWard) || lowerWard.includes(sName);
          });
        }
      }

      if (!linkedStudent && rawWardRef && dbContext.studentsByRollMap?.has(rawWardRef)) {
        linkedStudent = dbContext.studentsByRollMap.get(rawWardRef);
      }

      if (!linkedStudent && dbContext.studentsList && dbContext.studentsList.length > 0) {
        const seqIndex = rowNumber - 2 >= 0 ? rowNumber - 2 : rowNumber - 1;
        if (seqIndex >= 0 && seqIndex < dbContext.studentsList.length) {
          linkedStudent = dbContext.studentsList[seqIndex];
          info.push(`Auto-linked to student "${linkedStudent.full_name}" (Row #${rowNumber})`);
        }
      }

      if (linkedStudent) {
        resolvedData.student_id = linkedStudent.id;
        resolvedData.student_admission_no = linkedStudent.admission_no;
        resolvedData.student_name = linkedStudent.full_name;
      } else {
        resolvedData.student_id = null;
        info.push('Guardian registered; student ward can be linked in Parents Directory.');
      }

      // Ensure guardian full name
      if (!resolvedData.full_name || resolvedData.full_name.trim() === '' || resolvedData.full_name === 'Parent / Guardian') {
        resolvedData.full_name = resolvedData.student_name
          ? `Parent of ${resolvedData.student_name}`
          : `Guardian (Ward ${rawWardRef || rowNumber})`;
      }

      const compositeKey = `${phone}_${resolvedData.student_id || rowNumber}`;
      if (inMemorySeenKeys.has(compositeKey)) {
        resolvedData.phone = `${phone}`;
      } else {
        inMemorySeenKeys.add(compositeKey);
      }
    }

    // Determine final row status:
    // Status is 'error' if any errors exist.
    // Status is 'duplicate' ONLY if this key already exists in database (safely skipped).
    // Status is 'valid' if clean or successfully resolved (eligible for insertion).
    let status = 'valid';
    if (errors.length > 0) {
      status = 'error';
      errorCount++;
    } else if (isDuplicate) {
      status = 'duplicate';
      duplicateCount++;
    } else {
      validCount++;
    }

    validatedRows.push({
      rowNumber,
      status,
      errors,
      warnings,
      info,
      rawData: rawRow,
      resolvedData,
    });
  }

  return {
    validatedRows,
    summary: {
      total: validatedRows.length,
      valid: validCount,
      duplicates: duplicateCount,
      errors: errorCount,
    },
  };
}

/**
 * Queries Supabase to fetch prerequisite maps and existing keys for duplicate detection
 */
export async function fetchDatabaseContext(entityId) {
  const context = {
    existingCourseCodes: new Set(),
    existingBatchCodes: new Set(),
    existingStudentAdmissionNos: new Set(),
    coursesList: [],
    coursesMap: new Map(), // code -> course
    batchesList: [],
    batchesMap: new Map(), // code & name -> batch
    studentsList: [],
    studentsMap: new Map(), // admission_no -> student
    studentsByNameMap: new Map(), // name -> student
    studentsByRollMap: new Map(), // roll_no -> student
  };

  try {
    if (!supabase) {
      console.warn('Supabase client is not initialized in fetchDatabaseContext');
      return context;
    }

    if (entityId === 'courses' || entityId === 'batches' || entityId === 'students') {
      const { data: courses, error } = await supabase
        .from('courses')
        .select('id, code, name, level, description');
      
      if (error) {
        console.error('Error fetching courses for validation context:', error);
      }
      const list = courses || [];
      context.coursesList = list;
      list.forEach((c) => {
        const code = (c.code || '').toUpperCase();
        context.existingCourseCodes.add(code);
        context.coursesMap.set(code, c);
      });
    }

    if (entityId === 'batches' || entityId === 'students') {
      const { data: batches, error } = await supabase
        .from('batches')
        .select('id, code, name, course_id');
      
      if (error) {
        console.error('Error fetching batches for validation context:', error);
      }
      const bList = batches || [];
      context.batchesList = bList;
      bList.forEach((b) => {
        const code = (b.code || '').toUpperCase();
        const name = (b.name || '').toUpperCase();
        context.existingBatchCodes.add(code);
        if (code) context.batchesMap.set(code, b);
        if (name) context.batchesMap.set(name, b);
      });
    }

    if (entityId === 'students' || entityId === 'parents') {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, admission_no, full_name, roll_no, phone, batch_id');
      
      if (error) {
        console.error('Error fetching students for validation context:', error);
      }
      const sList = students || [];
      context.studentsList = sList;
      sList.forEach((s) => {
        const adm = (s.admission_no || '').toUpperCase();
        const name = (s.full_name || '').toLowerCase().trim();
        const roll = s.roll_no ? String(s.roll_no).trim() : '';
        context.existingStudentAdmissionNos.add(adm);
        if (adm) context.studentsMap.set(adm, s);
        if (name) context.studentsByNameMap.set(name, s);
        if (roll) context.studentsByRollMap.set(roll, s);
      });
    }
  } catch (err) {
    console.error('Failed to load DB context for import validation:', err);
  }

  return context;
}
