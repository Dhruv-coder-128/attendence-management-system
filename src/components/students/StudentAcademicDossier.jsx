import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User,
  Phone,
  CreditCard,
  DollarSign,
  Send,
  Plus,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Award,
  Printer,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  FileText,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import ReportCardModal from '../exams/ReportCardModal';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { useAcademySettings } from '../../lib/academySettings';
import {
  getStudentFeeRecord,
  recordFeePayment,
  computeFeeStatus,
  getStandardCoursePolicy,
} from '../../lib/feeService';
import { sendVerifiedFeeReminder } from '../../lib/telegramClient';
import { fetchStudentExamResults } from '../../lib/examService';

/**
 * Simplified, Clean Student Academic Dossier (Phase 4 + Phase 5 + UI Simplification)
 * Features a compact vertical section navigation on desktop and clean segmented control on mobile.
 */
export default function StudentAcademicDossier({
  student,
  isOpen,
  onClose,
  onUpdateStudent,
}) {
  // Navigation sections: 'overview' | 'attendance' | 'fees' | 'guardians' | 'results'
  const [activeSection, setActiveSection] = useState('overview');

  // Fee state
  const [feeRecord, setFeeRecord] = useState(null);
  const [feeLoading, setFeeLoading] = useState(true);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    paymentMethod: 'UPI',
    referenceNo: '',
    notes: '',
    installmentNo: null,
  });

  // Telegram Fee Reminder State
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  // Attendance state
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);

  // Guardians state
  const [guardians, setGuardians] = useState([]);
  const [guardiansLoading, setGuardiansLoading] = useState(true);
  const [isLinkGuardianModalOpen, setIsLinkGuardianModalOpen] = useState(false);
  const [newGuardianForm, setNewGuardianForm] = useState({
    fullName: '',
    phone: '',
    relationship: 'Mother',
    contactPriority: 'secondary',
    alertPreference: 'all',
  });
  const [isSavingGuardian, setIsSavingGuardian] = useState(false);

  // Exam Results state (Phase 5)
  const [examResults, setExamResults] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [selectedReportExam, setSelectedReportExam] = useState(null);

  const [toastMessage, setToastMessage] = useState('');
  const branding = useAcademySettings();

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch Fee Record
  const fetchFeeData = useCallback(async () => {
    if (!student) return;
    setFeeLoading(true);
    try {
      const rec = await getStudentFeeRecord(student, student.courses);
      setFeeRecord(rec);
    } catch (err) {
      console.warn('Error loading fee record:', err);
    } finally {
      setFeeLoading(false);
    }
  }, [student]);

  // 2. Fetch Attendance Records
  const fetchAttendanceData = useCallback(async () => {
    if (!student || !supabase || !isSupabaseConfigured) {
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, date, status, time_in, remarks, session_name, created_at, updated_at')
        .eq('student_id', student.id)
        .order('date', { ascending: false });

      if (error) throw error;

      // Deduplicate by date: keep the record with the most recent updated_at / created_at
      const raw = data || [];
      const dedupedMap = new Map();
      raw.forEach((r) => {
        const existing = dedupedMap.get(r.date);
        if (!existing) {
          dedupedMap.set(r.date, r);
        } else {
          const t1 = new Date(existing.updated_at || existing.created_at || 0).getTime();
          const t2 = new Date(r.updated_at || r.created_at || 0).getTime();
          if (t2 >= t1) {
            dedupedMap.set(r.date, r);
          }
        }
      });

      const sortedRecords = Array.from(dedupedMap.values()).sort((a, b) => b.date.localeCompare(a.date));
      setAttendanceRecords(sortedRecords);
    } catch (err) {
      console.warn('Error loading attendance for dossier:', err);
    } finally {
      setAttendanceLoading(false);
    }
  }, [student]);

  // 3. Fetch Guardians Data
  const fetchGuardiansData = useCallback(async () => {
    if (!student || !supabase || !isSupabaseConfigured) {
      setGuardiansLoading(false);
      return;
    }
    setGuardiansLoading(true);
    try {
      const { data, error } = await supabase
        .from('parent_students')
        .select(`
          id,
          relationship,
          is_primary_contact,
          can_receive_alerts,
          alert_preference,
          contact_priority,
          parents:parent_id (
            id,
            full_name,
            phone,
            email,
            telegram_chat_id,
            is_verified,
            preferred_notification_channel
          )
        `)
        .eq('student_id', student.id);

      let loaded = (!error && data) ? data : [];
      if (loaded.length > 0) {
        // Enforce parent object presence
        const resolved = await Promise.all(
          loaded.map(async (g) => {
            if (g.parents && g.parents.full_name) return g;
            if (g.parent_id) {
              const { data: pData } = await supabase
                .from('parents')
                .select('*')
                .eq('id', g.parent_id)
                .maybeSingle();
              if (pData) return { ...g, parents: pData };
            }
            if (student.parents) return { ...g, parents: student.parents };
            return g;
          })
        );
        setGuardians(resolved);
      } else if (student.parents || student.guardian_name || student.guardian_phone) {
        setGuardians([
          {
            id: 'syn_' + student.id,
            relationship: student.guardian_relationship || student.parents?.relationship || 'Guardian',
            is_primary_contact: true,
            contact_priority: 'primary',
            can_receive_alerts: true,
            alert_preference: 'all',
            parents: student.parents || {
              id: 'p_' + student.id,
              full_name: student.guardian_name || 'Guardian',
              phone: student.guardian_phone || student.phone || '',
              relationship: student.guardian_relationship || 'Guardian',
              is_verified: false,
              preferred_notification_channel: 'telegram',
            },
          },
        ]);
      } else {
        setGuardians(student.parent_students || []);
      }
    } catch (err) {
      console.warn('Error fetching guardians:', err);
      setGuardians(student.parent_students || []);
    } finally {
      setGuardiansLoading(false);
    }
  }, [student]);

  // 4. Fetch Exam Results (Phase 5)
  const fetchExamsData = useCallback(async () => {
    if (!student) return;
    setExamsLoading(true);
    try {
      const results = await fetchStudentExamResults(student.id);
      setExamResults(results);
    } catch (err) {
      console.warn('Error fetching exam results:', err);
    } finally {
      setExamsLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (student && isOpen) {
      fetchFeeData();
      fetchAttendanceData();
      fetchGuardiansData();
      fetchExamsData();
    }
  }, [student, isOpen, fetchFeeData, fetchAttendanceData, fetchGuardiansData, fetchExamsData]);

  // Attendance Metrics Computation
  const attendanceMetrics = useMemo(() => {
    const total = attendanceRecords.length;
    const present = attendanceRecords.filter((r) => r.status === 'Present').length;
    const late = attendanceRecords.filter((r) => r.status === 'Late').length;
    const absent = attendanceRecords.filter((r) => r.status === 'Absent').length;
    const attended = present + late;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 100;

    // Monthly breakdown
    const monthlyMap = {};
    attendanceRecords.forEach((r) => {
      const monthKey = r.date.substring(0, 7);
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { total: 0, present: 0, absent: 0, late: 0 };
      }
      monthlyMap[monthKey].total++;
      if (r.status === 'Present') monthlyMap[monthKey].present++;
      else if (r.status === 'Late') monthlyMap[monthKey].late++;
      else if (r.status === 'Absent') monthlyMap[monthKey].absent++;
    });

    const monthlyTrends = Object.keys(monthlyMap)
      .sort()
      .reverse()
      .slice(0, 6)
      .map((key) => {
        const item = monthlyMap[key];
        const monthRate = item.total > 0 ? Math.round(((item.present + item.late) / item.total) * 100) : 100;
        return {
          month: key,
          rate: monthRate,
          total: item.total,
          present: item.present,
          absent: item.absent,
          late: item.late,
        };
      });

    return {
      total,
      present,
      late,
      absent,
      rate,
      isDefaulter: total >= 5 && rate < 75,
      monthlyTrends,
    };
  }, [attendanceRecords]);

  // Fee computation - 100% synchronized with student record & feesPage
  const computedFee = useMemo(() => {
    const policy = getStandardCoursePolicy(student?.courses);
    const total = Number(student?.tuition_fee) || Number(feeRecord?.total_amount) || policy.total;
    const paid = (student?.fee_paid !== undefined && student?.fee_paid !== null)
      ? Number(student.fee_paid)
      : (feeRecord?.paid_amount !== undefined && feeRecord?.paid_amount !== null)
        ? Number(feeRecord.paid_amount)
        : 0;
    const schedule = feeRecord?.installment_schedule || [];
    const dueDate = feeRecord?.next_due_date || student?.fee_due_date || null;
    return {
      total,
      paid,
      pending: Math.max(0, total - paid),
      dueDate,
      ...computeFeeStatus(total, paid, schedule, dueDate),
    };
  }, [feeRecord, student]);

  // Exam Statistics
  const examStats = useMemo(() => {
    const total = examResults.length;
    if (total === 0) return { total: 0, passed: 0, failed: 0, absent: 0, avgPct: 0 };
    let passed = 0;
    let failed = 0;
    let absent = 0;
    let totalScore = 0;
    let totalMax = 0;

    examResults.forEach((r) => {
      if (r.is_absent) absent++;
      else if (r.isPass) passed++;
      else failed++;

      if (!r.is_absent && r.marks_obtained !== null) {
        totalScore += Number(r.marks_obtained);
        totalMax += Number(r.total_marks || 100);
      }
    });

    const avgPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;
    return { total, passed, failed, absent, avgPct };
  }, [examResults]);

  // Handle Record Payment
  const handleRecordPaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    setIsRecordingPayment(true);
    try {
      const updated = await recordFeePayment(
        student.id,
        amount,
        paymentForm.paymentMethod,
        paymentForm.referenceNo,
        paymentForm.notes,
        paymentForm.installmentNo
      );
      setFeeRecord(updated);
      showToast(`Recorded payment of ₹${amount.toLocaleString('en-IN')} successfully!`);
      setIsPaymentModalOpen(false);
      setPaymentForm({ amount: '', paymentMethod: 'UPI', referenceNo: '', notes: '', installmentNo: null });
      if (onUpdateStudent) onUpdateStudent();
    } catch (err) {
      alert('Payment processing failed: ' + err.message);
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Dispatch Fee Reminder via Telegram
  const handleSendFeeReminder = async (targetParentId = null) => {
    setIsSendingReminder(true);
    try {
      const res = await sendVerifiedFeeReminder({
        student,
        feeRecord: computedFee,
        targetParentId,
      });

      if (res.success) {
        showToast(res.message);
      } else {
        alert('Notice: ' + res.error);
      }
    } catch (err) {
      alert('Failed to dispatch reminder: ' + err.message);
    } finally {
      setIsSendingReminder(false);
    }
  };

  // Update Guardian Alert Preference
  const handleUpdateGuardianPref = async (parentStudentId, newPref) => {
    try {
      await supabase
        .from('parent_students')
        .update({ alert_preference: newPref })
        .eq('id', parentStudentId);

      showToast(`Guardian alert preference updated to: ${newPref === 'all' ? 'All Alerts' : 'Emergency Only'}`);
      setGuardians((prev) =>
        prev.map((g) => (g.id === parentStudentId ? { ...g, alert_preference: newPref } : g))
      );
    } catch (err) {
      alert('Failed to update preference: ' + err.message);
    }
  };

  // Set Guardian as Primary Contact
  const handleSetPrimaryGuardian = async (parentStudentId) => {
    try {
      await supabase
        .from('parent_students')
        .update({ is_primary_contact: false, contact_priority: 'secondary' })
        .eq('student_id', student.id);

      const { error } = await supabase
        .from('parent_students')
        .update({ is_primary_contact: true, contact_priority: 'primary' })
        .eq('id', parentStudentId);

      if (error) throw error;
      showToast('Primary guardian updated successfully!');
      fetchGuardiansData();
    } catch (err) {
      alert('Failed to update primary contact: ' + err.message);
    }
  };

  // Add New Guardian Handler
  const handleSaveNewGuardian = async (e) => {
    e.preventDefault();
    setIsSavingGuardian(true);
    try {
      const { data: parentData, error: pErr } = await supabase
        .from('parents')
        .insert([
          {
            full_name: newGuardianForm.fullName,
            phone: newGuardianForm.phone,
            relationship: newGuardianForm.relationship,
            preferred_notification_channel: 'telegram',
          },
        ])
        .select()
        .single();

      if (pErr) throw pErr;

      await supabase.from('parent_students').insert([
        {
          parent_id: parentData.id,
          student_id: student.id,
          relationship: newGuardianForm.relationship,
          is_primary_contact: newGuardianForm.contactPriority === 'primary',
          contact_priority: newGuardianForm.contactPriority,
          can_receive_alerts: true,
          alert_preference: newGuardianForm.alertPreference,
        },
      ]);

      showToast(`Added ${newGuardianForm.relationship} (${newGuardianForm.fullName})!`);
      setIsLinkGuardianModalOpen(false);
      fetchGuardiansData();
      if (onUpdateStudent) onUpdateStudent();
    } catch (err) {
      alert('Failed to add guardian: ' + err.message);
    } finally {
      setIsSavingGuardian(false);
    }
  };

  if (!isOpen || !student) return null;

  const sections = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'attendance', label: `Attendance (${attendanceMetrics.rate}%)`, icon: TrendingUp },
    { id: 'fees', label: 'Fees & Dues', icon: CreditCard },
    { id: 'guardians', label: `Guardians (${guardians.length})`, icon: ShieldCheck },
    { id: 'results', label: `Results (${examResults.length})`, icon: Award },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={student.full_name}
      subtitle={`Admission No: ${student.admission_no} • ${student.batches?.name || 'Cohort'} • ${student.courses?.name || 'Course'}`}
      size="dossier"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Dossier
          </Button>
        </div>
      }
    >
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-student-dossier, #printable-student-dossier * {
            visibility: visible !important;
          }
          #printable-student-dossier {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 16px !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .dossier-print-header {
            display: flex !important;
            align-items: center;
            justifyContent: space-between;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 16px;
          }
          .dossier-no-print {
            display: none !important;
          }
        }
      `}</style>

      <div id="printable-student-dossier" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Printable Official Institutional Header (Visible during Print) */}
        <div
          className="dossier-print-header"
          style={{ display: 'none', alignItems: 'center', gap: '16px' }}
        >
          {branding.logo_url && (
            <img
              src={branding.logo_url}
              alt="Logo"
              style={{ maxHeight: '48px', maxWidth: '100px', objectFit: 'contain' }}
            />
          )}
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
              {branding.academy_name}
            </h2>
            <div style={{ fontSize: '11px', color: '#475569' }}>
              {branding.branch_name} &bull; {branding.address}
            </div>
          </div>
        </div>

        {/* Toast Feedback */}
        {toastMessage && (
          <div
            className="dossier-no-print"
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--status-present-bg)',
              border: '1px solid var(--status-present-border)',
              borderRadius: '6px',
              color: 'var(--status-present)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Sparkles size={16} />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. Clean, Uncluttered Student Header */}
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--navy-900)',
            borderRadius: '8px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--navy-800)',
                color: 'var(--gold-light)',
                border: '2px solid var(--gold-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {student.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase()}
            </div>

            <div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                {student.full_name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gold-light)' }}>
                {student.courses?.name || 'Academic Stream'} &bull; {student.batches?.name || 'Cohort'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                Adm No: {student.admission_no} {student.roll_no ? `• Roll: ${student.roll_no}` : ''}
              </div>
            </div>
          </div>

          {/* Key Indicators */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {branding.logo_url && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
                title={branding.academy_name}
              >
                <img
                  src={branding.logo_url}
                  alt={branding.academy_name}
                  style={{ maxHeight: '18px', maxWidth: '36px', objectFit: 'contain' }}
                />
                <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                  {branding.academy_name}
                </span>
              </div>
            )}
            <Badge status={student.status === 'active' ? 'Present' : 'Pending'}>
              {student.status.toUpperCase()}
            </Badge>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: attendanceMetrics.isDefaulter ? '#fee2e2' : '#dcfce7',
                color: attendanceMetrics.isDefaulter ? '#991b1b' : '#166534',
              }}
            >
              ATTENDANCE: {attendanceMetrics.rate}%
            </span>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor:
                  computedFee.status === 'paid'
                    ? '#dcfce7'
                    : computedFee.status === 'overdue'
                    ? '#fee2e2'
                    : '#fef3c7',
                color:
                  computedFee.status === 'paid'
                    ? '#166534'
                    : computedFee.status === 'overdue'
                    ? '#991b1b'
                    : '#92400e',
              }}
            >
              FEE: {computedFee.label.toUpperCase()}
            </span>

            <Button
              variant="outline"
              size="sm"
              icon={Printer}
              onClick={() => window.print()}
              className="dossier-no-print"
              style={{
                color: '#ffffff',
                borderColor: 'rgba(255, 255, 255, 0.3)',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                padding: '3px 9px',
                fontSize: '11px',
              }}
              title="Print Official Dossier"
            >
              Print
            </Button>
          </div>
        </div>

        {/* 2. Responsive Layout: Section Menu + Section Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '16px',
            minHeight: '420px',
            alignItems: 'stretch',
          }}
          className="dossier-container"
        >
          {/* Left Vertical Section Menu (Clean, no clipped labels) */}
          <div
            style={{
              width: '180px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              borderRight: '1px solid var(--border-subtle)',
              paddingRight: '12px',
            }}
            className="dossier-menu"
          >
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => setActiveSection(sec.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 12px',
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: '6px',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    backgroundColor: isActive ? 'var(--navy-900)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--navy-950)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Icon size={15} color={isActive ? 'var(--gold-light)' : 'var(--navy-700)'} />
                  <span>{sec.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Section Content */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {/* SECTION 1: OVERVIEW */}
            {activeSection === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '14px',
                    padding: '16px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Admission Number / Student ID
                    </span>
                    <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                      {student.admission_no}
                    </strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Roll Number
                    </span>
                    <span>{student.roll_no || 'Not assigned'}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Course Stream
                    </span>
                    <strong>{student.courses?.name || '—'}</strong>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Cohort Batch &amp; Timings
                    </span>
                    <span>
                      {student.batches?.name || '—'} ({student.batches?.timing || 'Standard'})
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Student Phone
                    </span>
                    <span>{student.phone || '—'}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Student Email
                    </span>
                    <span>{student.email || '—'}</span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Gender &amp; Date of Birth
                    </span>
                    <span>
                      {student.gender || '—'} {student.dob ? `(${student.dob})` : ''}
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Admission Date &amp; Blood Group
                    </span>
                    <span>
                      {student.enrollment_date || '—'} &bull; {student.blood_group || 'O+'}
                    </span>
                  </div>

                  <div style={{ gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                      Residential Address
                    </span>
                    <span>{student.address || 'Not provided'}</span>
                  </div>
                </div>

                {/* Quick Academic Snapshot */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    fontSize: '12px',
                  }}
                >
                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Classroom Attendance</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '4px' }}>
                      {attendanceMetrics.rate}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {attendanceMetrics.present} Present / {attendanceMetrics.total} Sessions
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Tuition Balance</span>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: computedFee.pending > 0 ? '#92400e' : '#15803d',
                        marginTop: '4px',
                      }}
                    >
                      ₹{computedFee.pending.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      ₹{computedFee.paid.toLocaleString('en-IN')} of ₹{computedFee.total.toLocaleString('en-IN')} Paid
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '12px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Exam Evaluations</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '4px' }}>
                      {examStats.avgPct}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {examStats.passed} Passed / {examStats.total} Exams Taken
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: ATTENDANCE */}
            {activeSection === 'attendance' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Defaulter Warning Banner */}
                {attendanceMetrics.isDefaulter && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--status-absent-bg)',
                      border: '1px solid var(--status-absent-border)',
                      borderRadius: '6px',
                      color: 'var(--status-absent)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Regulatory Warning:</strong> Student attendance ({attendanceMetrics.rate}%) is below the
                      mandated 75% threshold.
                    </span>
                  </div>
                )}

                {/* Metrics row */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Total Held</div>
                    <div style={{ fontSize: '16px', fontWeight: 700 }}>{attendanceMetrics.total}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--status-present)', fontSize: '10px' }}>Present</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-present)' }}>
                      {attendanceMetrics.present}
                    </div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--status-absent)', fontSize: '10px' }}>Absent</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-absent)' }}>
                      {attendanceMetrics.absent}
                    </div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#f8fafc', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ color: 'var(--status-late)', fontSize: '10px' }}>Late</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-late)' }}>
                      {attendanceMetrics.late}
                    </div>
                  </div>
                </div>

                {/* Monthly breakdown */}
                {attendanceMetrics.monthlyTrends.length > 0 && (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '8px' }}>
                      Monthly Attendance Progression
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {attendanceMetrics.monthlyTrends.map((m) => (
                        <div key={m.month} style={{ fontSize: '11px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span><strong>{m.month}</strong> ({m.present}P / {m.absent}A / {m.total} total)</span>
                            <span style={{ fontWeight: 700, color: m.rate < 75 ? '#dc2626' : '#15803d' }}>
                              {m.rate}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                            <div
                              style={{
                                width: `${m.rate}%`,
                                height: '100%',
                                backgroundColor: m.rate < 75 ? 'var(--status-absent)' : 'var(--status-present)',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: FEES */}
            {activeSection === 'fees' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Fee Summary Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    padding: '16px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Total Tuition</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '4px' }}>
                      ₹{computedFee.total.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--status-present)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Total Paid</span>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-present)', marginTop: '4px' }}>
                      ₹{computedFee.paid.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: computedFee.pending > 0 ? '#b45309' : 'var(--status-present)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                      Outstanding Due
                    </span>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: computedFee.pending > 0 ? '#b45309' : 'var(--status-present)',
                        marginTop: '4px',
                      }}
                    >
                      ₹{computedFee.pending.toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>Account Status</span>
                    <div style={{ marginTop: '5px' }}>
                      <Badge
                        variant={
                          computedFee.status === 'paid'
                            ? 'present'
                            : computedFee.status === 'overdue'
                            ? 'absent'
                            : computedFee.status === 'partial'
                            ? 'late'
                            : 'gold'
                        }
                      >
                        {(computedFee.label || computedFee.status || 'Pending').toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Send}
                    onClick={() => handleSendFeeReminder()}
                    disabled={isSendingReminder || computedFee.pending === 0}
                  >
                    {isSendingReminder ? 'Sending...' : 'Send Telegram Fee Reminder'}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={DollarSign}
                    onClick={() => setIsPaymentModalOpen(true)}
                    disabled={computedFee.pending === 0}
                  >
                    Record Payment
                  </Button>
                </div>

                {/* Milestone Installment Schedule (Roadmap) */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} color="var(--navy-800)" />
                      Milestone Installment Schedule &amp; Roadmap
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {(feeRecord?.installment_schedule || []).length} Scheduled Installments
                    </span>
                  </div>

                  <table className="erp-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>Milestone #</th>
                        <th>Milestone Description</th>
                        <th>Due Date</th>
                        <th style={{ textAlign: 'right' }}>Total Fee</th>
                        <th style={{ textAlign: 'right' }}>Paid Amount</th>
                        <th style={{ textAlign: 'right' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(feeRecord?.installment_schedule || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                            No installment schedule generated yet.
                          </td>
                        </tr>
                      ) : (
                        (feeRecord?.installment_schedule || []).map((inst, idx) => {
                          const instAmount = Number(inst.amount || 0);
                          const instPaid = Number(inst.paid_amount || 0);
                          const pct = instAmount > 0 ? Math.min(100, Math.round((instPaid / instAmount) * 100)) : 0;
                          const isPaid = inst.status === 'paid' || instPaid >= instAmount;
                          const isPartial = inst.status === 'partial' || (instPaid > 0 && instPaid < instAmount);
                          const isOverdue = inst.status === 'overdue';

                          return (
                            <tr key={idx}>
                              <td style={{ fontWeight: 700, color: 'var(--navy-950)' }}>
                                #{inst.installment_no || idx + 1}
                              </td>
                              <td>
                                <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{inst.label}</div>
                                <div style={{ width: '120px', height: '4px', backgroundColor: '#e2e8f0', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      width: `${pct}%`,
                                      height: '100%',
                                      backgroundColor: isPaid ? 'var(--status-present)' : isPartial ? '#d97706' : '#94a3b8',
                                    }}
                                  />
                                </div>
                              </td>
                              <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                                {inst.due_date || '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                ₹{instAmount.toLocaleString('en-IN')}
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: instPaid > 0 ? 'var(--status-present)' : 'var(--text-muted)' }}>
                                ₹{instPaid.toLocaleString('en-IN')}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <Badge
                                  variant={
                                    isPaid
                                      ? 'present'
                                      : isOverdue
                                      ? 'absent'
                                      : isPartial
                                      ? 'late'
                                      : 'gold'
                                  }
                                >
                                  {isPaid ? 'PAID' : isPartial ? `PARTIAL (${pct}%)` : isOverdue ? 'OVERDUE' : 'PENDING'}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Payment Transaction Ledger */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', overflow: 'hidden', backgroundColor: '#ffffff' }}>
                  <div style={{ padding: '12px 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={15} color="var(--navy-800)" />
                      Payment Transaction &amp; Receipt Ledger
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Audit Log
                    </span>
                  </div>

                  {(() => {
                    // Extract payment notes lines or installments
                    const txList = [];
                    const notesStr = feeRecord?.notes || '';
                    if (notesStr) {
                      const lines = notesStr.split('\n');
                      lines.forEach((l, i) => {
                        if (l.trim()) {
                          txList.push({ id: `tx-note-${i}`, text: l.trim() });
                        }
                      });
                    }

                    if (txList.length === 0 && computedFee.paid > 0) {
                      txList.push({
                        id: 'tx-seed',
                        text: `[Academic Year 2026-27] Recorded Payment of ₹${computedFee.paid.toLocaleString('en-IN')} credited to student account.`,
                      });
                    }

                    if (txList.length === 0) {
                      return (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                          No payment receipts or transaction audit notes recorded for this student yet.
                        </div>
                      );
                    }

                    return (
                      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {txList.map((tx) => (
                          <div
                            key={tx.id}
                            style={{
                              padding: '10px 14px',
                              backgroundColor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '6px',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--navy-950)' }}>
                              <CheckCircle2 size={15} color="var(--status-present)" style={{ flexShrink: 0 }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{tx.text}</span>
                            </div>
                            <span
                              style={{
                                fontSize: '10.5px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: '#f0fdf4',
                                color: '#166534',
                                border: '1px solid #bbf7d0',
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              Verified
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* SECTION 4: GUARDIANS */}
            {activeSection === 'guardians' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                    Linked Parents &amp; Guardians
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Plus}
                    onClick={() => setIsLinkGuardianModalOpen(true)}
                  >
                    Add / Link Guardian
                  </Button>
                </div>

                {guardiansLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="animate-spin" />
                  </div>
                ) : guardians.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    No guardians linked to this student yet. Click "Add / Link Guardian" above.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {guardians.map((g) => {
                      const parent = g.parents || {};
                      const isLinked = parent.is_verified && parent.telegram_chat_id;
                      const isPrimary = g.is_primary_contact;

                      return (
                        <div
                          key={g.id}
                          style={{
                            padding: '16px 18px',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '12px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#ffffff',
                            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                            gap: '16px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: '240px' }}>
                            <div
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '12px',
                                backgroundColor: isPrimary ? 'var(--navy-900)' : 'var(--bg-subtle)',
                                color: isPrimary ? 'var(--gold-primary)' : 'var(--navy-800)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '15px',
                                border: '1px solid var(--border-subtle)',
                                flexShrink: 0,
                              }}
                            >
                              {(parent.full_name || 'G').slice(0, 2).toUpperCase()}
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: '14px', color: 'var(--navy-950)' }}>
                                  {parent.full_name || 'Guardian'}
                                </strong>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    backgroundColor: '#f1f5f9',
                                    color: 'var(--navy-900)',
                                    fontWeight: 600,
                                  }}
                                >
                                  {g.relationship || parent.relationship || 'Guardian'}
                                </span>
                                {isPrimary && (
                                  <span
                                    style={{
                                      fontSize: '10.5px',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      backgroundColor: 'var(--navy-900)',
                                      color: 'var(--gold-primary)',
                                      fontWeight: 700,
                                    }}
                                  >
                                    ★ Primary Contact
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Phone size={13} color="var(--navy-700)" />
                                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                    {parent.phone || student.guardian_phone || 'No phone'}
                                  </span>
                                </span>

                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Telegram:</span>
                                  {isLinked ? (
                                    <span style={{ color: '#15803d', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f0fdf4', padding: '1px 6px', borderRadius: '4px', border: '1px solid #bbf7d0' }}>
                                      ✓ Linked ({parent.telegram_chat_id})
                                    </span>
                                  ) : (
                                    <span style={{ color: '#b45309', fontWeight: 600, backgroundColor: '#fffbeb', padding: '1px 6px', borderRadius: '4px', border: '1px solid #fde68a' }}>
                                      Not Linked
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <select
                              value={g.alert_preference || 'all'}
                              onChange={(e) => handleUpdateGuardianPref(g.id, e.target.value)}
                              className="form-select"
                              style={{ padding: '6px 10px', fontSize: '12px', width: '145px', borderRadius: '6px' }}
                            >
                              <option value="all">All Alerts</option>
                              <option value="emergency_only">Emergency Only</option>
                              <option value="none">Muted</option>
                            </select>

                            {!isPrimary && (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryGuardian(g.id)}
                                className="btn btn-outline"
                                style={{ padding: '5px 10px', fontSize: '11px', borderRadius: '6px' }}
                              >
                                Make Primary
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 5: RESULTS (PHASE 5 INTEGRATION) */}
            {activeSection === 'results' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Summary Strip */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '10px',
                    padding: '12px',
                    backgroundColor: '#ffffff',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Exams Evaluated</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                      {examStats.total}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--status-present)', fontSize: '10px' }}>Passed</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-present)' }}>
                      {examStats.passed}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--status-absent)', fontSize: '10px' }}>Failed</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-absent)' }}>
                      {examStats.failed}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--navy-900)', fontSize: '10px' }}>Overall Average</span>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-900)' }}>
                      {examStats.avgPct}%
                    </div>
                  </div>
                </div>

                {/* Exam Records Table */}
                {examsLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="animate-spin" />
                  </div>
                ) : examResults.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <Award size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <div>No examination marks recorded for this student yet.</div>
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflow: 'hidden' }}>
                    <table className="erp-table" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          <th>Examination</th>
                          <th>Subject</th>
                          <th>Date</th>
                          <th>Marks Scored</th>
                          <th>%</th>
                          <th>Grade</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Report</th>
                        </tr>
                      </thead>
                      <tbody>
                        {examResults.map((ex) => (
                          <tr key={ex.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{ex.exam_name}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{ex.exam_type}</div>
                            </td>
                            <td style={{ fontSize: '12px' }}>{ex.subject}</td>
                            <td style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{ex.exam_date}</td>
                            <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                              {ex.is_absent ? 'ABSENT' : `${ex.marks_obtained} / ${ex.total_marks}`}
                            </td>
                            <td style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                              {ex.percentage !== null ? `${ex.percentage}%` : '—'}
                            </td>
                            <td style={{ fontWeight: 700 }}>{ex.grade}</td>
                            <td>
                              <Badge status={ex.badge}>{ex.status}</Badge>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Button
                                variant="outline"
                                size="sm"
                                icon={Printer}
                                onClick={() => setSelectedReportExam(ex)}
                                title="Print Report Card"
                              >
                                Print
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title="Record Tuition Fee Payment"
          subtitle={`Student: ${student.full_name} (${student.admission_no})`}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)} disabled={isRecordingPayment}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleRecordPaymentSubmit} disabled={isRecordingPayment}>
                {isRecordingPayment ? 'Recording...' : 'Confirm Receipt'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleRecordPaymentSubmit}>
            <Input
              label="Amount to Credit (₹)"
              type="number"
              min="1"
              max={computedFee.pending}
              value={paymentForm.amount}
              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              placeholder={`Max pending: ₹${computedFee.pending}`}
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <Select
                label="Payment Method"
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                options={['UPI', 'Cash', 'Cheque', 'Bank Transfer', 'Card']}
              />

              <Input
                label="Reference / Transaction ID"
                value={paymentForm.referenceNo}
                onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                placeholder="e.g. UPI Ref / Cheque No."
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <Input
                label="Notes (Optional)"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="e.g. Receipt given to mother"
              />
            </div>
          </form>
        </Modal>
      )}

      {/* ADD / LINK GUARDIAN MODAL */}
      {isLinkGuardianModalOpen && (
        <Modal
          isOpen={isLinkGuardianModalOpen}
          onClose={() => setIsLinkGuardianModalOpen(false)}
          title="Link Parent / Guardian"
          subtitle={`For student: ${student.full_name}`}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsLinkGuardianModalOpen(false)} disabled={isSavingGuardian}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveNewGuardian} disabled={isSavingGuardian}>
                {isSavingGuardian ? 'Saving...' : 'Link Guardian'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveNewGuardian}>
            <Input
              label="Guardian Full Name"
              value={newGuardianForm.fullName}
              onChange={(e) => setNewGuardianForm({ ...newGuardianForm, fullName: e.target.value })}
              placeholder="e.g. Savita Sharma"
              required
            />

            <Input
              label="Contact Phone"
              value={newGuardianForm.phone}
              onChange={(e) => setNewGuardianForm({ ...newGuardianForm, phone: e.target.value })}
              placeholder="+91 98401 23400"
              required
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <Select
                label="Relationship"
                value={newGuardianForm.relationship}
                onChange={(e) => setNewGuardianForm({ ...newGuardianForm, relationship: e.target.value })}
                options={['Mother', 'Father', 'Local Guardian', 'Guardian', 'Other']}
              />

              <Select
                label="Priority"
                value={newGuardianForm.contactPriority}
                onChange={(e) => setNewGuardianForm({ ...newGuardianForm, contactPriority: e.target.value })}
                options={[
                  { value: 'primary', label: 'Primary Contact' },
                  { value: 'secondary', label: 'Secondary Contact' },
                  { value: 'emergency', label: 'Emergency Contact' },
                ]}
              />
            </div>

            <div style={{ marginTop: '12px' }}>
              <Select
                label="Alert Preference"
                value={newGuardianForm.alertPreference}
                onChange={(e) => setNewGuardianForm({ ...newGuardianForm, alertPreference: e.target.value })}
                options={[
                  { value: 'all', label: 'All Alerts (Roll Call + Fees + Exams)' },
                  { value: 'emergency_only', label: 'Emergency Only (Absences/Failures/Overdue)' },
                  { value: 'none', label: 'Muted' },
                ]}
              />
            </div>
          </form>
        </Modal>
      )}

      {/* PRINTABLE REPORT CARD MODAL */}
      {selectedReportExam && (
        <ReportCardModal
          isOpen={Boolean(selectedReportExam)}
          onClose={() => setSelectedReportExam(null)}
          student={student}
          exam={{
            name: selectedReportExam.exam_name,
            exam_type: selectedReportExam.exam_type,
            subject: selectedReportExam.subject,
            exam_date: selectedReportExam.exam_date,
            total_marks: selectedReportExam.total_marks,
            passing_marks: selectedReportExam.passing_marks,
            academic_year: '2026-27',
          }}
          marksRecord={selectedReportExam}
          attendanceRate={attendanceMetrics.rate}
        />
      )}
    </Modal>
  );
}
