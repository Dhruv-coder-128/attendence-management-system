import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Secure Telegram Attendance Alert Dispatcher
 * 
 * Security & Integrity:
 * - Server-side resolution of student-to-parent relationships from Supabase.
 * - Never trusts client-supplied chat IDs or parent IDs.
 * - Enforces duplicate prevention: skips already notified records unless retry is requested.
 * - Supports batch-level dispatch ("Send Attendance Notifications") and single-student retry.
 * - Keeps attendance record intact if sending fails, recording the exact Telegram API error.
 * - Accurately categorizes sent, failed, alreadyNotified, and skippedUnlinked.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in server environment variables.',
    });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({
      ok: false,
      error: 'Supabase credentials are not configured in server environment variables.',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const body = req.body || {};

  // Case A: Batch-level Roll Call Dispatch (One-Click Attendance Notifications)
  const { batchId, date, sessionName = 'Regular', retryFailedOnly = false, forceAll = false } = body;

  if (batchId && date) {
    try {
      // 1. Fetch batch information
      const { data: batchData, error: bErr } = await supabase
        .from('batches')
        .select('id, name, code')
        .eq('id', batchId)
        .single();

      if (bErr || !batchData) {
        return res.status(404).json({ ok: false, error: 'Cohort / Batch not found in database.' });
      }

      // 2. Fetch all attendance records for this batch and date
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
        .eq('batch_id', batchId)
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

      const { data: parentLinks, error: plErr } = await supabase
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

      if (plErr) {
        return res.status(500).json({ ok: false, error: `Failed to query parent linkages: ${plErr.message}` });
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
        studentParentsMap[pl.student_id].push(p);
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
          const messageText = `
${statusEmoji} *Ruparel Attendance ERP — Roll Call Notice*

Dear *${parent.full_name}*,
Your ward *${student.full_name}* (Adm No: \`${student.admission_no}\`, Roll No: \`${student.roll_no || '—'}\`) has been marked *${record.status.toUpperCase()}* for today's session.

📅 *Date:* ${date}
🏫 *Cohort:* ${batchData.name} (${batchData.code})
⏱️ *Time Logged:* ${record.time_in || new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}

_This is an official automated alert from Ruparel Attendance Management System._
`.trim();

          try {
            const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: parent.telegram_chat_id,
                text: messageText,
                parse_mode: 'Markdown',
              }),
            });

            const tgData = await tgResponse.json();

            if (tgResponse.ok && tgData.ok) {
              summary.sent++;
              dispatchDetails.push({
                studentId: student.id,
                studentName: student.full_name,
                admissionNo: student.admission_no,
                parentName: parent.full_name,
                chatId: parent.telegram_chat_id,
                status: record.status,
                result: 'sent',
                messageId: tgData.result?.message_id,
              });
            } else {
              studentDispatchSuccess = false;
              lastErrorDesc = tgData.description || `HTTP ${tgResponse.status}`;
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
          } catch (netErr) {
            studentDispatchSuccess = false;
            lastErrorDesc = netErr.message;
            summary.failed++;
            dispatchDetails.push({
              studentId: student.id,
              studentName: student.full_name,
              admissionNo: student.admission_no,
              parentName: parent.full_name,
              chatId: parent.telegram_chat_id,
              status: record.status,
              result: 'failed',
              error: netErr.message,
            });
          }
        }

        // Update database attendance row with actual delivery status
        if (studentDispatchSuccess) {
          await supabase
            .from('attendance')
            .update({
              telegram_notified: true,
              telegram_notified_at: new Date().toISOString(),
              telegram_error: null,
            })
            .eq('id', record.id);
        } else {
          await supabase
            .from('attendance')
            .update({
              telegram_notified: false,
              telegram_error: lastErrorDesc,
            })
            .eq('id', record.id);
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
  const { studentId, status: singleStatus, date: singleDate, batchName: singleBatchName } = body;
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

      const messageText = `
${statusEmoji} *Ruparel Attendance ERP — Roll Call Notice*

Dear *${parent.full_name}*,
Your ward *${student.full_name}* (Adm No: \`${student.admission_no}\`) has been marked *${(singleStatus || 'Absent').toUpperCase()}* for today's session.

📅 *Date:* ${singleDate || new Date().toISOString().split('T')[0]}
🏫 *Cohort:* ${singleBatchName || 'Regular Session'}
⏱️ *Time Logged:* ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}

_This is an official automated alert from Ruparel Attendance Management System._
`.trim();

      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: parent.telegram_chat_id,
          text: messageText,
          parse_mode: 'Markdown',
        }),
      });

      const tgData = await tgResponse.json();
      if (!tgResponse.ok || !tgData.ok) {
        return res.status(400).json({ ok: false, error: tgData.description || 'Telegram Bot API error.' });
      }

      return res.status(200).json({
        ok: true,
        sent: true,
        parentName: parent.full_name,
        chatId: parent.telegram_chat_id,
        messageId: tgData.result?.message_id,
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
