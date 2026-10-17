import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Standard Tuition Fee Structures by Academic Level
 */
export const STANDARD_COURSE_FEES = {
  '11th': {
    total: 45000,
    installments: [
      { number: 1, label: 'Term 1 Admission', percent: 35, offsetDays: 15 },
      { number: 2, label: 'Mid-Term Advance', percent: 35, offsetDays: 90 },
      { number: 3, label: 'Final Term & Board Prep', percent: 30, offsetDays: 180 },
    ],
  },
  '12th': {
    total: 50000,
    installments: [
      { number: 1, label: 'Term 1 Board Prep', percent: 40, offsetDays: 15 },
      { number: 2, label: 'Mid-Term Advance', percent: 30, offsetDays: 90 },
      { number: 3, label: 'Prelims & Exam Calibration', percent: 30, offsetDays: 180 },
    ],
  },
  'FY': {
    total: 38000,
    installments: [
      { number: 1, label: 'Semester 1 Tuition', percent: 50, offsetDays: 15 },
      { number: 2, label: 'Semester 2 Tuition', percent: 50, offsetDays: 120 },
    ],
  },
  'SY': {
    total: 40000,
    installments: [
      { number: 1, label: 'Semester 3 Tuition', percent: 50, offsetDays: 15 },
      { number: 2, label: 'Semester 4 Tuition', percent: 50, offsetDays: 120 },
    ],
  },
  'TY': {
    total: 42000,
    installments: [
      { number: 1, label: 'Semester 5 Tuition', percent: 50, offsetDays: 15 },
      { number: 2, label: 'Semester 6 Tuition', percent: 50, offsetDays: 120 },
    ],
  },
  'BCA': {
    total: 45000,
    installments: [
      { number: 1, label: 'Term 1 IT Lab & Tuition', percent: 50, offsetDays: 15 },
      { number: 2, label: 'Term 2 Practical & Tuition', percent: 50, offsetDays: 120 },
    ],
  },
};

/**
 * Resolves standard fee policy for a given course
 */
export function getStandardCoursePolicy(course) {
  const level = course?.level || '';
  const code = (course?.code || '').toUpperCase();

  if (STANDARD_COURSE_FEES[level]) return STANDARD_COURSE_FEES[level];
  if (code.includes('12')) return STANDARD_COURSE_FEES['12th'];
  if (code.includes('11')) return STANDARD_COURSE_FEES['11th'];
  if (code.includes('BCA')) return STANDARD_COURSE_FEES['BCA'];

  return {
    total: 36000,
    installments: [
      { number: 1, label: 'Installment 1', percent: 50, offsetDays: 15 },
      { number: 2, label: 'Installment 2', percent: 50, offsetDays: 120 },
    ],
  };
}

/**
 * Builds standard installment schedule based on course enrollment date
 */
export function buildDefaultSchedule(totalAmount, enrollmentDateStr, policy) {
  const baseDate = enrollmentDateStr ? new Date(enrollmentDateStr) : new Date();
  const validBase = isNaN(baseDate.getTime()) ? new Date() : baseDate;

  return policy.installments.map((inst) => {
    const dueDate = new Date(validBase.getTime() + inst.offsetDays * 24 * 60 * 60 * 1000);
    const amount = Math.round((totalAmount * inst.percent) / 100);
    return {
      installment_no: inst.number,
      label: inst.label,
      amount,
      paid_amount: 0,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending', // 'paid' | 'partial' | 'pending' | 'overdue'
      paid_at: null,
      payment_method: null,
      reference_no: null,
    };
  });
}

/**
 * Computes payment status (paid, partial, overdue, pending)
 */
export function computeFeeStatus(totalAmount, paidAmount, schedule = [], nextDueDate = null) {
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingAmount = Math.max(0, totalAmount - paidAmount);

  if (pendingAmount === 0 && totalAmount > 0) {
    return {
      status: 'paid',
      isOverdue: false,
      daysOverdue: 0,
      badgeStatus: 'Present', // green badge
      label: 'Fees Cleared',
    };
  }

  // Check if any pending installment is past its due date
  let isOverdue = false;
  let maxDaysOverdue = 0;

  if (nextDueDate && nextDueDate < todayStr && pendingAmount > 0) {
    isOverdue = true;
    const diffMs = new Date().getTime() - new Date(nextDueDate).getTime();
    maxDaysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }

  if (schedule && schedule.length > 0) {
    schedule.forEach((inst) => {
      if (inst.status !== 'paid' && inst.due_date && inst.due_date < todayStr) {
        isOverdue = true;
        const diffMs = new Date().getTime() - new Date(inst.due_date).getTime();
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (days > maxDaysOverdue) maxDaysOverdue = days;
      }
    });
  }

  if (isOverdue) {
    return {
      status: 'overdue',
      isOverdue: true,
      daysOverdue: maxDaysOverdue,
      badgeStatus: 'Absent', // red badge
      label: `Overdue (${maxDaysOverdue}d)`,
    };
  }

  if (paidAmount > 0) {
    return {
      status: 'partial',
      isOverdue: false,
      daysOverdue: 0,
      badgeStatus: 'Late', // amber badge
      label: 'Partial Paid',
    };
  }

  return {
    status: 'pending',
    isOverdue: false,
    daysOverdue: 0,
    badgeStatus: 'Pending', // gray/slate badge
    label: 'Pending',
  };
}

/**
 * Fetches fee record for a student from public.student_fees (with resilient fallback)
 */
export async function getStudentFeeRecord(student, course) {
  if (!student) return null;

  const policy = getStandardCoursePolicy(course || student.courses);
  const defaultTotal = policy.total;
  const defaultSchedule = buildDefaultSchedule(defaultTotal, student.enrollment_date, policy);

  // Default Next Due Date is first installment
  const firstDueDate = defaultSchedule[0]?.due_date || null;

  const defaultRecord = {
    id: `local-fee-${student.id}`,
    student_id: student.id,
    academic_year: '2026-27',
    total_amount: defaultTotal,
    paid_amount: 0,
    pending_amount: defaultTotal,
    status: 'pending',
    installment_schedule: defaultSchedule,
    next_due_date: firstDueDate,
    last_reminder_sent_at: null,
    notes: '',
  };

  if (!supabase || !isSupabaseConfigured) {
    return defaultRecord;
  }

  try {
    const { data, error } = await supabase
      .from('student_fees')
      .select('*')
      .eq('student_id', student.id)
      .maybeSingle();

    if (!error && data) {
      // Validate or recalculate status
      const schedule = Array.isArray(data.installment_schedule) ? data.installment_schedule : defaultSchedule;
      const computed = computeFeeStatus(
        Number(data.total_amount),
        Number(data.paid_amount),
        schedule,
        data.next_due_date
      );

      return {
        ...data,
        total_amount: Number(data.total_amount),
        paid_amount: Number(data.paid_amount),
        pending_amount: Math.max(0, Number(data.total_amount) - Number(data.paid_amount)),
        installment_schedule: schedule,
        status: computed.status,
      };
    }

    // Check if student table has convenience columns
    if (student.tuition_fee) {
      const total = Number(student.tuition_fee);
      const paid = Number(student.fee_paid || 0);
      const computed = computeFeeStatus(total, paid, defaultSchedule, student.fee_due_date);
      return {
        ...defaultRecord,
        total_amount: total,
        paid_amount: paid,
        pending_amount: Math.max(0, total - paid),
        status: computed.status,
        next_due_date: student.fee_due_date || firstDueDate,
      };
    }

    return defaultRecord;
  } catch (err) {
    console.warn('Fee record query fallback to defaults:', err);
    return defaultRecord;
  }
}

/**
 * Records a tuition fee payment in Supabase public.student_fees & public.students
 * Supports both named object arguments and positional arguments.
 * Progressively credits installments across the schedule.
 */
export async function recordFeePayment(param1, ...rest) {
  let studentId, amount, paymentMethod, referenceNo, notes, existingFeeRecord, installmentNumber;

  if (param1 && typeof param1 === 'object' && ('studentId' in param1 || 'amount' in param1)) {
    ({
      studentId,
      amount,
      paymentMethod = 'Cash',
      referenceNo = '',
      notes = '',
      existingFeeRecord,
      installmentNumber = null,
    } = param1);
  } else {
    studentId = param1;
    [
      amount,
      paymentMethod = 'Cash',
      referenceNo = '',
      notes = '',
      installmentNumber = null,
      existingFeeRecord,
    ] = rest;
  }

  if (!studentId) throw new Error('Student ID is required');

  const paymentAmt = parseFloat(amount);
  if (isNaN(paymentAmt) || paymentAmt <= 0) {
    throw new Error('Please enter a valid positive payment amount');
  }

  // Fetch fresh student and fee records from DB for 100% accurate state
  let studentData = null;
  let dbFeeRecord = null;
  if (supabase && isSupabaseConfigured) {
    try {
      const [stRes, feeRes] = await Promise.all([
        supabase
          .from('students')
          .select('id, full_name, tuition_fee, fee_paid, fee_status, fee_due_date, course_id, enrollment_date, courses:course_id(id, name, code, level)')
          .eq('id', studentId)
          .maybeSingle(),
        supabase
          .from('student_fees')
          .select('*')
          .eq('student_id', studentId)
          .maybeSingle(),
      ]);
      studentData = stRes.data;
      dbFeeRecord = feeRes.data;
    } catch (e) {
      console.warn('Error fetching latest student fee context in recordFeePayment:', e);
    }
  }

  const coursePolicy = getStandardCoursePolicy(studentData?.courses || existingFeeRecord?.courses);
  const totalAmount = Number(
    dbFeeRecord?.total_amount ??
    studentData?.tuition_fee ??
    existingFeeRecord?.total_amount ??
    coursePolicy.total ??
    36000
  );

  const currentPaid = Number(
    dbFeeRecord?.paid_amount ??
    studentData?.fee_paid ??
    existingFeeRecord?.paid_amount ??
    0
  );

  const newPaidAmount = Math.min(totalAmount, currentPaid + paymentAmt);
  const newPendingAmount = Math.max(0, totalAmount - newPaidAmount);

  // Resolve installment schedule
  let existingSchedule = dbFeeRecord?.installment_schedule || existingFeeRecord?.installment_schedule;
  let schedule = Array.isArray(existingSchedule) && existingSchedule.length > 0
    ? [...existingSchedule]
    : buildDefaultSchedule(totalAmount, studentData?.enrollment_date, coursePolicy);

  const todayStr = new Date().toISOString().split('T')[0];
  const nowIso = new Date().toISOString();

  // Progressively credit installments in order using cumulative paid amount
  let remainingCredit = newPaidAmount;
  schedule = schedule.map((inst) => {
    const instTotal = Number(inst.amount || 0);
    const instPaid = Math.min(instTotal, remainingCredit);
    remainingCredit = Math.max(0, remainingCredit - instPaid);

    let instStatus = 'pending';
    if (instPaid >= instTotal && instTotal > 0) {
      instStatus = 'paid';
    } else if (instPaid > 0) {
      instStatus = 'partial';
    } else if (inst.due_date && inst.due_date < todayStr) {
      instStatus = 'overdue';
    }

    return {
      ...inst,
      amount: instTotal,
      paid_amount: instPaid,
      status: instStatus,
      paid_at: instPaid > 0 ? (inst.paid_at || nowIso) : null,
      payment_method: instPaid > 0 ? (inst.payment_method || paymentMethod) : null,
      reference_no: instPaid > 0 ? (inst.reference_no || referenceNo || `RCP-${Date.now().toString().slice(-6)}`) : null,
    };
  });

  // Find next pending due date
  const nextPending = schedule.find((i) => i.status !== 'paid');
  const nextDueDate = nextPending ? nextPending.due_date : null;

  const computed = computeFeeStatus(totalAmount, newPaidAmount, schedule, nextDueDate);

  const feeRecordId = dbFeeRecord?.id || (existingFeeRecord?.id && !String(existingFeeRecord.id).startsWith('local-') ? existingFeeRecord.id : undefined);

  const payload = {
    ...(feeRecordId ? { id: feeRecordId } : {}),
    student_id: studentId,
    academic_year: existingFeeRecord?.academic_year || dbFeeRecord?.academic_year || '2026-27',
    total_amount: totalAmount,
    paid_amount: newPaidAmount,
    pending_amount: newPendingAmount,
    status: computed.status,
    installment_schedule: schedule,
    next_due_date: nextDueDate,
    notes: notes
      ? `${dbFeeRecord?.notes || existingFeeRecord?.notes || ''}\n[${new Date().toLocaleDateString('en-IN')}] Paid ₹${paymentAmt} via ${paymentMethod} (${referenceNo || 'N/A'})`.trim()
      : (dbFeeRecord?.notes || existingFeeRecord?.notes || null),
  };

  if (supabase && isSupabaseConfigured) {
    // 1. ALWAYS update the primary students table directly so UI, metrics, and exports immediately reflect the payment!
    try {
      await supabase
        .from('students')
        .update({
          fee_paid: newPaidAmount,
          fee_status: computed.status,
          fee_due_date: nextDueDate,
          tuition_fee: totalAmount,
        })
        .eq('id', studentId);
    } catch (stErr) {
      console.warn('Direct student table fee update warning:', stErr);
    }

    // 2. Also record in student_fees for historical tracking
    try {
      const { data, error } = await supabase
        .from('student_fees')
        .upsert(payload, { onConflict: 'student_id,academic_year' })
        .select()
        .maybeSingle();

      if (!error && data) {
        return {
          ...data,
          success: true,
          feeRecord: { ...data, installment_schedule: schedule },
          message: `Payment of ₹${paymentAmt.toLocaleString('en-IN')} recorded successfully! Pending balance: ₹${newPendingAmount.toLocaleString('en-IN')}`,
        };
      }
    } catch (dbErr) {
      console.warn('Direct student_fees upsert issue:', dbErr);
    }
  }

  return {
    ...payload,
    id: feeRecordId || `fee-${studentId}`,
    success: true,
    feeRecord: { ...payload, id: feeRecordId || `fee-${studentId}` },
    message: `Payment of ₹${paymentAmt.toLocaleString('en-IN')} recorded successfully! Pending balance: ₹${newPendingAmount.toLocaleString('en-IN')}`,
  };
}
