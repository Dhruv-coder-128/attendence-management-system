import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  CheckSquare,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Users,
  Search,
  UserCheck,
  ExternalLink,
  ShieldCheck,
  Copy,
  MessageCircle,
  CheckCircle2,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  ensureDhruvShahTestStudent,
  TEST_STUDENT_NAME,
  TEST_STUDENT_ADMISSION_NO,
} from '../lib/testStudent';
import {
  getParentTelegramDeepLink,
  linkParentTelegramAccount,
  sendVerifiedAttendanceNotice,
  sendBatchAttendanceNotifications,
  TELEGRAM_BOT_USERNAME,
} from '../lib/telegramClient';

/**
 * Daily Attendance Register — Real Supabase Database Connection
 */
export default function AttendancePage({ onRefreshCounts }) {
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Students in selected batch & Attendance records
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({}); // { student_id: record }
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Bulk Attendance Notification State
  const [isBulkNotifyModalOpen, setIsBulkNotifyModalOpen] = useState(false);
  const [isDispatchingBatch, setIsDispatchingBatch] = useState(false);
  const [bulkNotifyResults, setBulkNotifyResults] = useState(null);
  const [retryFailedOnly, setRetryFailedOnly] = useState(false);

  // Test Student & Telegram Modal State
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const [activeTestStudent, setActiveTestStudent] = useState(null);
  const [testChatIdInput, setTestChatIdInput] = useState('');
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  const [telegramDispatchStatus, setTelegramDispatchStatus] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch available batches (all cohorts from public.batches)
  const fetchBatches = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    try {
      // Query all batches in database without restrictive filters
      const { data, error: err } = await supabase
        .from('batches')
        .select('id, name, code, timing, classroom, is_active')
        .order('name');

      if (err) throw err;

      const batchList = data || [];
      setBatches(batchList);

      if (batchList.length > 0) {
        setSelectedBatchId((prev) => {
          if (prev && batchList.some((b) => b.id === prev)) {
            return prev;
          }
          return batchList[0].id;
        });
      } else {
        setSelectedBatchId('');
        setStudents([]);
        setLoading(false);
      }
    } catch (err) {
      console.error('Error fetching batches for attendance:', err);
      setError(err.message || 'Failed to load batches from Supabase.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  // 2. Fetch students in the selected batch and existing attendance for the date
  const fetchBatchAttendance = async () => {
    if (!selectedBatchId) {
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch students in this batch with linked parent details for Telegram routing
      const { data: studentsData, error: studentsErr } = await supabase
        .from('students')
        .select(`
          id,
          admission_no,
          full_name,
          roll_no,
          status,
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
        .eq('batch_id', selectedBatchId)
        .order('admission_no');

      if (studentsErr) throw studentsErr;

      // Fetch attendance records for this batch and date
      const { data: attendanceData, error: attendanceErr } = await supabase
        .from('attendance')
        .select('*')
        .eq('batch_id', selectedBatchId)
        .eq('date', selectedDate);

      if (attendanceErr) throw attendanceErr;

      // Map attendance by student_id
      const map = {};
      (attendanceData || []).forEach((att) => {
        map[att.student_id] = att;
      });

      setStudents(studentsData || []);
      setAttendanceMap(map);
    } catch (err) {
      console.error('Error fetching attendance:', err);
      setError(err.message || 'Failed to load roll call data from Supabase.');
    } finally {
      // Ensure loading spinner ALWAYS terminates
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedBatchId) {
      fetchBatchAttendance();
    }
  }, [selectedBatchId, selectedDate]);

  const activeBatch = batches.find((b) => b.id === selectedBatchId);

  // 3. Mark Single Student Attendance (Upsert in Supabase)
  const handleMarkStatus = async (studentId, status) => {
    setSavingId(studentId);

    // Optimistic UI update
    const previous = attendanceMap[studentId];
    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const optimistic = {
      ...previous,
      student_id: studentId,
      batch_id: selectedBatchId,
      date: selectedDate,
      session_name: 'Regular',
      status,
      time_in: status === 'Present' || status === 'Late' ? nowTime : null,
    };
    setAttendanceMap((prev) => ({ ...prev, [studentId]: optimistic }));

    try {
      const payload = {
        student_id: studentId,
        batch_id: selectedBatchId,
        date: selectedDate,
        session_name: 'Regular',
        status,
        time_in: status === 'Present' || status === 'Late' ? nowTime : null,
      };

      const { data, error: upsertErr } = await supabase
        .from('attendance')
        .upsert(payload, { onConflict: 'student_id,batch_id,date,session_name' })
        .select()
        .single();

      if (upsertErr) throw upsertErr;

      setAttendanceMap((prev) => ({ ...prev, [studentId]: data }));
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Failed to mark attendance:', err);
      alert('Error updating attendance: ' + err.message);
      // Revert to previous
      setAttendanceMap((prev) => ({ ...prev, [studentId]: previous }));
    } finally {
      setSavingId(null);
    }
  };

  // 4. Mark All Present (Batch Upsert in Supabase)
  const handleMarkAllPresent = async () => {
    if (students.length === 0) return;
    setLoading(true);

    const nowTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });

    try {
      const payloads = students.map((s) => ({
        student_id: s.id,
        batch_id: selectedBatchId,
        date: selectedDate,
        session_name: 'Regular',
        status: 'Present',
        time_in: nowTime,
        remarks: 'Bulk roll call marked Present',
      }));

      const { data, error: batchErr } = await supabase
        .from('attendance')
        .upsert(payloads, { onConflict: 'student_id,batch_id,date,session_name' })
        .select();

      if (batchErr) throw batchErr;

      const newMap = {};
      (data || []).forEach((att) => {
        newMap[att.student_id] = att;
      });
      setAttendanceMap((prev) => ({ ...prev, ...newMap }));

      showToast(`Marked ${students.length} students as Present in Supabase!`);
    } catch (err) {
      console.error('Error marking all present:', err);
      alert('Failed to mark all present: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. Ensure Test Student (Dhruv Shah) Handler
  const handleEnsureTestStudent = async () => {
    setLoading(true);
    try {
      const res = await ensureDhruvShahTestStudent();
      if (!res.success) {
        alert(res.error);
        return;
      }
      showToast(res.message);
      if (onRefreshCounts) onRefreshCounts();

      // If Dhruv Shah is assigned to another batch, switch to that batch to display him
      if (res.student && res.student.batch_id && res.student.batch_id !== selectedBatchId) {
        setSelectedBatchId(res.student.batch_id);
      } else {
        await fetchBatchAttendance();
      }
    } catch (err) {
      console.error('Error ensuring test student:', err);
      alert('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 6. Telegram Modal Handlers
  const handleOpenTelegramModal = (student) => {
    setActiveTestStudent(student);
    setTelegramDispatchStatus(null);
    const parent = student.parent_students?.[0]?.parents;
    setTestChatIdInput(parent?.telegram_chat_id || '');
    setIsTelegramModalOpen(true);
  };

  const handleLinkParentTelegram = async (e) => {
    e.preventDefault();
    if (!activeTestStudent) return;
    const parent = activeTestStudent.parent_students?.[0]?.parents;

    if (!parent) {
      alert('No guardian is currently linked to this student ward. Please add or link a guardian in Parent Directory first.');
      return;
    }

    if (!testChatIdInput.trim()) {
      alert('Please enter a valid numeric Telegram Chat ID (e.g. from @userinfobot).');
      return;
    }

    setIsLinkingTelegram(true);
    try {
      await linkParentTelegramAccount(parent.id, testChatIdInput.trim());
      showToast(`Guardian Telegram Chat ID linked and verified!`);
      await fetchBatchAttendance();

      // Update active student in modal
      setActiveTestStudent((prev) => {
        if (!prev) return null;
        const updatedPs = (prev.parent_students || []).map((ps) => ({
          ...ps,
          parents: { ...ps.parents, telegram_chat_id: testChatIdInput.trim(), is_verified: true },
        }));
        return { ...prev, parent_students: updatedPs };
      });
    } catch (err) {
      alert('Failed to link Telegram Chat ID: ' + err.message);
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  const handleDispatchTelegramTest = async () => {
    if (!activeTestStudent) return;
    const parent = activeTestStudent.parent_students?.[0]?.parents;
    const record = attendanceMap[activeTestStudent.id];
    const currentStatus = record?.status || 'Absent';

    setTelegramDispatchStatus({ sending: true });

    const result = await sendVerifiedAttendanceNotice({
      student: activeTestStudent,
      status: currentStatus,
      date: selectedDate,
      batchName: activeBatch?.name,
      parent,
    });

    if (result.success) {
      setTelegramDispatchStatus({
        success: true,
        message: `Official alert successfully dispatched to verified Chat ID: ${result.chatId}!`,
      });

      // Update record in public.attendance
      if (record?.id) {
        await supabase
          .from('attendance')
          .update({ telegram_notified: true, telegram_notified_at: new Date().toISOString() })
          .eq('id', record.id);

        setAttendanceMap((prev) => ({
          ...prev,
          [activeTestStudent.id]: {
            ...prev[activeTestStudent.id],
            telegram_notified: true,
            telegram_notified_at: new Date().toISOString(),
          },
        }));
      }
    } else {
      setTelegramDispatchStatus({
        success: false,
        error: result.error,
        requiresLinking: result.requiresLinking,
        deepLink: result.deepLink,
      });
    }
  };

  // Eligible Linked Guardians in current batch
  const eligibleLinkedCount = useMemo(() => {
    return students.filter((s) => {
      const parent = s.parent_students?.[0]?.parents;
      return parent?.is_verified && Boolean(parent?.telegram_chat_id);
    }).length;
  }, [students]);

  // Bulk Attendance Notification Dispatcher (Server-Side Resolution)
  const handleSendAttendanceNotifications = async (isRetry = false) => {
    if (!selectedBatchId || !selectedDate) {
      alert('Please select an academic cohort and roll call date.');
      return;
    }

    setIsDispatchingBatch(true);
    try {
      const result = await sendBatchAttendanceNotifications({
        batchId: selectedBatchId,
        date: selectedDate,
        retryFailedOnly: isRetry || retryFailedOnly,
        forceAll: false,
      });

      if (result.success) {
        setBulkNotifyResults({
          ok: true,
          summary: result.summary,
          details: result.details || [],
          batchName: result.batchName || activeBatch?.name,
          date: result.date || selectedDate,
        });

        showToast(
          `Alerts processed: ${result.summary.sent} dispatched, ${result.summary.alreadyNotified} already notified, ${result.summary.failed} failed.`
        );

        // Re-fetch attendance records so UI reflects latest telegram_notified flags
        await fetchBatchAttendance();
        if (onRefreshCounts) onRefreshCounts();
      } else {
        setBulkNotifyResults({
          ok: false,
          error: result.error || 'Server rejected attendance alert dispatch.',
          summary: result.summary,
        });
      }
    } catch (err) {
      console.error('Batch notify error:', err);
      setBulkNotifyResults({
        ok: false,
        error: err.message || 'Network error executing notification dispatcher.',
      });
    } finally {
      setIsDispatchingBatch(false);
    }
  };

  // Live Metric Counts
  const totalCount = students.length;
  const presentCount = students.filter((s) => attendanceMap[s.id]?.status === 'Present').length;
  const absentCount = students.filter((s) => attendanceMap[s.id]?.status === 'Absent').length;
  const lateCount = students.filter((s) => attendanceMap[s.id]?.status === 'Late').length;
  const excusedCount = students.filter((s) => attendanceMap[s.id]?.status === 'Excused').length;
  const markedCount = presentCount + absentCount + lateCount + excusedCount;
  const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily Attendance Register</h1>
          <p className="page-description">
            Live Roll Call Register &bull; Persisting to Supabase PostgreSQL (<code>public.attendance</code>)
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            size="sm"
            icon={Send}
            onClick={() => {
              setBulkNotifyResults(null);
              setIsBulkNotifyModalOpen(true);
            }}
            disabled={loading || students.length === 0}
          >
            Send Attendance Notifications
          </Button>

          <Button
            variant="gold"
            size="sm"
            icon={Sparkles}
            onClick={handleEnsureTestStudent}
          >
            Ensure Dhruv Shah (Test Student)
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchBatchAttendance}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={CheckSquare}
            onClick={handleMarkAllPresent}
            disabled={loading || students.length === 0}
          >
            Mark All Present
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            borderRadius: '6px',
            color: 'var(--status-absent)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong>Database Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Filter Toolbar: Date & Batch Selection */}
      <div
        className="erp-card"
        style={{
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
          <label className="form-label" style={{ marginBottom: '4px' }}>
            Roll Call Date
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="form-input"
          />
        </div>

        <div style={{ flex: '2 1 240px', minWidth: '200px' }}>
          <label className="form-label" style={{ marginBottom: '4px' }}>
            Academic Cohort / Batch
          </label>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="form-select"
          >
            {batches.length === 0 ? (
              <option value="">No batches created yet</option>
            ) : (
              batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name} ({b.timing || 'Schedule TBD'})
                </option>
              ))
            )}
          </select>
        </div>

        {activeBatch && (
          <div
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              alignSelf: 'flex-end',
              marginBottom: '2px',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>Classroom: </span>
            <strong>{activeBatch.classroom || 'TBD'}</strong>
          </div>
        )}
      </div>

      {/* Real-time Roll Call Counter Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--navy-900)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Enrolled
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)' }}>
            {totalCount} Students
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-present)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Present
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-present)' }}>
            {presentCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-absent)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Absent
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-absent)' }}>
            {absentCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-late)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Late
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-late)' }}>
            {lateCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-excused)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Excused
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-excused)' }}>
            {excusedCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--gold-primary)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Attendance Rate
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--gold-dark)' }}>
            {attendanceRate}%
          </div>
        </div>
      </div>

      {/* Attendance Register Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Admission No</th>
                <th>Student Name</th>
                <th>Roll No</th>
                <th>Current Status</th>
                <th style={{ textAlign: 'center' }}>Mark Status (Direct to Supabase)</th>
                <th>Time In</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading student register for {selectedDate}...</div>
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Users size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      No Students Enrolled in this Batch
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '420px', margin: '4px auto 0' }}>
                      {batches.length === 0
                        ? 'Create batches and enroll students to start tracking attendance.'
                        : 'Go to Students Directory to assign students to this batch, or select a different batch above.'}
                    </div>
                  </td>
                </tr>
              ) : (
                students.map((student, index) => {
                  const record = attendanceMap[student.id];
                  const currentStatus = record?.status || 'Unmarked';
                  const isRowSaving = savingId === student.id;

                  return (
                    <tr key={student.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{index + 1}</td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
                          {student.admission_no}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <strong style={{ color: 'var(--navy-950)' }}>{student.full_name}</strong>
                          {(student.full_name === TEST_STUDENT_NAME || student.admission_no === TEST_STUDENT_ADMISSION_NO) && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--gold-subtle-bg)',
                                color: 'var(--gold-dark)',
                                border: '1px solid var(--gold-border)',
                              }}
                            >
                              ⭐ Test Student
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {student.roll_no || '—'}
                      </td>
                      <td>
                        {record ? (
                          <Badge status={record.status} />
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              backgroundColor: '#f1f5f9',
                              color: '#64748b',
                            }}
                          >
                            Unmarked
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {/* Interactive 4-Way Status Selector */}
                        <div
                          style={{
                            display: 'inline-flex',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            overflow: 'hidden',
                            opacity: isRowSaving ? 0.6 : 1,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleMarkStatus(student.id, 'Present')}
                            disabled={isRowSaving}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer',
                              backgroundColor:
                                currentStatus === 'Present' ? 'var(--status-present)' : 'transparent',
                              color: currentStatus === 'Present' ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            Present
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMarkStatus(student.id, 'Absent')}
                            disabled={isRowSaving}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderLeft: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              backgroundColor:
                                currentStatus === 'Absent' ? 'var(--status-absent)' : 'transparent',
                              color: currentStatus === 'Absent' ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            Absent
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMarkStatus(student.id, 'Late')}
                            disabled={isRowSaving}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderLeft: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              backgroundColor:
                                currentStatus === 'Late' ? 'var(--status-late)' : 'transparent',
                              color: currentStatus === 'Late' ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            Late
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMarkStatus(student.id, 'Excused')}
                            disabled={isRowSaving}
                            style={{
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              borderLeft: '1px solid var(--border-subtle)',
                              cursor: 'pointer',
                              backgroundColor:
                                currentStatus === 'Excused' ? 'var(--status-excused)' : 'transparent',
                              color: currentStatus === 'Excused' ? '#ffffff' : 'var(--text-secondary)',
                            }}
                          >
                            Excused
                          </button>
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {record?.time_in || '—'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                          {record?.telegram_notified ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: 'var(--status-present)',
                                fontWeight: 600,
                              }}
                              title={`Dispatched at ${record.telegram_notified_at || 'today'}`}
                            >
                              <CheckCircle2 size={13} /> Telegram Sent
                            </span>
                          ) : record?.telegram_delivery_status === 'failed' || record?.telegram_error ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: 'var(--status-absent)',
                                fontWeight: 600,
                              }}
                              title={record.telegram_error || 'Delivery failed'}
                            >
                              <AlertCircle size={13} /> Alert Failed
                            </span>
                          ) : student.parent_students?.[0]?.parents?.is_verified && student.parent_students?.[0]?.parents?.telegram_chat_id ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11px',
                                color: '#0369a1',
                                fontWeight: 500,
                              }}
                              title="Guardian linked & ready to receive alert"
                            >
                              Parent Linked
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Unlinked
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleOpenTelegramModal(student)}
                            className="btn btn-outline"
                            style={{
                              padding: '3px 8px',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title="Open Telegram Parent Alert & Deep Link Manager"
                          >
                            <MessageCircle size={12} color="var(--gold-dark)" />
                            Alert
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Telegram Parent Alert & Deep Link Verification Modal */}
      {isTelegramModalOpen && activeTestStudent && (
        <Modal
          isOpen={isTelegramModalOpen}
          onClose={() => setIsTelegramModalOpen(false)}
          title={`Telegram Parent Alert & Linking — ${activeTestStudent.full_name}`}
          subtitle={`Student Admission No: ${activeTestStudent.admission_no} • Official Deep Link Integration`}
          size="md"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => setIsTelegramModalOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          {(() => {
            const parent = activeTestStudent.parent_students?.[0]?.parents;
            const record = attendanceMap[activeTestStudent.id];
            const currentStatus = record?.status || 'Unmarked';
            const deepLinkInfo = parent ? getParentTelegramDeepLink(parent.id) : '';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Ward and Guardian Overview */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Student Ward:</span>
                    <strong>{activeTestStudent.full_name} ({activeTestStudent.admission_no})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Linked Guardian:</span>
                    <strong>{parent?.full_name || 'No guardian linked'} {parent?.relationship ? `(${parent.relationship})` : ''}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Current Roll Call Status:</span>
                    <Badge status={currentStatus}>{currentStatus}</Badge>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Telegram Status:</span>
                    {parent?.is_verified && parent?.telegram_chat_id ? (
                      <span style={{ color: 'var(--status-present)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Verified (Chat ID: {parent.telegram_chat_id})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--status-absent)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={13} /> Not Linked / Unverified
                      </span>
                    )}
                  </div>
                </div>

                {/* Step A: One-Time Deep Link */}
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                  }}
                >
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={16} color="var(--gold-dark)" />
                    1. Secure Parent Linking Deep Link
                  </h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    To ensure parent privacy, notifications are strictly dispatched only after the guardian verifies their Telegram account.
                  </p>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      readOnly
                      value={deepLinkInfo || 'Please link guardian in Parent Directory to generate token.'}
                      className="form-input"
                      style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', flex: 1, backgroundColor: '#f8fafc' }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Copy}
                      onClick={() => {
                        if (deepLinkInfo) {
                          navigator.clipboard.writeText(deepLinkInfo);
                          showToast('Telegram deep link copied to clipboard!');
                        }
                      }}
                      disabled={!deepLinkInfo}
                    >
                      Copy
                    </Button>
                    {deepLinkInfo && (
                      <a
                        href={deepLinkInfo}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-outline"
                        style={{ display: 'inline-flex', alignItems: 'center', padding: '6px 8px' }}
                        title="Open in Telegram Web / App"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Step B: Manual Chat ID Verification Form */}
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                  }}
                >
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '4px' }}>
                    2. Link or Update Telegram Chat ID
                  </h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Enter the parent's Telegram numeric chat identifier (retrieved via Telegram Bot <code>/start</code> or <code>@userinfobot</code>).
                  </p>
                  <form onSubmit={handleLinkParentTelegram} style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder="e.g. 123456789"
                      value={testChatIdInput}
                      onChange={(e) => setTestChatIdInput(e.target.value)}
                      className="form-input"
                      style={{ flex: 1, fontSize: '12px' }}
                      required
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      icon={CheckCircle2}
                      disabled={isLinkingTelegram || !parent}
                    >
                      {isLinkingTelegram ? 'Linking...' : 'Verify & Link'}
                    </Button>
                  </form>
                </div>

                {/* Step C: Safe Test Workflow Dispatch */}
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: parent?.is_verified ? 'var(--status-present-bg)' : '#f8fafc',
                    border: parent?.is_verified ? '1px solid var(--status-present-border)' : '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                  }}
                >
                  <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '4px' }}>
                    3. Dispatch Roll Call Telegram Notice
                  </h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Dispatches official notification for <strong>{activeTestStudent.full_name}</strong> to their verified parent.
                  </p>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button
                      variant={parent?.is_verified ? 'gold' : 'outline'}
                      size="sm"
                      icon={Send}
                      disabled={!parent?.is_verified || telegramDispatchStatus?.sending}
                      onClick={handleDispatchTelegramTest}
                    >
                      {telegramDispatchStatus?.sending ? 'Sending Alert...' : 'Dispatch Verified Alert'}
                    </Button>

                    {!parent?.is_verified && (
                      <span style={{ fontSize: '11px', color: 'var(--status-absent)' }}>
                        Alerts disabled until parent is verified.
                      </span>
                    )}
                  </div>

                  {telegramDispatchStatus && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        backgroundColor: telegramDispatchStatus.success ? '#ffffff' : 'var(--status-absent-bg)',
                        color: telegramDispatchStatus.success ? 'var(--status-present)' : 'var(--status-absent)',
                        border: telegramDispatchStatus.success ? '1px solid var(--status-present-border)' : '1px solid var(--status-absent-border)',
                      }}
                    >
                      {telegramDispatchStatus.success ? (
                        <div>
                          <strong>Dispatched:</strong> {telegramDispatchStatus.message}
                        </div>
                      ) : (
                        <div>
                          <strong>Dispatch Guard:</strong> {telegramDispatchStatus.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {/* SEND BATCH ATTENDANCE NOTIFICATIONS MODAL */}
      {isBulkNotifyModalOpen && (
        <Modal
          isOpen={isBulkNotifyModalOpen}
          onClose={() => setIsBulkNotifyModalOpen(false)}
          title="Send Batch Attendance Notifications"
          subtitle={`Academic Cohort: ${activeBatch?.name || 'Selected Cohort'} • Date: ${selectedDate}`}
          size="lg"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {bulkNotifyResults ? (
                  <span>Verified Telegram Bot API delivery records</span>
                ) : (
                  <span>Strict privacy: Guardians receive only their own child's roll call status</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsBulkNotifyModalOpen(false)}
                >
                  Close
                </Button>
                {!bulkNotifyResults ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Send}
                    onClick={() => handleSendAttendanceNotifications(false)}
                    disabled={isDispatchingBatch || markedCount === 0}
                  >
                    {isDispatchingBatch ? 'Dispatching Notices...' : 'Dispatch Parent Notices'}
                  </Button>
                ) : bulkNotifyResults.summary?.failed > 0 ? (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => handleSendAttendanceNotifications(true)}
                    disabled={isDispatchingBatch}
                  >
                    {isDispatchingBatch ? 'Retrying Failed...' : `Retry ${bulkNotifyResults.summary.failed} Failed`}
                  </Button>
                ) : (
                  <Button
                    variant="gold"
                    size="sm"
                    icon={RefreshCw}
                    onClick={() => handleSendAttendanceNotifications(false)}
                    disabled={isDispatchingBatch}
                  >
                    Re-dispatch Batch
                  </Button>
                )}
              </div>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Step 1: Pre-dispatch Confirmation & Eligibility Overview */}
            {!bulkNotifyResults && (
              <>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '10px',
                  }}
                >
                  <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid var(--border-subtle)', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Enrolled</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)' }}>{totalCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: 'var(--status-present-bg)', borderRadius: '6px', border: '1px solid var(--status-present-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--status-present)' }}>Present / Late</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-present)' }}>{presentCount + lateCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: 'var(--status-absent-bg)', borderRadius: '6px', border: '1px solid var(--status-absent-border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--status-absent)' }}>Absent</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-absent)' }}>{absentCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#e0f2fe', borderRadius: '6px', border: '1px solid #bae6fd', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#0369a1' }}>Linked Guardians</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0369a1' }}>{eligibleLinkedCount}</div>
                  </div>
                </div>

                {markedCount === 0 && (
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: 'var(--status-absent-bg)',
                      border: '1px solid var(--status-absent-border)',
                      borderRadius: '6px',
                      color: 'var(--status-absent)',
                      fontSize: '12px',
                    }}
                  >
                    <strong>Notice:</strong> Roll call has not been marked yet for {selectedDate}. Please mark students Present or Absent before sending notifications.
                  </div>
                )}

                {/* Privacy & Anti-Duplicate Guarantees */}
                <div
                  style={{
                    padding: '14px',
                    border: '1px solid var(--gold-border)',
                    borderRadius: '6px',
                    backgroundColor: 'var(--gold-subtle-bg)',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ fontWeight: 700, color: 'var(--navy-950)', marginBottom: '6px' }}>
                    Automated Telegram Parent Notice Rules:
                  </div>
                  <ul style={{ margin: '0 0 0 16px', padding: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    <li>
                      <strong>Zero Privacy Leaks:</strong> Every notification is resolved server-side from <code>public.parent_students</code>. Parents receive strictly their child's individual attendance record.
                    </li>
                    <li>
                      <strong>Duplicate Suppression:</strong> Students already notified for date <code>{selectedDate}</code> are skipped automatically to avoid repeated spam.
                    </li>
                    <li>
                      <strong>Verified Deliveries Only:</strong> Status is marked <code>telegram_notified: true</code> in PostgreSQL only when Telegram Bot API confirms HTTP 200 message delivery.
                    </li>
                  </ul>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="retryFailedOnlyCheckbox"
                    checked={retryFailedOnly}
                    onChange={(e) => setRetryFailedOnly(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="retryFailedOnlyCheckbox" style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--navy-900)', fontWeight: 500 }}>
                    Only retry failed notices (skip all newly marked or pending students)
                  </label>
                </div>
              </>
            )}

            {/* Step 2: Post-dispatch Results View */}
            {bulkNotifyResults && (
              <div>
                {bulkNotifyResults.ok ? (
                  <>
                    {/* Live Metric Counters */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                        gap: '8px',
                        marginBottom: '14px',
                      }}
                    >
                      <div style={{ padding: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Roll Call</div>
                        <div style={{ fontSize: '16px', fontWeight: 700 }}>{bulkNotifyResults.summary.totalMarked}</div>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#e0f2fe', borderRadius: '4px', textAlign: 'center', border: '1px solid #bae6fd' }}>
                        <div style={{ fontSize: '11px', color: '#0369a1' }}>Eligible</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#0369a1' }}>{bulkNotifyResults.summary.eligibleLinked}</div>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: 'var(--status-present-bg)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--status-present-border)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--status-present)' }}>Dispatched</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-present)' }}>{bulkNotifyResults.summary.sent}</div>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#fef3c7', borderRadius: '4px', textAlign: 'center', border: '1px solid #fde68a' }}>
                        <div style={{ fontSize: '11px', color: '#92400e' }}>Prev. Sent</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#92400e' }}>{bulkNotifyResults.summary.alreadyNotified}</div>
                      </div>
                      <div style={{ padding: '8px', backgroundColor: '#f8fafc', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unlinked</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-secondary)' }}>{bulkNotifyResults.summary.skippedUnlinked}</div>
                      </div>
                      {bulkNotifyResults.summary.failed > 0 && (
                        <div style={{ padding: '8px', backgroundColor: 'var(--status-absent-bg)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--status-absent-border)' }}>
                          <div style={{ fontSize: '11px', color: 'var(--status-absent)' }}>Failed</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-absent)' }}>{bulkNotifyResults.summary.failed}</div>
                        </div>
                      )}
                    </div>

                    {/* Detailed Delivery Ledger */}
                    <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      Notification Audit Log ({bulkNotifyResults.details.length} records)
                    </div>
                    <div
                      style={{
                        maxHeight: '280px',
                        overflowY: 'auto',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                      }}
                    >
                      <table className="erp-table" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr>
                            <th>Student Ward</th>
                            <th>Status</th>
                            <th>Guardian Name</th>
                            <th>Telegram Chat</th>
                            <th style={{ textAlign: 'right' }}>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkNotifyResults.details.map((d) => (
                            <tr key={d.studentId}>
                              <td>
                                <strong>{d.studentName}</strong>
                              </td>
                              <td>
                                <Badge status={d.status}>{d.status}</Badge>
                              </td>
                              <td>{d.parentName || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>None linked</span>}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                                {d.chatId || '—'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                {d.result === 'sent' ? (
                                  <span style={{ color: 'var(--status-present)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                    <CheckCircle2 size={12} /> Dispatched
                                  </span>
                                ) : d.result === 'already_notified' ? (
                                  <span style={{ color: '#0369a1', fontSize: '11px' }}>
                                    Already Sent
                                  </span>
                                ) : d.result === 'failed' ? (
                                  <span style={{ color: 'var(--status-absent)', fontWeight: 600, fontSize: '11px' }} title={d.error}>
                                    Failed: {d.error}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                                    Skipped (Unlinked)
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      padding: '14px',
                      backgroundColor: 'var(--status-absent-bg)',
                      border: '1px solid var(--status-absent-border)',
                      borderRadius: '6px',
                      color: 'var(--status-absent)',
                      fontSize: '12px',
                    }}
                  >
                    <strong>Dispatch Error:</strong> {bulkNotifyResults.error}
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
