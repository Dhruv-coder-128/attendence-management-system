import React from 'react';
import {
  Printer,
  X,
  GraduationCap,
  Award,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { useAcademySettings } from '../../lib/academySettings';

/**
 * Printable Academic Report Card Modal
 * Formatted with print-friendly layout and native window.print() support
 */
export default function ReportCardModal({
  isOpen,
  onClose,
  student,
  exam,
  marksRecord,
  attendanceRate = null,
}) {
  if (!isOpen || !student) return null;

  const branding = useAcademySettings();

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const totalMarks = Number(exam?.total_marks) || 100;
  const passingMarks = Number(exam?.passing_marks) || 35;
  const marksObtained = marksRecord?.is_absent ? null : marksRecord?.marks_obtained;
  const isAbsent = Boolean(marksRecord?.is_absent);
  const percentage = marksObtained !== null && marksObtained !== undefined
    ? Math.round((Number(marksObtained) / totalMarks) * 100 * 10) / 10
    : null;

  const isPassed = !isAbsent && marksObtained !== null && Number(marksObtained) >= passingMarks;
  const grade = isAbsent
    ? 'AB'
    : percentage !== null
    ? percentage >= 90
      ? 'A+'
      : percentage >= 80
      ? 'A'
      : percentage >= 70
      ? 'B'
      : percentage >= 60
      ? 'C'
      : percentage >= 40
      ? 'D'
      : 'F'
    : '—';

  return (
    <>
      {/* Print Specific CSS styles injected for perfect paper output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-report-card, #printable-report-card * {
            visibility: visible !important;
          }
          #printable-report-card {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #printable-report-card img {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            max-height: 52px !important;
            display: inline-block !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>


      {/* Modal Backdrop */}
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px',
        }}
        onClick={onClose}
      >
        {/* Modal Window */}
        <div
          className="modal-content"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            width: '100%',
            maxWidth: '680px',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Actions Bar (Hidden on print) */}
          <div
            className="no-print"
            style={{
              padding: '12px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--navy-900)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy-950)' }}>
                Printable Academic Report Card
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="primary" size="sm" icon={Printer} onClick={handlePrint}>
                Print / Save PDF
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-outline"
                style={{ padding: '6px', border: 'none', background: 'transparent' }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Report Card Area */}
          <div
            id="printable-report-card"
            style={{
              padding: '24px 32px',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            {/* 1. Official Academy Header */}
            <div
              style={{
                textAlign: 'center',
                paddingBottom: '16px',
                borderBottom: '2px solid var(--navy-900)',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  color: 'var(--navy-900)',
                  marginBottom: '4px',
                }}
              >
                {branding.logo_url ? (
                  <img
                    src={branding.logo_url}
                    alt="Logo"
                    style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <GraduationCap size={28} />
                )}
                <span
                  style={{
                    fontSize: '20px',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}
                >
                  {branding.academy_name}
                </span>
              </div>

              <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                {branding.branch_name} &bull; {branding.address}
              </div>

              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Phone: {branding.phone} &bull; Email: {branding.email}
              </div>

              {branding.tagline && (
                <div style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', marginTop: '2px' }}>
                  {branding.tagline}
                </div>
              )}

              <div
                style={{
                  display: 'inline-block',
                  marginTop: '8px',
                  padding: '3px 14px',
                  backgroundColor: 'var(--navy-950)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  borderRadius: '20px',
                  textTransform: 'uppercase',
                }}
              >
                Official Student Progress Report Card
              </div>
            </div>

            {/* 2. Student & Cohort Metadata Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                padding: '14px 16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '20px',
              }}
            >
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                  Student Full Name
                </span>
                <strong style={{ fontSize: '14px', color: 'var(--navy-950)' }}>{student.full_name}</strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                  Admission ID / Roll No
                </span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>
                  {student.admission_no} {student.roll_no ? `• Roll: ${student.roll_no}` : ''}
                </strong>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                  Course &amp; Cohort Batch
                </span>
                <span>
                  {student.courses?.name || exam?.courses?.name || 'Academic Course'} (
                  {student.batches?.name || exam?.batches?.name || 'General Batch'})
                </span>
              </div>

              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '10px', textTransform: 'uppercase' }}>
                  Academic Term &amp; Year
                </span>
                <span>{exam?.academic_year || 'AY 2026-27'} &bull; Term 1</span>
              </div>
            </div>

            {/* 3. Examination Details */}
            <div style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  marginBottom: '8px',
                }}
              >
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  {exam?.name || 'Academic Examination'}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  Exam Date: {exam?.exam_date || todayStr} &bull; Type: {exam?.exam_type || 'Unit Test'}
                </div>
              </div>

              {/* Scorecard Table */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  border: '1px solid #cbd5e1',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject / Component</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Max Marks</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Pass Marks</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Marks Scored</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Percentage</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Grade</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                      {exam?.subject || 'General Assessment'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {totalMarks}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {passingMarks}
                    </td>
                    <td
                      style={{
                        padding: '10px',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '13px',
                        fontFamily: 'var(--font-mono)',
                        color: isAbsent ? '#dc2626' : isPassed ? '#15803d' : '#dc2626',
                      }}
                    >
                      {isAbsent ? 'ABSENT' : marksObtained !== null ? marksObtained : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                      {percentage !== null ? `${percentage}%` : '—'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', fontWeight: 700 }}>
                      {grade}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: isAbsent
                            ? '#fee2e2'
                            : isPassed
                            ? '#dcfce7'
                            : '#fee2e2',
                          color: isAbsent
                            ? '#991b1b'
                            : isPassed
                            ? '#166534'
                            : '#991b1b',
                        }}
                      >
                        {isAbsent ? 'ABSENT' : isPassed ? 'PASSED' : 'FAILED'}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 4. Overall Assessment & Attendance Context */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                padding: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '12px',
                marginBottom: '20px',
              }}
            >
              <div style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                  Aggregate Score
                </span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)', marginTop: '2px' }}>
                  {marksObtained !== null ? `${marksObtained} / ${totalMarks}` : 'N/A'}
                </div>
              </div>

              <div style={{ textAlign: 'center', borderRight: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                  Overall Percentage &amp; Grade
                </span>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)', marginTop: '2px' }}>
                  {percentage !== null ? `${percentage}% (${grade})` : '—'}
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>
                  Classroom Attendance
                </span>
                <div
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: attendanceRate !== null && attendanceRate < 75 ? '#dc2626' : '#15803d',
                    marginTop: '2px',
                  }}
                >
                  {attendanceRate !== null ? `${attendanceRate}%` : 'Recorded'}
                </div>
              </div>
            </div>

            {/* 5. Teacher Remarks */}
            {marksRecord?.remarks && (
              <div
                style={{
                  fontSize: '11px',
                  padding: '8px 12px',
                  backgroundColor: '#f8fafc',
                  borderLeft: '3px solid var(--navy-900)',
                  marginBottom: '24px',
                }}
              >
                <strong>Faculty Remarks:</strong> {marksRecord.remarks}
              </div>
            )}

            {/* 6. Signatures & Academy Validation Stamp */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                marginTop: '36px',
                paddingTop: '24px',
                borderTop: '1px dashed #cbd5e1',
                fontSize: '11px',
              }}
            >
              <div style={{ textAlign: 'center', minWidth: '160px' }}>
                <div style={{ height: '36px' }}></div>
                <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: 600 }}>
                  Subject Faculty Signature
                </div>
              </div>

              <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '10px' }}>
                Generated: {todayStr}
                <br />
                SMS — Student Management System &bull; Verified Copy
              </div>

              <div style={{ textAlign: 'center', minWidth: '160px' }}>
                <div style={{ height: '36px' }}></div>
                <div style={{ borderTop: '1px solid #0f172a', paddingTop: '4px', fontWeight: 600 }}>
                  Director / Principal Signature
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
