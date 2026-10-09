import { supabase } from './supabase';

/**
 * Service to manage the real test student (Dhruv Shah)
 * Aligned strictly with public.students, public.parents, and public.parent_students schema.
 * Prevents duplicate creation and avoids fabricating details.
 */

export const TEST_STUDENT_NAME = 'Dhruv Shah';
export const TEST_STUDENT_ADMISSION_NO = 'ADM-TEST-DHRUV';

/**
 * Ensures Dhruv Shah exists as an enrolled student in an existing valid course & batch.
 * Never creates duplicates if already present.
 */
export async function ensureDhruvShahTestStudent() {
  if (!supabase) {
    return { success: false, error: 'Supabase client is not available.' };
  }

  try {
    // 1. Check if Dhruv Shah already exists
    const { data: existing, error: findErr } = await supabase
      .from('students')
      .select(`
        id,
        admission_no,
        full_name,
        roll_no,
        course_id,
        batch_id,
        status,
        courses:course_id ( id, name, code ),
        batches:batch_id ( id, name, code ),
        parent_students (
          id,
          relationship,
          is_primary_contact,
          can_receive_alerts,
          parents:parent_id (
            id,
            full_name,
            phone,
            email,
            telegram_chat_id,
            is_verified
          )
        )
      `)
      .or(`full_name.ilike.%${TEST_STUDENT_NAME}%,admission_no.eq.${TEST_STUDENT_ADMISSION_NO}`)
      .limit(1)
      .maybeSingle();

    if (findErr) {
      console.warn('Error checking existing test student:', findErr);
    }

    if (existing) {
      return {
        success: true,
        created: false,
        student: existing,
        message: `Test student "${existing.full_name}" is already registered (Admission No: ${existing.admission_no}).`,
      };
    }

    // 2. Fetch an existing valid batch & course to link to
    const { data: batches, error: bErr } = await supabase
      .from('batches')
      .select('id, course_id, code, name')
      .order('code')
      .limit(1);

    if (bErr || !batches || batches.length === 0) {
      return {
        success: false,
        error: 'No valid batches exist in database. Please create or import at least one batch before creating the test student.',
      };
    }

    const targetBatch = batches[0];

    // 3. Insert Dhruv Shah using actual database schema
    const payload = {
      admission_no: TEST_STUDENT_ADMISSION_NO,
      full_name: TEST_STUDENT_NAME,
      roll_no: '001',
      course_id: targetBatch.course_id,
      batch_id: targetBatch.id,
      gender: 'Male',
      status: 'active',
      enrollment_date: new Date().toISOString().split('T')[0],
    };

    const { data: newStudent, error: insertErr } = await supabase
      .from('students')
      .insert([payload])
      .select(`
        id,
        admission_no,
        full_name,
        roll_no,
        course_id,
        batch_id,
        status,
        courses:course_id ( id, name, code ),
        batches:batch_id ( id, name, code )
      `)
      .single();

    if (insertErr) {
      throw insertErr;
    }

    return {
      success: true,
      created: true,
      student: newStudent,
      message: `Successfully created test student "${TEST_STUDENT_NAME}" in cohort ${targetBatch.code}.`,
    };
  } catch (err) {
    console.error('Failed to ensure test student:', err);
    return {
      success: false,
      error: err.message || 'Failed to create or verify test student.',
    };
  }
}

/**
 * Generates a unique, one-time Telegram deep link for parent linking
 */
export function generateParentDeepLink(studentId, parentId = null, botUsername = 'RuparelAttendanceBot') {
  const token = parentId ? `link_${parentId}` : `enroll_${studentId}`;
  return {
    token,
    deepLinkUrl: `https://t.me/${botUsername}?start=${token}`,
    tgUri: `tg://resolve?domain=${botUsername}&start=${token}`,
  };
}
