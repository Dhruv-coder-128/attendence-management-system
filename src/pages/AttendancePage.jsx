import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  CheckSquare,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Input from '../components/common/Input';
import Select from '../components/common/Select';

/**
 * Interactive Live Attendance Register
 * Allows roll call marking (Present / Absent / Late / Excused) with live metric updates
 */
export default function AttendancePage({
  batches,
  attendanceList,
  onUpdateStatus,
  onMarkAllPresent,
  onSendAlerts,
}) {
  const [selectedDate, setSelectedDate] = useState('2026-10-09');
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.id || 'batch-jee-12a');
  const [alertSuccessToast, setAlertSuccessToast] = useState('');

  // Filter attendance records by chosen batch
  const currentBatchRecords = useMemo(() => {
    return attendanceList.filter((item) => item.batchId === selectedBatchId);
  }, [attendanceList, selectedBatchId]);

  const activeBatch = batches.find((b) => b.id === selectedBatchId) || batches[0];

  // Calculate live counters for the selected batch
  const presentCount = currentBatchRecords.filter((r) => r.status === 'Present').length;
  const absentCount = currentBatchRecords.filter((r) => r.status === 'Absent').length;
  const lateCount = currentBatchRecords.filter((r) => r.status === 'Late').length;
  const excusedCount = currentBatchRecords.filter((r) => r.status === 'Excused').length;
  const totalCount = currentBatchRecords.length;
  const attendanceRate = totalCount > 0 ? Math.round(((presentCount + lateCount) / totalCount) * 100) : 0;

  const handleAlertDispatch = () => {
    if (absentCount === 0) {
      setAlertSuccessToast('All students present! No absentee alerts needed.');
    } else {
      setAlertSuccessToast(`Telegram & SMS alert queue triggered for ${absentCount} absentee guardians.`);
      if (onSendAlerts) onSendAlerts(selectedBatchId);
    }
    setTimeout(() => setAlertSuccessToast(''), 4500);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily Attendance Register</h1>
          <p className="page-description">
            Live Roll Call Verification &bull; Real-time Discrepancy Reconciliation
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={CheckSquare}
            onClick={() => onMarkAllPresent && onMarkAllPresent(selectedBatchId)}
          >
            Mark All Present
          </Button>

          <Button
            variant="gold"
            size="sm"
            icon={Send}
            onClick={handleAlertDispatch}
          >
            Send Telegram Alerts
          </Button>
        </div>
      </div>

      {/* Confirmation Toast */}
      {alertSuccessToast && (
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
          <span>{alertSuccessToast}</span>
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
            Academic Batch
          </label>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="form-select"
          >
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name} ({b.timing})
              </option>
            ))}
          </select>
        </div>

        <div
          style={{
            padding: '8px 14px',
            backgroundColor: 'var(--bg-subtle)',
            borderRadius: '4px',
            border: '1px solid var(--border-subtle)',
            fontSize: '12px',
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Hall Location: </span>
          <strong>{activeBatch?.classroom}</strong>
        </div>
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
            Batch Roll
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
            Late Arrival
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

      {/* Interactive Roll Call Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Admission No</th>
                <th>Student Name</th>
                <th>Current Status</th>
                <th style={{ textAlign: 'center' }}>Mark Attendance Status</th>
                <th>Check-in Time</th>
                <th>Remarks / Notes</th>
              </tr>
            </thead>
            <tbody>
              {currentBatchRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>
                    No roll call entries found for this batch on {selectedDate}.
                  </td>
                </tr>
              ) : (
                currentBatchRecords.map((record, index) => (
                  <tr key={record.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{index + 1}</td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
                        {record.admissionNo}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: 'var(--navy-950)' }}>{record.studentName}</strong>
                    </td>
                    <td>
                      <Badge status={record.status} />
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {/* Interactive 4-Way Quick Selector Buttons */}
                      <div
                        style={{
                          display: 'inline-flex',
                          borderRadius: '4px',
                          border: '1px solid var(--border-subtle)',
                          overflow: 'hidden',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdateStatus && onUpdateStatus(record.id, 'Present')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor:
                              record.status === 'Present' ? 'var(--status-present)' : 'transparent',
                            color: record.status === 'Present' ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          Present
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus && onUpdateStatus(record.id, 'Absent')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderLeft: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            backgroundColor:
                              record.status === 'Absent' ? 'var(--status-absent)' : 'transparent',
                            color: record.status === 'Absent' ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          Absent
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus && onUpdateStatus(record.id, 'Late')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderLeft: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            backgroundColor:
                              record.status === 'Late' ? 'var(--status-late)' : 'transparent',
                            color: record.status === 'Late' ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          Late
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus && onUpdateStatus(record.id, 'Excused')}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: 'none',
                            borderLeft: '1px solid var(--border-subtle)',
                            cursor: 'pointer',
                            backgroundColor:
                              record.status === 'Excused' ? 'var(--status-excused)' : 'transparent',
                            color: record.status === 'Excused' ? '#ffffff' : 'var(--text-secondary)',
                          }}
                        >
                          Excused
                        </button>
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {record.timeIn || '—'}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {record.remarks || 'Standard roll call check'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
