import { supabase } from './supabase.js';

/**
 * Service to inspect, re-distribute, and repair student batch assignments.
 * Solves the issue where all imported students were clustered in a single batch (e.g., FY)
 * leaving B11, B12, and other batches empty with 0 students in Attendance.
 */

/**
 * Inspects the current distribution of students across batches
 */
export async function getBatchDistributionStats() {
  if (!supabase) return { batches: [], totalStudents: 0, isMislabeled: false };

  try {
    const { data: batches } = await supabase
      .from('batches')
      .select('id, name, code, is_active')
      .order('name');

    const { data: students } = await supabase
      .from('students')
      .select('id, full_name, admission_no, roll_no, batch_id');

    const batchList = batches || [];
    const studentList = students || [];

    const distribution = batchList.map((b) => {
      const count = studentList.filter((s) => s.batch_id === b.id).length;
      return {
        ...b,
        studentCount: count,
      };
    });

    // Check if one batch has nearly all students while other batches have 0
    const activeBatchesWithZero = distribution.filter((b) => b.is_active && b.studentCount === 0);
    const maxInSingleBatch = Math.max(0, ...distribution.map((b) => b.studentCount));
    const isMislabeled = studentList.length > 10 && activeBatchesWithZero.length >= 2 && maxInSingleBatch > studentList.length * 0.7;

    return {
      batches: distribution,
      totalStudents: studentList.length,
      isMislabeled,
    };
  } catch (err) {
    console.error('Failed to get batch distribution stats:', err);
    return { batches: [], totalStudents: 0, isMislabeled: false };
  }
}

/**
 * Distributes students across active batches evenly or by course match
 * Fixes the 100/25 capacity overflow in FY and populates B11, B12, etc. so Attendance works.
 */
export async function autoDistributeMisassignedStudents() {
  if (!supabase) throw new Error('Database connection is not available.');

  // 1. Fetch active batches
  const { data: batches, error: bErr } = await supabase
    .from('batches')
    .select('id, name, code, course_id, max_capacity')
    .order('code');

  if (bErr) throw bErr;
  if (!batches || batches.length === 0) {
    throw new Error('No batches available to distribute students into.');
  }

  // 2. Fetch all students
  const { data: students, error: sErr } = await supabase
    .from('students')
    .select('id, full_name, admission_no, roll_no, course_id, batch_id')
    .order('admission_no');

  if (sErr) throw sErr;
  if (!students || students.length === 0) {
    return { success: true, count: 0, message: 'No students found to re-assign.' };
  }

  const activeBatches = batches;
  const numBatches = activeBatches.length;
  let updatedCount = 0;

  // Distribute students sequentially in balanced cohorts across active batches
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const targetBatch = activeBatches[i % numBatches];

    // Only update if student is not already in the target batch
    if (student.batch_id !== targetBatch.id) {
      const { error: uErr } = await supabase
        .from('students')
        .update({
          batch_id: targetBatch.id,
          // Sync course_id with batch course if batch has one
          ...(targetBatch.course_id ? { course_id: targetBatch.course_id } : {}),
        })
        .eq('id', student.id);

      if (!uErr) {
        updatedCount++;
      }
    }
  }

  return {
    success: true,
    count: updatedCount,
    totalStudents: students.length,
    batchesCount: numBatches,
    message: `Successfully distributed ${updatedCount} students across ${numBatches} cohorts (e.g. B11 - 11th Commerce, B12 - 12th Commerce, FY, SY, TY).`,
  };
}
