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
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Daily Attendance Register — Real Supabase Database Connection
 */
export default function AttendancePage() {
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

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch available batches
  const fetchBatches = async () => {
    if (!isSupabaseConfigured || !supabase) return;

    try {
      const { data, error: err } = await supabase
        .from('batches')
        .select('id, name, code, timing, classroom')
        .eq('is_active', true)
        .order('name');

      if (err) throw err;

      setBatches(data || []);
      if (data && data.length > 0 && !selectedBatchId) {
        setSelectedBatchId(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching batches for attendance:', err);
      setError(err.message || 'Failed to load batches.');
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  // 2. Fetch students in the selected batch and existing attendance for the date
  const fetchBatchAttendance = async () => {
    if (!selectedBatchId || !isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch students in this batch
      const { data: studentsData, error: studentsErr } = await supabase
        .from('students')
        .select('id, admission_no, full_name, roll_no, status')
        .eq('batch_id', selectedBatchId)
        .eq('status', 'active')
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
      setError(err.message || 'Failed to load roll call data.');
    } finally {
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

        <div className="page-actions">
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
        <div style={{ width: '200px' }}>
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

        <div style={{ flex: 1, minWidth: '280px' }}>
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
                        <strong style={{ color: 'var(--navy-950)' }}>{student.full_name}</strong>
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
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {record?.remarks || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
