import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Standard Academic Grading Scale
 */
export function computeGrade(percentage) {
  if (percentage === null || percentage === undefined || isNaN(percentage)) {
    return { grade: '—', label: 'Not Graded', badge: 'Pending' };
  }
  const pct = Number(percentage);
  if (pct >= 90) return { grade: 'A+', label: 'Outstanding (90%+)', badge: 'Present' };
  if (pct >= 80) return { grade: 'A', label: 'Excellent (80-89%)', badge: 'Present' };
  if (pct >= 70) return { grade: 'B', label: 'Very Good (70-79%)', badge: 'Present' };
  if (pct >= 60) return { grade: 'C', label: 'Good (60-69%)', badge: 'Late' };
  if (pct >= 40) return { grade: 'D', label: 'Pass (40-59%)', badge: 'Late' };
  return { grade: 'F', label: 'Needs Improvement (<40%)', badge: 'Absent' };
}

/**
 * Evaluates student exam performance
 */
export function computeExamResult(marksObtained, passingMarks, totalMarks, isAbsent = false) {
  if (isAbsent) {
    return {
      status: 'ABSENT',
      label: 'Absent',
      percentage: null,
      grade: 'AB',
      badge: 'Absent',
      isPass: false,
    };
  }

  if (marksObtained === null || marksObtained === undefined || marksObtained === '') {
    return {
      status: 'PENDING',
      label: 'Ungraded',
      percentage: null,
      grade: '—',
      badge: 'Pending',
      isPass: false,
    };
  }

  const marks = Number(marksObtained);
  const total = Number(totalMarks) || 100;
  const pass = Number(passingMarks) || 35;
  const percentage = total > 0 ? Math.round((marks / total) * 100 * 10) / 10 : 0;
  const gradeInfo = computeGrade(percentage);
  const isPass = marks >= pass;

  return {
    status: isPass ? 'PASSED' : 'FAILED',
    label: isPass ? 'Passed' : 'Failed',
    percentage,
    grade: gradeInfo.grade,
    gradeLabel: gradeInfo.label,
    badge: isPass ? 'Present' : 'Absent',
    isPass,
  };
}

/**
 * In-memory fallback exams storage for resilience if Supabase table is not yet created
 */
let memoryExams = [
  {
    id: 'demo-exam-1',
    name: 'Term 1 Unit Test — Mathematics',
    exam_type: 'Unit Test',
    subject: 'Mathematics',
    exam_date: '2026-10-05',
    total_marks: 50,
    passing_marks: 18,
    academic_year: '2026-27',
    description: 'Calculus, Relations & Functions, Coordinate Geometry',
    is_published: true,
  },
  {
    id: 'demo-exam-2',
    name: 'Mid-Term Prelim — Physics & IT',
    exam_type: 'Mid-Term',
    subject: 'Physics & Applied Computing',
    exam_date: '2026-10-12',
    total_marks: 100,
    passing_marks: 35,
    academic_year: '2026-27',
    description: 'Electrodynamics, Waves, DBMS & Web Programming Practical',
    is_published: true,
  },
];

let memoryMarks = {};

/**
 * Fetch all exams with course and batch joins
 */
export async function fetchExams({ courseId = 'All', batchId = 'All', examType = 'All' } = {}) {
  if (!isSupabaseConfigured || !supabase) {
    return filterInMemoryExams({ courseId, batchId, examType });
  }

  try {
    let query = supabase
      .from('exams')
      .select(`
        id,
        name,
        exam_type,
        course_id,
        batch_id,
        subject,
        exam_date,
        total_marks,
        passing_marks,
        description,
        academic_year,
        is_published,
        created_at,
        courses:course_id ( id, name, code, level ),
        batches:batch_id ( id, name, code, timing, classroom )
      `)
      .order('exam_date', { ascending: false });

    if (courseId !== 'All') {
      query = query.eq('course_id', courseId);
    }
    if (batchId !== 'All') {
      query = query.eq('batch_id', batchId);
    }
    if (examType !== 'All') {
      query = query.eq('exam_type', examType);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('PostgreSQL exams table query fallback:', err.message);
    return filterInMemoryExams({ courseId, batchId, examType });
  }
}

function filterInMemoryExams({ courseId, batchId, examType }) {
  return memoryExams.filter((ex) => {
    if (courseId && courseId !== 'All' && ex.course_id && ex.course_id !== courseId) return false;
    if (batchId && batchId !== 'All' && ex.batch_id && ex.batch_id !== batchId) return false;
    if (examType && examType !== 'All' && ex.exam_type !== examType) return false;
    return true;
  });
}

/**
 * Save Exam (Create or Update)
 */
export async function saveExam(examPayload) {
  const payload = {
    name: examPayload.name.trim(),
    exam_type: examPayload.exam_type || 'Unit Test',
    course_id: examPayload.course_id,
    batch_id: examPayload.batch_id || null,
    subject: examPayload.subject?.trim() || null,
    exam_date: examPayload.exam_date || new Date().toISOString().split('T')[0],
    total_marks: Number(examPayload.total_marks) || 100,
    passing_marks: Number(examPayload.passing_marks) || 35,
    description: examPayload.description?.trim() || null,
    academic_year: examPayload.academic_year || '2026-27',
    is_published: examPayload.is_published ?? false,
  };

  if (!isSupabaseConfigured || !supabase) {
    if (examPayload.id) {
      memoryExams = memoryExams.map((e) => (e.id === examPayload.id ? { ...e, ...payload } : e));
      return { ...payload, id: examPayload.id };
    }
    const newExam = { ...payload, id: `local-exam-${Date.now()}` };
    memoryExams.unshift(newExam);
    return newExam;
  }

  try {
    if (examPayload.id) {
      const { data, error } = await supabase
        .from('exams')
        .update(payload)
        .eq('id', examPayload.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('exams')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('saveExam Supabase error, fallback to memory:', err.message);
    if (examPayload.id) {
      memoryExams = memoryExams.map((e) => (e.id === examPayload.id ? { ...e, ...payload } : e));
      return { ...payload, id: examPayload.id };
    }
    const newExam = { ...payload, id: `local-exam-${Date.now()}` };
    memoryExams.unshift(newExam);
    return newExam;
  }
}

/**
 * Delete Exam
 */
export async function deleteExam(examId) {
  if (!isSupabaseConfigured || !supabase) {
    memoryExams = memoryExams.filter((e) => e.id !== examId);
    delete memoryMarks[examId];
    return true;
  }

  try {
    const { error } = await supabase.from('exams').delete().eq('id', examId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('deleteExam fallback:', err.message);
    memoryExams = memoryExams.filter((e) => e.id !== examId);
    return true;
  }
}

/**
 * Fetch marks for all students in a batch for a specific exam
 */
export async function fetchExamBatchMarks(examId, batchId, courseId) {
  let students = [];

  // 1. Fetch Students
  if (isSupabaseConfigured && supabase) {
    try {
      let query = supabase
        .from('students')
        .select('id, admission_no, full_name, roll_no, phone, email, status')
        .eq('status', 'active')
        .order('roll_no', { ascending: true });

      if (batchId) {
        query = query.eq('batch_id', batchId);
      } else if (courseId) {
        query = query.eq('course_id', courseId);
      }

      const { data, error } = await query;
      if (!error && data) {
        students = data;
      }
    } catch (stErr) {
      console.warn('Student fetch for marks entry:', stErr.message);
    }
  }

  // 2. Fetch existing marks for this exam
  let existingMarksMap = {};
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: marksData, error: mErr } = await supabase
        .from('exam_marks')
        .select('id, student_id, marks_obtained, is_absent, remarks, notified_guardians')
        .eq('exam_id', examId);

      if (!mErr && marksData) {
        marksData.forEach((m) => {
          existingMarksMap[m.student_id] = m;
        });
      }
    } catch (mErr) {
      console.warn('Existing marks fetch notice:', mErr.message);
      existingMarksMap = memoryMarks[examId] || {};
    }
  } else {
    existingMarksMap = memoryMarks[examId] || {};
  }

  // Merge students with their marks
  return students.map((student) => {
    const markRecord = existingMarksMap[student.id];
    return {
      student_id: student.id,
      admission_no: student.admission_no,
      full_name: student.full_name,
      roll_no: student.roll_no || '—',
      marks_obtained: markRecord ? markRecord.marks_obtained : '',
      is_absent: markRecord ? Boolean(markRecord.is_absent) : false,
      remarks: markRecord ? markRecord.remarks || '' : '',
      notified_guardians: markRecord ? Boolean(markRecord.notified_guardians) : false,
      mark_id: markRecord?.id || null,
    };
  });
}

/**
 * Save Batch Marks (Bulk upsert)
 */
export async function saveExamMarks(examId, marksRows) {
  const payload = marksRows.map((row) => ({
    exam_id: examId,
    student_id: row.student_id,
    marks_obtained: row.is_absent || row.marks_obtained === '' || row.marks_obtained === null
      ? null
      : Number(row.marks_obtained),
    is_absent: Boolean(row.is_absent),
    remarks: row.remarks?.trim() || null,
  }));

  if (!isSupabaseConfigured || !supabase) {
    if (!memoryMarks[examId]) memoryMarks[examId] = {};
    payload.forEach((p) => {
      memoryMarks[examId][p.student_id] = p;
    });
    return { success: true, count: payload.length };
  }

  try {
    const { data, error } = await supabase
      .from('exam_marks')
      .upsert(payload, { onConflict: 'exam_id, student_id' })
      .select();

    if (error) throw error;
    return { success: true, count: data?.length || payload.length };
  } catch (err) {
    console.warn('saveExamMarks fallback to memory storage:', err.message);
    if (!memoryMarks[examId]) memoryMarks[examId] = {};
    payload.forEach((p) => {
      memoryMarks[examId][p.student_id] = p;
    });
    return { success: true, count: payload.length };
  }
}

/**
 * Fetch all exam records and results for a specific student (for Dossier & Report Card)
 */
export async function fetchStudentExamResults(studentId) {
  if (!isSupabaseConfigured || !supabase) {
    // Return sample exam results for demo student
    return [
      {
        id: 'mark-demo-1',
        exam_id: 'demo-exam-1',
        exam_name: 'Term 1 Unit Test — Mathematics',
        exam_type: 'Unit Test',
        subject: 'Mathematics',
        exam_date: '2026-10-05',
        total_marks: 50,
        passing_marks: 18,
        marks_obtained: 44,
        is_absent: false,
        remarks: 'Excellent command in calculus formulas',
        ...computeExamResult(44, 18, 50, false),
      },
      {
        id: 'mark-demo-2',
        exam_id: 'demo-exam-2',
        exam_name: 'Mid-Term Prelim — Physics & IT',
        exam_type: 'Mid-Term',
        subject: 'Physics & Applied Computing',
        exam_date: '2026-10-12',
        total_marks: 100,
        passing_marks: 35,
        marks_obtained: 88,
        is_absent: false,
        remarks: 'Consistent problem solving performance',
        ...computeExamResult(88, 35, 100, false),
      },
    ];
  }

  try {
    const { data, error } = await supabase
      .from('exam_marks')
      .select(`
        id,
        exam_id,
        marks_obtained,
        is_absent,
        remarks,
        created_at,
        exams:exam_id (
          id,
          name,
          exam_type,
          subject,
          exam_date,
          total_marks,
          passing_marks,
          description,
          academic_year,
          courses:course_id ( name, code ),
          batches:batch_id ( name, code )
        )
      `)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row) => {
      const exam = row.exams || {};
      const evalResult = computeExamResult(
        row.marks_obtained,
        exam.passing_marks || 35,
        exam.total_marks || 100,
        row.is_absent
      );

      return {
        id: row.id,
        exam_id: row.exam_id,
        exam_name: exam.name || 'Examination',
        exam_type: exam.exam_type || 'Unit Test',
        subject: exam.subject || 'All Subjects',
        exam_date: exam.exam_date || '',
        total_marks: Number(exam.total_marks) || 100,
        passing_marks: Number(exam.passing_marks) || 35,
        marks_obtained: row.marks_obtained,
        is_absent: row.is_absent,
        remarks: row.remarks || '',
        course_name: exam.courses?.name || '',
        batch_name: exam.batches?.name || '',
        ...evalResult,
      };
    });
  } catch (err) {
    console.warn('fetchStudentExamResults fallback:', err.message);
    return [];
  }
}
