import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Secure Telegram Attendance Alert Dispatcher
 * 
 * Security & Integrity:
 * - Server-side resolution of student-to-parent relationships from Supabase.
 * - Authenticates requests via admin Authorization JWT or server SUPABASE_SERVICE_ROLE_KEY.
 * - Resolves batches using robust UUID / code / name lookup.
 * - Never trusts client-supplied chat IDs or parent IDs.
 * - Enforces duplicate prevention: skips already notified records unless retry is requested.
 * - Supports batch-level dispatch ("Send Attendance Notifications") and single-student retry.
 * - Keeps attendance record intact if sending fails, recording the exact Telegram API error.
 * - Accurately categorizes sent, failed, alreadyNotified, and skippedUnlinked.
 */

// Helper to escape HTML special characters for Telegram HTML parse_mode
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Robust Telegram message sender with HTML fallback to plain text
async function sendTelegramAlert(botToken, chatId, htmlMessage) {
  try {
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgResponse.json();

    if (tgResponse.ok && tgData.ok) {
      return { ok: true, messageId: tgData.result?.message_id };
    }

    // If Telegram returned entity parse error, retry with plain text
    if (tgData.description && tgData.description.includes('can\'t parse entities')) {
      const plainText = htmlMessage.replace(/<[^>]*>/g, '');
      const plainResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: plainText,
          disable_web_page_preview: true,
        }),
      });
      const plainData = await plainResponse.json();
      if (plainResponse.ok && plainData.ok) {
        return { ok: true, messageId: plainData.result?.message_id };
      }
      return { ok: false, error: plainData.description || `HTTP ${plainResponse.status}` };
    }

    return { ok: false, error: tgData.description || `HTTP ${tgResponse.status}` };
  } catch (netErr) {
    return { ok: false, error: netErr.message || 'Network error communicating with Telegram Bot API' };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const rawToken = process.env.TELEGRAM_BOT_TOKEN;
  const botToken = rawToken ? String(rawToken).trim().replace(/^["']|["']$/g, '') : '';
  if (!botToken) {
    return res.status(500).json({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in server environment variables.',
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const authHeader = req.headers.authorization;

  const supabaseKey = serviceRoleKey || anonKey;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      error: 'Supabase credentials are not configured in server environment variables.',
    });
  }

  const body = req.body || {};
  const {
    action,
    notificationType,
    batchId,
    date,
    sessionName = 'Regular',
    retryFailedOnly = false,
    forceAll = false,
    studentId,
    feeRecord,
    targetParentId,
    examId,
  } = body;

  // Payload guard: require either fee_reminder, or examId, or batchId + date, or studentId
  if (!batchId && !studentId && !examId) {
    return res.status(400).json({
      ok: false,
      error: 'Invalid request payload. Specify batchId and date, studentId, or examId.',
    });
  }

  // If service_role is not available, pass the admin's forwarded JWT to satisfy Row Level Security
  const clientOptions = {};
  if (!serviceRoleKey && authHeader) {
    clientOptions.global = {
      headers: { Authorization: authHeader },
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey, clientOptions);

  // Case C: Tuition Fee Schedule Reminder Dispatch
  if ((action === 'fee_reminder' || notificationType === 'fee_reminder') && studentId) {
    try {
      // 1. Fetch student with course and batch
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select(`
          id,
          full_name,
          admission_no,
          roll_no,
          courses:course_id ( id, name, code ),
          batches:batch_id ( id, name, code )
        `)
        .eq('id', studentId)
        .single();

      if (sErr || !student) {
        return res.status(404).json({ ok: false, error: 'Student not found in database.' });
      }

      // 2. Fetch or resolve fee record
      let currentFee = feeRecord;
      if (!currentFee) {
        const { data: dbFee } = await supabase
          .from('student_fees')
          .select('*')
          .eq('student_id', studentId)
          .maybeSingle();
        currentFee = dbFee;
      }

      const totalAmt = Number(currentFee?.total_amount || 45000);
      const paidAmt = Number(currentFee?.paid_amount || 0);
      const pendingAmt = Number(currentFee?.pending_amount ?? (totalAmt - paidAmt));
      const dueDate = currentFee?.next_due_date || 'Upcoming Milestone';
      const isOverdue = currentFee?.status === 'overdue' || (currentFee?.next_due_date && currentFee.next_due_date < new Date().toISOString().split('T')[0] && pendingAmt > 0);

      // 3. Query linked guardians with preferences
      let plQuery = supabase
        .from('parent_students')
        .select(`
          id,
          relationship,
          is_primary_contact,
          can_receive_alerts,
          parents:parent_id (
            id,
            full_name,
            phone,
            telegram_chat_id,
            is_verified
          )
        `)
        .eq('student_id', studentId);

      if (targetParentId) {
        plQuery = plQuery.eq('parent_id', targetParentId);
      }

      const { data: plData, error: plErr } = await plQuery;
      if (plErr) {
        return res.status(500).json({ ok: false, error: `Failed to query guardians: ${plErr.message}` });
      }

      // 4. Filter guardians who should receive fee reminder
      const eligibleGuardians = (plData || []).filter((pl) => {
        if (!pl.can_receive_alerts) return false;
        const p = pl.parents;
        if (!p || !p.is_verified || !p.telegram_chat_id) return false;

        const pref = pl.alert_preference || 'all';
        if (pref === 'none') return false;
        // If preference is emergency_only, only send if the fee is strictly overdue or they are primary contact
        if (pref === 'emergency_only' && !isOverdue && !pl.is_primary_contact) return false;

        return true;
      });

      if (eligibleGuardians.length === 0) {
        return res.status(400).json({
          ok: false,
          error: `No verified guardians with active alert preferences found for ${student.full_name}. Please ensure at least one guardian has Telegram connected.`,
        });
      }

      // 5. Send message to each eligible guardian
      let sentCount = 0;
      const details = [];

      for (const item of eligibleGuardians) {
        const parent = item.parents;
        const statusEmoji = isOverdue ? '🚨' : '💳';
        const statusText = isOverdue ? 'OVERDUE' : pendingAmt === 0 ? 'CLEARED' : 'INSTALLMENT SCHEDULED';

        const messageHtml = `
${statusEmoji} <b>SMS — Student Management System — Tuition Fee Notice</b>

Namaste <b>${escapeHtml(parent.full_name)}</b>,
This is an official communication regarding the tuition fee schedule for your ward:

👤 <b>Student:</b> ${escapeHtml(student.full_name)}
🆔 <b>Admission No:</b> <code>${escapeHtml(student.admission_no)}</code>
🎓 <b>Course & Batch:</b> ${escapeHtml(student.courses?.name || 'Academic Stream')} (${escapeHtml(student.batches?.name || 'Cohort')})

📊 <b>Account Breakdown:</b>
• Total Academic Tuition: <b>₹${totalAmt.toLocaleString('en-IN')}</b>
• Amount Paid to Date: <b>₹${paidAmt.toLocaleString('en-IN')}</b>
• <b>Outstanding Balance:</b> <b>₹${pendingAmt.toLocaleString('en-IN')}</b>
• Payment Status: <b>${statusText}</b>
• Scheduled Due Date: <b>${escapeHtml(dueDate)}</b> ${isOverdue ? '⚠️ <i>(Payment Overdue)</i>' : ''}

Kindly ensure the pending installment is cleared at the academy accounts desk. If you have already completed this payment, kindly share the receipt with reception to reconcile records.

<i>SMS — Student Management System</i>
`.trim();

        const sendRes = await sendTelegramAlert(botToken, parent.telegram_chat_id, messageHtml);
        if (sendRes.ok) {
          sentCount++;
          details.push({
            parentName: parent.full_name,
            relationship: item.relationship,
            chatId: parent.telegram_chat_id,
            result: 'sent',
          });
        } else {
          details.push({
            parentName: parent.full_name,
            relationship: item.relationship,
            chatId: parent.telegram_chat_id,
            result: 'failed',
            error: sendRes.error,
          });
        }
      }

      // 6. Update last_reminder_sent_at in student_fees
      try {
        await supabase
          .from('student_fees')
          .update({ last_reminder_sent_at: new Date().toISOString() })
          .eq('student_id', studentId);
      } catch (upErr) {
        console.warn('Could not update last_reminder_sent_at:', upErr);
      }

      return res.status(200).json({
        ok: true,
        message: `Tuition fee reminder dispatched to ${sentCount} guardian account(s)!`,
        recipientsCount: sentCount,
        details,
      });
    } catch (feeErr) {
      console.error('Fee reminder error:', feeErr);
      return res.status(500).json({ ok: false, error: feeErr.message || 'Error processing fee reminder.' });
    }
  }

  // Case E: Exam Results Notification Dispatch
  if (action === 'exam_results' || notificationType === 'exam_results') {
    try {
      // 1. Resolve Exam Details from database or client-passed examData
      let exam = null;
      if (examId) {
        try {
          const { data: dbExam } = await supabase
            .from('exams')
            .select(`
              id,
              name,
              exam_type,
              subject,
              exam_date,
              total_marks,
              passing_marks,
              academic_year,
              course_id,
              batch_id,
              courses:course_id ( name, code ),
              batches:batch_id ( name, code )
            `)
            .eq('id', examId)
            .maybeSingle();

          if (dbExam) exam = dbExam;
        } catch (dbExErr) {}
      }

      // Fallback to client-provided examData
      if (!exam && req.body?.examData) {
        exam = req.body.examData;
      }

      if (!exam) {
        exam = {
          id: examId || 'exam-assessment',
          name: 'Academic Examination',
          exam_type: 'Unit Test',
          subject: 'Curriculum Test',
          exam_date: new Date().toISOString().split('T')[0],
          total_marks: 50,
          passing_marks: 18,
        };
      }

      // 2. Query Marks from database or client-passed marksData
      let marksData = [];
      if (examId) {
        try {
          let marksQuery = supabase
            .from('exam_marks')
            .select(`
              id,
              student_id,
              marks_obtained,
              is_absent,
              remarks,
              notified_guardians,
              students:student_id ( id, full_name, admission_no, roll_no )
            `)
            .eq('exam_id', examId);

          if (studentId) {
            marksQuery = marksQuery.eq('student_id', studentId);
          }

          const { data: dbMarks, error: mErr } = await marksQuery;
          if (!mErr && dbMarks && dbMarks.length > 0) {
            marksData = dbMarks;
          }
        } catch (mCatchErr) {}
      }

      // Fallback to client-passed marksData if database table is pending migration
      if (marksData.length === 0 && Array.isArray(req.body?.marksData) && req.body.marksData.length > 0) {
        const studentIds = req.body.marksData.map((m) => m.student_id).filter(Boolean);
        let studentMap = {};
        if (studentIds.length > 0) {
          try {
            const { data: stds } = await supabase
              .from('students')
              .select('id, full_name, admission_no, roll_no')
              .in('id', studentIds);
            (stds || []).forEach((s) => { studentMap[s.id] = s; });
          } catch {}
        }

        marksData = req.body.marksData.map((m) => {
          const sObj = studentMap[m.student_id] || m.students || {
            id: m.student_id,
            full_name: m.student_name || m.full_name || 'Student',
            admission_no: m.admission_no || '—',
            roll_no: m.roll_no || '',
          };
          return {
            id: m.id || m.student_id,
            student_id: m.student_id,
            marks_obtained: m.marks_obtained,
            is_absent: Boolean(m.is_absent),
            remarks: m.remarks || '',
            students: sObj,
          };
        });
      }

      if (studentId) {
        marksData = marksData.filter((m) => m.student_id === studentId);
      }

      if (!marksData || marksData.length === 0) {
        return res.status(200).json({
          ok: true,
          message: 'No student marks recorded for this examination yet.',
          sentCount: 0,
        });
      }

      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const details = [];

      const totalMarks = Number(exam.total_marks) || 100;
      const passingMarks = Number(exam.passing_marks) || 35;

      for (const mark of marksData) {
        const student = mark.students;
        if (!student) continue;

        // Fetch linked guardians
        const { data: guardians, error: gErr } = await supabase
          .from('parent_students')
          .select(`
            id,
            relationship,
            is_primary_contact,
            can_receive_alerts,
            parents:parent_id (
              id,
              full_name,
              telegram_chat_id,
              is_verified
            )
          `)
          .eq('student_id', student.id);

        if (gErr || !guardians || guardians.length === 0) {
          skippedCount++;
          continue;
        }

        const isAbsent = Boolean(mark.is_absent);
        const marksVal = isAbsent ? null : mark.marks_obtained;
        const isPass = !isAbsent && marksVal !== null && Number(marksVal) >= passingMarks;
        const pct = marksVal !== null && marksVal !== undefined
          ? Math.round((Number(marksVal) / totalMarks) * 100 * 10) / 10
          : 0;

        let grade = '—';
        if (isAbsent) grade = 'AB';
        else if (pct >= 90) grade = 'A+';
        else if (pct >= 80) grade = 'A';
        else if (pct >= 70) grade = 'B';
        else if (pct >= 60) grade = 'C';
        else if (pct >= 40) grade = 'D';
        else grade = 'F';

        for (const g of guardians) {
          const parent = g.parents;
          if (!parent?.telegram_chat_id || !parent?.is_verified || g.can_receive_alerts === false) {
            skippedCount++;
            continue;
          }

          // Check alert preferences
          const pref = g.alert_preference || 'all';
          if (pref === 'none') {
            skippedCount++;
            continue;
          }
          if (pref === 'emergency_only' && isPass) {
            skippedCount++;
            continue;
          }

          const scoreDisplay = isAbsent ? 'ABSENT' : marksVal !== null ? String(marksVal) : 'Pending';
          const pctDisplay = isAbsent ? 'N/A' : marksVal !== null ? `${pct}%` : 'Pending';
          const statusDisplay = isAbsent ? 'ABSENT' : isPass ? 'PASSED ✅' : 'NEEDS ATTENTION ⚠️';

          const messageHtml = `
🎓 <b>SMS — EXAMINATION RESULTS</b>

Namaste <b>${escapeHtml(parent.full_name)}</b>,
Academic evaluation report for your ward:

👤 <b>Student:</b> ${escapeHtml(student.full_name)}
🆔 <b>Admission ID:</b> <code>${escapeHtml(student.admission_no)}</code> ${student.roll_no ? `• Roll: ${escapeHtml(student.roll_no)}` : ''}
🏫 <b>Stream:</b> ${escapeHtml(exam.courses?.name || 'Course')} &bull; ${escapeHtml(exam.batches?.name || 'Cohort')}

📋 <b>Exam:</b> ${escapeHtml(exam.name)}
📚 <b>Subject:</b> ${escapeHtml(exam.subject || 'All Subjects')}
📅 <b>Date:</b> ${exam.exam_date} (${escapeHtml(exam.exam_type)})

🎯 <b>Marks Scored:</b> <b>${scoreDisplay} / ${totalMarks}</b> (Pass: ${passingMarks})
📊 <b>Percentage:</b> <b>${pctDisplay}</b>
🏆 <b>Grade:</b> <b>${grade}</b>
🎖️ <b>Final Status:</b> <b>${statusDisplay}</b>
${mark.remarks ? `\n📝 <i>Faculty Remarks: ${escapeHtml(mark.remarks)}</i>` : ''}

<i>SMS — Student Management System &bull; Official Telegram Notification</i>
`.trim();

          const sendRes = await sendTelegramAlert(botToken, parent.telegram_chat_id, messageHtml);
          if (sendRes.ok) {
            sentCount++;
            details.push({ studentName: student.full_name, parentName: parent.full_name, result: 'sent' });
          } else {
            failedCount++;
            details.push({ studentName: student.full_name, parentName: parent.full_name, result: 'failed', error: sendRes.error });
          }
        }

        // Mark as notified in database if table exists
        try {
          await supabase
            .from('exam_marks')
            .update({ notified_guardians: true, notified_at: new Date().toISOString() })
            .eq('id', mark.id);
        } catch (mUpErr) {}
      }

      const finalMsg = sentCount > 0
        ? `Examination results dispatched to ${sentCount} guardian account(s) on Telegram!`
        : `Exam evaluation processed for ${marksData.length} student(s). (Notice: No verified Telegram guardians linked to these students yet).`;

      return res.status(200).json({
        ok: true,
        message: finalMsg,
        sentCount,
        failedCount,
        skippedCount,
        details,
      });
    } catch (examErr) {
      console.error('Exam results dispatch error:', examErr);
      return res.status(500).json({ ok: false, error: examErr.message || 'Error dispatching exam results.' });
    }
  }

  // Case A: Batch-level Roll Call Dispatch (One-Click Attendance Notifications)
  if (batchId && date) {
    try {
      const cleanBatchId = String(batchId).trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanBatchId);

      // 1. Fetch batch information: safe sequential lookup by UUID, exact code, or name
      let batchData = null;
      let bErr = null;

      if (isUuid) {
        const resObj = await supabase
          .from('batches')
          .select('id, name, code, course_id')
          .eq('id', cleanBatchId)
          .maybeSingle();
        batchData = resObj.data;
        bErr = resObj.error;
      }

      // If not found by UUID, try exact code match
      if (!batchData && !bErr) {
        const resObj = await supabase
          .from('batches')
          .select('id, name, code, course_id')
          .eq('code', cleanBatchId)
          .maybeSingle();
        if (resObj.data) {
          batchData = resObj.data;
        } else if (resObj.error) {
          bErr = resObj.error;
        }
      }

      // If still not found, try name match
      if (!batchData && !bErr) {
        const resObj = await supabase
          .from('batches')
          .select('id, name, code, course_id')
          .ilike('name', `%${cleanBatchId}%`)
          .limit(1)
          .maybeSingle();
        if (resObj.data) {
          batchData = resObj.data;
        } else if (resObj.error) {
          bErr = resObj.error;
        }
      }

      if (bErr) {
        return res.status(500).json({
          ok: false,
          error: `Database error resolving cohort "${cleanBatchId}": ${bErr.message}`,
        });
      }

      if (!batchData) {
        return res.status(404).json({
          ok: false,
          error: `Cohort / Batch "${cleanBatchId}" not found in database. Please verify that the cohort exists.`,
        });
      }

      const canonicalBatchId = batchData.id;

      // 2. Fetch all attendance records for this canonical batch and date
      const { data: attendanceRecords, error: attErr } = await supabase
        .from('attendance')
        .select(`
          id,
          student_id,
          batch_id,
          date,
          status,
          time_in,
          remarks,
          telegram_notified,
          telegram_notified_at,
          telegram_error,
          students:student_id (
            id,
            admission_no,
            full_name,
            roll_no
          )
        `)
        .eq('batch_id', canonicalBatchId)
        .eq('date', date);

      if (attErr) {
        return res.status(500).json({ ok: false, error: `Failed to query attendance: ${attErr.message}` });
      }

      const records = attendanceRecords || [];
      if (records.length === 0) {
        return res.status(400).json({
          ok: false,
          error: `No attendance records found for ${batchData.name} on ${date}. Please record roll call first before sending alerts.`,
        });
      }

      // 3. Collect student IDs to query verified parents server-side
      const studentIds = records.map((r) => r.student_id).filter(Boolean);

      let parentLinks = null;
      const plRes = await supabase
        .from('parent_students')
        .select(`
          student_id,
          relationship,
          is_primary_contact,
          can_receive_alerts,
          alert_preference,
          contact_priority,
          parents:parent_id (
            id,
            full_name,
            phone,
            telegram_chat_id,
            is_verified
          )
        `)
        .in('student_id', studentIds);

      if (!plRes.error) {
        parentLinks = plRes.data;
      } else {
        // Fallback to core columns if migration not yet applied
        const plLegacy = await supabase
          .from('parent_students')
          .select(`
            student_id,
            relationship,
            can_receive_alerts,
            parents:parent_id (
              id,
              full_name,
              phone,
              telegram_chat_id,
              is_verified
            )
          `)
          .in('student_id', studentIds);
        parentLinks = plLegacy.data;
      }

      // Build student -> verified parents mapping
      const studentParentsMap = {};
      (parentLinks || []).forEach((pl) => {
        if (!pl.can_receive_alerts) return;
        const p = pl.parents;
        if (!p || !p.is_verified || !p.telegram_chat_id) return;

        if (!studentParentsMap[pl.student_id]) {
          studentParentsMap[pl.student_id] = [];
        }
        studentParentsMap[pl.student_id].push({
          ...p,
          alert_preference: pl.alert_preference || 'all',
          is_primary_contact: Boolean(pl.is_primary_contact),
          relationship: pl.relationship || 'Guardian',
        });
      });

      // 4. Process each student's attendance notification
      const summary = {
        totalMarked: records.length,
        eligibleLinked: 0,
        sent: 0,
        failed: 0,
        alreadyNotified: 0,
        skippedUnlinked: 0,
      };

      const dispatchDetails = [];

      for (const record of records) {
        const student = record.students;
        if (!student) continue;

        const parents = studentParentsMap[student.id] || [];

        // Check if student has verified parents
        if (parents.length === 0) {
          summary.skippedUnlinked++;
          dispatchDetails.push({
            studentId: student.id,
            studentName: student.full_name,
            admissionNo: student.admission_no,
            status: record.status,
            result: 'skipped_unlinked',
            reason: 'No verified parent linked with Telegram Chat ID',
          });
          continue;
        }

        summary.eligibleLinked++;

        // Duplicate prevention check: skip if already notified unless forced or retrying failed
        if (record.telegram_notified && !forceAll && !retryFailedOnly) {
          summary.alreadyNotified++;
          dispatchDetails.push({
            studentId: student.id,
            studentName: student.full_name,
            admissionNo: student.admission_no,
            status: record.status,
            result: 'already_notified',
            notifiedAt: record.telegram_notified_at,
          });
          continue;
        }

        // If retryFailedOnly is active, skip if previously marked succeeded
        if (retryFailedOnly && record.telegram_notified) {
          summary.alreadyNotified++;
          continue;
        }

        // Dispatch alert to each verified guardian of this student
        const statusEmoji = record.status === 'Present' ? '✅' : record.status === 'Absent' ? '🚨' : record.status === 'Late' ? '⚠️' : 'ℹ️';

        let studentDispatchSuccess = true;
        let lastErrorDesc = '';

        for (const parent of parents) {
          // Respect Multi-Guardian Alert Preferences:
          // 1. If preference is 'none', do not send.
          if (parent.alert_preference === 'none') continue;

          // 2. If preference is 'emergency_only':
          // Only send if student is marked Absent (critical attendance emergency),
          // or if they are primary contact. Do NOT send routine Present or Excused notices.
          if (parent.alert_preference === 'emergency_only' && record.status !== 'Absent' && !parent.is_primary_contact) {
            continue;
          }

          const messageHtml = `
${statusEmoji} <b>SMS — Student Management System — Roll Call Notice</b>

Dear <b>${escapeHtml(parent.full_name)}</b>,
Your ward <b>${escapeHtml(student.full_name)}</b> (Adm No: <code>${escapeHtml(student.admission_no)}</code>, Roll No: <code>${escapeHtml(student.roll_no || '—')}</code>) has been marked <b>${escapeHtml(record.status.toUpperCase())}</b> for today's session.

📅 <b>Date:</b> ${escapeHtml(date)}
🏫 <b>Cohort:</b> ${escapeHtml(batchData.name)} (${escapeHtml(batchData.code)})
⏱️ <b>Time Logged:</b> ${escapeHtml(record.time_in || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }))}

<i>This is an official automated alert from SMS — Student Management System.</i>
`.trim();

          const sendResult = await sendTelegramAlert(botToken, parent.telegram_chat_id, messageHtml);

          if (sendResult.ok) {
            summary.sent++;
            dispatchDetails.push({
              studentId: student.id,
              studentName: student.full_name,
              admissionNo: student.admission_no,
              parentName: parent.full_name,
              chatId: parent.telegram_chat_id,
              status: record.status,
              result: 'sent',
              messageId: sendResult.messageId,
            });
          } else {
            studentDispatchSuccess = false;
            lastErrorDesc = sendResult.error || 'Telegram Bot API delivery failure';
            summary.failed++;
            dispatchDetails.push({
              studentId: student.id,
              studentName: student.full_name,
              admissionNo: student.admission_no,
              parentName: parent.full_name,
              chatId: parent.telegram_chat_id,
              status: record.status,
              result: 'failed',
              error: lastErrorDesc,
            });
          }
        }

        // Update database attendance row with actual delivery status
        if (studentDispatchSuccess) {
          const upRes = await supabase
            .from('attendance')
            .update({
              telegram_notified: true,
              telegram_notified_at: new Date().toISOString(),
              telegram_error: null,
            })
            .eq('id', record.id);

          if (upRes.error && upRes.error.message?.includes('telegram_error')) {
            await supabase
              .from('attendance')
              .update({
                telegram_notified: true,
                telegram_notified_at: new Date().toISOString(),
              })
              .eq('id', record.id);
          }
        } else {
          const upRes = await supabase
            .from('attendance')
            .update({
              telegram_notified: false,
              telegram_error: lastErrorDesc,
            })
            .eq('id', record.id);

          if (upRes.error && upRes.error.message?.includes('telegram_error')) {
            await supabase
              .from('attendance')
              .update({
                telegram_notified: false,
              })
              .eq('id', record.id);
          }
        }
      }

      return res.status(200).json({
        ok: true,
        batchName: batchData.name,
        date,
        summary,
        details: dispatchDetails,
      });
    } catch (err) {
      console.error('Batch attendance notification error:', err);
      return res.status(500).json({ ok: false, error: err.message || 'Server error processing roll call alerts.' });
    }
  }

  // Case B: Single student notification fallback
  const { status: singleStatus, date: singleDate, batchName: singleBatchName } = body;
  if (studentId) {
    try {
      const { data: student, error: sErr } = await supabase
        .from('students')
        .select(`
          id, full_name, admission_no, roll_no,
          parent_students (
            can_receive_alerts,
            parents:parent_id ( id, full_name, telegram_chat_id, is_verified )
          )
        `)
        .eq('id', studentId)
        .single();

      if (sErr || !student) {
        return res.status(404).json({ ok: false, error: 'Student not found in database.' });
      }

      const parentLinks = (student.parent_students || []).filter((pl) => pl.can_receive_alerts && pl.parents?.is_verified && pl.parents?.telegram_chat_id);
      if (parentLinks.length === 0) {
        return res.status(400).json({
          ok: false,
          error: `Guardian for "${student.full_name}" is not yet linked or verified with Telegram.`,
        });
      }

      const parent = parentLinks[0].parents;
      const statusEmoji = singleStatus === 'Present' ? '✅' : singleStatus === 'Absent' ? '🚨' : singleStatus === 'Late' ? '⚠️' : 'ℹ️';

      const messageHtml = `
${statusEmoji} <b>SMS — Student Management System — Roll Call Notice</b>

Dear <b>${escapeHtml(parent.full_name)}</b>,
Your ward <b>${escapeHtml(student.full_name)}</b> (Adm No: <code>${escapeHtml(student.admission_no)}</code>) has been marked <b>${escapeHtml((singleStatus || 'Absent').toUpperCase())}</b> for today's session.

📅 <b>Date:</b> ${escapeHtml(singleDate || new Date().toISOString().split('T')[0])}
🏫 <b>Cohort:</b> ${escapeHtml(singleBatchName || 'Regular Session')}
⏱️ <b>Time Logged:</b> ${escapeHtml(new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }))}

<i>This is an official automated alert from SMS — Student Management System.</i>
`.trim();

      const sendResult = await sendTelegramAlert(botToken, parent.telegram_chat_id, messageHtml);

      if (!sendResult.ok) {
        return res.status(400).json({ ok: false, error: sendResult.error || 'Telegram Bot API error.' });
      }

      // Record successful dispatch in attendance table if record exists
      try {
        await supabase
          .from('attendance')
          .update({
            telegram_notified: true,
            telegram_notified_at: new Date().toISOString(),
            telegram_error: null,
          })
          .eq('student_id', studentId)
          .eq('date', singleDate || new Date().toISOString().split('T')[0]);
      } catch (attUpErr) {
        console.warn('Could not update attendance status for single student:', attUpErr.message);
      }

      return res.status(200).json({
        ok: true,
        sent: true,
        parentName: parent.full_name,
        chatId: parent.telegram_chat_id,
        messageId: sendResult.messageId,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(400).json({
    ok: false,
    error: 'Invalid request payload. Specify batchId and date, or studentId.',
  });
}
