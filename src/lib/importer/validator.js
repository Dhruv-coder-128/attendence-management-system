import { supabase } from '../supabase.js';
import { ENTITY_SCHEMAS } from './entitySchemas.js';
import { resolveCourseReference } from './courseResolver.js';

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

      // Check required
      if (field.required && (value === '' || value === null || value === undefined)) {
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
          // Normalize enum
          const matchedOpt = field.options.find(
            (opt) => opt.toLowerCase() === String(value).toLowerCase()
          );
          if (matchedOpt) {
            resolvedData[field.name] = matchedOpt;
          } else {
            errors.push(
              `"${field.label}" must be one of: ${field.options.join(', ')} (received: ${value})`
            );
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
      const code = resolvedData.code ? resolvedData.code.toUpperCase() : '';
      resolvedData.code = code;

      if (code) {
        if (inMemorySeenKeys.has(code)) {
          errors.push(`Duplicate Course Code in file: "${code}"`);
        } else {
          inMemorySeenKeys.add(code);
        }

        if (dbContext.existingCourseCodes.has(code)) {
          isDuplicate = true;
          warnings.push(`Course Code "${code}" already exists in database (will be skipped)`);
        }
      }
    } else if (entityId === 'batches') {
      const code = resolvedData.code ? resolvedData.code.toUpperCase() : '';
      resolvedData.code = code;

      if (code) {
        if (inMemorySeenKeys.has(code)) {
          errors.push(`Duplicate Batch Code in file: "${code}"`);
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
        errors.push(`Missing required Course Code reference`);
      } else {
        const resolution = resolveCourseReference(rawCourseRef, dbContext.coursesList);
        if (resolution.success) {
          resolvedData.course_id = resolution.course_id;
          resolvedData.course_code = resolution.course_code; // Normalize to exact database course code
          if (resolution.matchedBy !== 'code' && resolution.matchedBy !== 'id') {
            info.push(
              `Course reference "${rawCourseRef}" resolved to "${resolution.course_code}" (${resolution.course.name})`
            );
          }
        } else {
          errors.push(resolution.error);
        }
      }
    } else if (entityId === 'students') {
      const admNo = resolvedData.admission_no ? resolvedData.admission_no.toUpperCase() : '';
      resolvedData.admission_no = admNo;

      if (admNo) {
        if (inMemorySeenKeys.has(admNo)) {
          errors.push(`Duplicate Admission Number in file: "${admNo}"`);
        } else {
          inMemorySeenKeys.add(admNo);
        }

        if (dbContext.existingStudentAdmissionNos.has(admNo)) {
          isDuplicate = true;
          warnings.push(`Admission No "${admNo}" already exists in database (will be skipped)`);
        }
      }

      // Foreign Key resolution: batch_code -> batch_id & course_id
      const batchCode = resolvedData.batch_code ? resolvedData.batch_code.toUpperCase() : '';
      if (batchCode) {
        const foundBatch = dbContext.batchesMap.get(batchCode);
        if (foundBatch) {
          resolvedData.batch_id = foundBatch.id;
          // Auto-assign course_id from batch if not provided or to ensure integrity
          resolvedData.course_id = foundBatch.course_id;
        } else {
          errors.push(`Referenced Batch Code "${batchCode}" does not exist in database`);
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
      const studentAdmNo = resolvedData.student_admission_no
        ? resolvedData.student_admission_no.toUpperCase()
        : '';
      const phone = resolvedData.phone || '';
      const compositeKey = `${phone}_${studentAdmNo}`;

      if (compositeKey && phone && studentAdmNo) {
        if (inMemorySeenKeys.has(compositeKey)) {
          errors.push(`Duplicate Guardian + Student link in file for Admission No "${studentAdmNo}"`);
        } else {
          inMemorySeenKeys.add(compositeKey);
        }
      }

      // Foreign Key resolution: student_admission_no -> student_id
      if (studentAdmNo) {
        const foundStudent = dbContext.studentsMap.get(studentAdmNo);
        if (foundStudent) {
          resolvedData.student_id = foundStudent.id;
          resolvedData.student_name = foundStudent.full_name;
        } else {
          errors.push(`Student with Admission No "${studentAdmNo}" does not exist in database`);
        }
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
    batchesMap: new Map(), // code -> batch
    studentsMap: new Map(), // admission_no -> student
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
      (batches || []).forEach((b) => {
        const code = (b.code || '').toUpperCase();
        context.existingBatchCodes.add(code);
        context.batchesMap.set(code, b);
      });
    }

    if (entityId === 'students' || entityId === 'parents') {
      const { data: students, error } = await supabase
        .from('students')
        .select('id, admission_no, full_name');
      
      if (error) {
        console.error('Error fetching students for validation context:', error);
      }
      (students || []).forEach((s) => {
        const adm = (s.admission_no || '').toUpperCase();
        context.existingStudentAdmissionNos.add(adm);
        context.studentsMap.set(adm, s);
      });
    }
  } catch (err) {
    console.error('Failed to load DB context for import validation:', err);
  }

  return context;
}
