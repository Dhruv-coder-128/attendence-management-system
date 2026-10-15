import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  User,
  GraduationCap,
  Calendar,
  Clock,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  CreditCard,
  DollarSign,
  Send,
  Plus,
  ShieldCheck,
  UserCheck,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  ChevronRight,
  Share2,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  getStudentFeeRecord,
  recordFeePayment,
  computeFeeStatus,
  getStandardCoursePolicy,
} from '../../lib/feeService';
import { sendVerifiedFeeReminder } from '../../lib/telegramClient';

export default function StudentAcademicDossier({
  student,
  isOpen,
  onClose,
  onUpdateStudent,
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'attendance' | 'fees' | 'guardians'

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
  const [reminderNotice, setReminderNotice] = useState(null);

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

  const [toastMessage, setToastMessage] = useState('');

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch Tuition Fee Details
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

  // 2. Fetch Cumulative & Monthly Attendance Records
  const fetchAttendanceData = useCallback(async () => {
    if (!student || !supabase || !isSupabaseConfigured) {
      setAttendanceLoading(false);
      return;
    }
    setAttendanceLoading(true);
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('id, date, status, time_in, remarks, session_name')
        .eq('student_id', student.id)
        .order('date', { ascending: false });

      if (error) throw error;
      setAttendanceRecords(data || []);
    } catch (err) {
      console.warn('Error loading attendance for dossier:', err);
    } finally {
      setAttendanceLoading(false);
    }
  }, [student]);

  // 3. Fetch Linked Guardians with Multi-Guardian Preferences
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

      if (!error && data) {
        setGuardians(data);
      } else {
        // Fallback to student's embedded parent_students if available
        setGuardians(student.parent_students || []);
      }
    } catch (err) {
      console.warn('Error fetching guardians:', err);
      setGuardians(student.parent_students || []);
    } finally {
      setGuardiansLoading(false);
    }
  }, [student]);

  useEffect(() => {
    if (student && isOpen) {
      fetchFeeData();
      fetchAttendanceData();
      fetchGuardiansData();
    }
  }, [student, isOpen, fetchFeeData, fetchAttendanceData, fetchGuardiansData]);

  // Attendance Metrics Computation
  const attendanceMetrics = useMemo(() => {
    const total = attendanceRecords.length;
    const present = attendanceRecords.filter((r) => r.status === 'Present').length;
    const late = attendanceRecords.filter((r) => r.status === 'Late').length;
    const absent = attendanceRecords.filter((r) => r.status === 'Absent').length;
    const excused = attendanceRecords.filter((r) => r.status === 'Excused').length;
    const attended = present + late;
    const rate = total > 0 ? Math.round((attended / total) * 100) : 100;

    // Monthly breakdown
    const monthlyMap = {};
    attendanceRecords.forEach((r) => {
      const monthKey = r.date.substring(0, 7); // YYYY-MM
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
      .map((mKey) => {
        const item = monthlyMap[mKey];
        const [year, month] = mKey.split('-');
        const monthName = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1).toLocaleString('en-IN', {
          month: 'short',
          year: 'numeric',
        });
        const mAttended = item.present + item.late;
        const mRate = item.total > 0 ? Math.round((mAttended / item.total) * 100) : 100;
        return {
          monthKey: mKey,
          label: monthName,
          ...item,
          rate: mRate,
        };
      });

    return {
      total,
      present,
      late,
      absent,
      excused,
      rate,
      isDefaulter: total > 0 && rate < 75,
      monthlyTrends,
    };
  }, [attendanceRecords]);

  // Fee Status Computation
  const computedFee = useMemo(() => {
    if (!feeRecord) {
      return {
        total: 45000,
        paid: 0,
        pending: 45000,
        status: 'pending',
        isOverdue: false,
        daysOverdue: 0,
        badgeStatus: 'Pending',
        label: 'Pending',
      };
    }

    const total = Number(feeRecord.total_amount || 0);
    const paid = Number(feeRecord.paid_amount || 0);
    const schedule = feeRecord.installment_schedule || [];
    const info = computeFeeStatus(total, paid, schedule, feeRecord.next_due_date);

    return {
      total,
      paid,
      pending: Math.max(0, total - paid),
      ...info,
    };
  }, [feeRecord]);

  // Record Payment Handler
  const handleOpenPayment = (installment = null) => {
    setPaymentForm({
      amount: installment ? String(installment.amount) : String(computedFee.pending),
      paymentMethod: 'UPI',
      referenceNo: '',
      notes: '',
      installmentNo: installment ? installment.installment_no : null,
    });
    setIsPaymentModalOpen(true);
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    setIsRecordingPayment(true);
    try {
      const res = await recordFeePayment({
        studentId: student.id,
        amount: paymentForm.amount,
        paymentMethod: paymentForm.paymentMethod,
        referenceNo: paymentForm.referenceNo,
        notes: paymentForm.notes,
        existingFeeRecord: feeRecord,
        installmentNumber: paymentForm.installmentNo,
      });

      if (res.success) {
        showToast(res.message);
        setFeeRecord(res.feeRecord);
        setIsPaymentModalOpen(false);
        if (onUpdateStudent) onUpdateStudent();
      }
    } catch (err) {
      alert('Error recording payment: ' + err.message);
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Send Telegram Fee Reminder
  const handleSendFeeReminder = async () => {
    setIsSendingReminder(true);
    setReminderNotice(null);
    try {
      const result = await sendVerifiedFeeReminder({
        student,
        feeRecord: {
          ...feeRecord,
          ...computedFee,
        },
      });

      if (result.success) {
        setReminderNotice({
          ok: true,
          message: `Official Telegram tuition fee schedule reminder dispatched to linked guardian(s)!`,
        });
        showToast('Fee reminder dispatched via Telegram!');
        // Update last reminder timestamp
        setFeeRecord((prev) => ({
          ...prev,
          last_reminder_sent_at: new Date().toISOString(),
        }));
      } else {
        setReminderNotice({
          ok: false,
          error: result.error || 'Failed to dispatch Telegram reminder.',
        });
      }
    } catch (err) {
      setReminderNotice({
        ok: false,
        error: err.message || 'Network error communicating with Telegram dispatcher.',
      });
    } finally {
      setIsSendingReminder(false);
    }
  };

  // Update Guardian Alert Preferences
  const handleUpdateGuardianPreference = async (parentStudentId, newPref) => {
    try {
      const { error } = await supabase
        .from('parent_students')
        .update({ alert_preference: newPref })
        .eq('id', parentStudentId);

      if (error) throw error;

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
      // 1. Unset current primary
      await supabase
        .from('parent_students')
        .update({ is_primary_contact: false, contact_priority: 'secondary' })
        .eq('student_id', student.id);

      // 2. Set new primary
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

  // Link New Guardian Handler
  const handleSaveNewGuardian = async (e) => {
    e.preventDefault();
    setIsSavingGuardian(true);
    try {
      // 1. Insert or find parent in public.parents
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

      // 2. Link in public.parent_students
      const { error: plErr } = await supabase.from('parent_students').insert([
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

      if (plErr) throw plErr;

      showToast(`Added ${newGuardianForm.relationship} (${newGuardianForm.fullName}) to student record!`);
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Student Academic Dossier"
      subtitle={`${student.full_name} • Adm No: ${student.admission_no} • Ruparel Tuition Management`}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close Dossier
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Toast Feedback */}
        {toastMessage && (
          <div
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

        {/* 1. Master Header Card */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: 'var(--navy-900)',
            borderRadius: '8px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'var(--navy-800)',
                color: 'var(--gold-light)',
                border: '2px solid var(--gold-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
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
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff' }}>
                {student.full_name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--gold-light)', marginTop: '2px' }}>
                {student.courses?.name || 'Academic Stream'} &bull; {student.batches?.name || 'Cohort Batch'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                Adm No: {student.admission_no} &bull; Roll: {student.roll_no || '—'}
              </div>
            </div>
          </div>

          {/* Badges strip */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge status={student.status === 'active' ? 'Present' : 'Pending'}>
              {student.status.toUpperCase()}
            </Badge>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor:
                  computedFee.status === 'paid'
                    ? 'var(--status-present-bg)'
                    : computedFee.status === 'overdue'
                    ? 'var(--status-absent-bg)'
                    : 'var(--status-late-bg)',
                color:
                  computedFee.status === 'paid'
                    ? 'var(--status-present)'
                    : computedFee.status === 'overdue'
                    ? 'var(--status-absent)'
                    : 'var(--status-late)',
                border: '1px solid currentColor',
              }}
            >
              FEE: {computedFee.label.toUpperCase()}
            </span>

            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                backgroundColor: attendanceMetrics.isDefaulter ? 'var(--status-absent-bg)' : 'var(--status-present-bg)',
                color: attendanceMetrics.isDefaulter ? 'var(--status-absent)' : 'var(--status-present)',
                border: '1px solid currentColor',
              }}
            >
              ATTENDANCE: {attendanceMetrics.rate}%
            </span>
          </div>
        </div>

        {/* 2. Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            overflowX: 'auto',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'profile' ? '2px solid var(--navy-900)' : '2px solid transparent',
              color: activeTab === 'profile' ? 'var(--navy-950)' : 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <User size={15} /> Academic Profile
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'attendance' ? '2px solid var(--navy-900)' : '2px solid transparent',
              color: activeTab === 'attendance' ? 'var(--navy-950)' : 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <TrendingUp size={15} /> Attendance Trends ({attendanceMetrics.rate}%)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('fees')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'fees' ? '2px solid var(--navy-900)' : '2px solid transparent',
              color: activeTab === 'fees' ? 'var(--navy-950)' : 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <CreditCard size={15} /> Tuition Fees &amp; Installments
            {computedFee.isOverdue && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  backgroundColor: 'var(--status-absent)',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: '10px',
                }}
              >
                OVERDUE
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('guardians')}
            style={{
              padding: '10px 16px',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              borderBottom: activeTab === 'guardians' ? '2px solid var(--navy-900)' : '2px solid transparent',
              color: activeTab === 'guardians' ? 'var(--navy-950)' : 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ShieldCheck size={15} /> Multi-Guardian &amp; Telegram ({guardians.length})
          </button>
        </div>

        {/* 3. TAB CONTENT */}

        {/* TAB 1: ACADEMIC PROFILE */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '14px',
                backgroundColor: 'var(--bg-subtle)',
                padding: '16px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Course Stream</span>
                <strong style={{ color: 'var(--navy-950)' }}>{student.courses?.name || 'Standard'}</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Level: {student.courses?.level || '11th/12th'}</div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Assigned Batch &amp; Timing</span>
                <strong style={{ color: 'var(--navy-950)' }}>{student.batches?.name || 'Default Cohort'}</strong>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {student.batches?.timing || 'Standard Timings'} ({student.batches?.classroom || 'Main Wing'})
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Primary Phone</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <Phone size={13} color="var(--navy-700)" />
                  <span>{student.phone || 'No phone recorded'}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Student Email</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <Mail size={13} color="var(--navy-700)" />
                  <span>{student.email || 'No email recorded'}</span>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Gender &amp; Date of Birth</span>
                <span>{student.gender || '—'} {student.dob ? `(${student.dob})` : ''}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Admission Date &amp; Blood Group</span>
                <span>{student.enrollment_date || '—'} &bull; {student.blood_group || 'O+'}</span>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Residential Address</span>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginTop: '2px' }}>
                  <MapPin size={13} color="var(--navy-700)" style={{ marginTop: '3px', flexShrink: 0 }} />
                  <span>{student.address || 'Not provided'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: ATTENDANCE TRENDS & ANALYSIS */}
        {activeTab === 'attendance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Defaulter Alert */}
            {attendanceMetrics.isDefaulter && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--status-absent-bg)',
                  border: '1px solid var(--status-absent-border)',
                  borderRadius: '6px',
                  color: 'var(--status-absent)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Academic Defaulter Notice:</strong> This student&apos;s cumulative attendance is currently{' '}
                  <strong>{attendanceMetrics.rate}%</strong>, which is below the mandatory 75% academy threshold. Guardian counseling recommended.
                </span>
              </div>
            )}

            {/* Attendance KPI Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '10px',
                textAlign: 'center',
              }}
            >
              <div style={{ padding: '12px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sessions Held</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)' }}>{attendanceMetrics.total}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Present</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-present)' }}>{attendanceMetrics.present}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Late</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-late)' }}>{attendanceMetrics.late}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Absent</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-absent)' }}>{attendanceMetrics.absent}</div>
              </div>
              <div style={{ padding: '12px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rate %</div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: attendanceMetrics.isDefaulter ? 'var(--status-absent)' : 'var(--status-present)',
                  }}
                >
                  {attendanceMetrics.rate}%
                </div>
              </div>
            </div>

            {/* Monthly Trend Breakdown */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '10px' }}>
                Monthly Attendance Velocity (Recent Terms)
              </h4>

              {attendanceMetrics.monthlyTrends.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No historical roll call records found for this student.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attendanceMetrics.monthlyTrends.map((trend) => (
                    <div
                      key={trend.monthKey}
                      style={{
                        padding: '10px 14px',
                        backgroundColor: '#ffffff',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ width: '130px', fontWeight: 600, color: 'var(--navy-950)', fontSize: '13px' }}>
                        {trend.label}
                      </div>

                      {/* Progress bar */}
                      <div style={{ flex: 1, backgroundColor: '#f1f5f9', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${trend.rate}%`,
                            height: '100%',
                            backgroundColor: trend.rate >= 75 ? 'var(--status-present)' : 'var(--status-absent)',
                            borderRadius: '4px',
                          }}
                        />
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', width: '140px', textAlign: 'right' }}>
                        {trend.present + trend.late} / {trend.total} sessions ({trend.rate}%)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TUITION FEES & INSTALLMENTS */}
        {activeTab === 'fees' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Reminder Feedback banner */}
            {reminderNotice && (
              <div
                style={{
                  padding: '10px 14px',
                  backgroundColor: reminderNotice.ok ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                  border: `1px solid ${reminderNotice.ok ? 'var(--status-present-border)' : 'var(--status-absent-border)'}`,
                  borderRadius: '6px',
                  color: reminderNotice.ok ? 'var(--status-present)' : 'var(--status-absent)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {reminderNotice.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{reminderNotice.ok ? reminderNotice.message : reminderNotice.error}</span>
              </div>
            )}

            {/* Overdue Banner */}
            {computedFee.isOverdue && (
              <div
                style={{
                  padding: '12px 16px',
                  backgroundColor: 'var(--status-absent-bg)',
                  border: '1px solid var(--status-absent-border)',
                  borderRadius: '6px',
                  color: 'var(--status-absent)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} />
                  <span>
                    <strong>Fee Overdue Warning:</strong> Outstanding balance of ₹{computedFee.pending.toLocaleString('en-IN')} is overdue by {computedFee.daysOverdue} days (Due: {feeRecord?.next_due_date || 'Past'}).
                  </span>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Send}
                  onClick={handleSendFeeReminder}
                  disabled={isSendingReminder}
                >
                  {isSendingReminder ? 'Dispatching...' : 'Alert Guardians via Telegram'}
                </Button>
              </div>
            )}

            {/* Fee KPI Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px',
              }}
            >
              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Tuition Fee</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '2px' }}>
                  ₹{computedFee.total.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Academic Year 2026-27</div>
              </div>

              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Amount Paid</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-present)', marginTop: '2px' }}>
                  ₹{computedFee.paid.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {computedFee.total > 0 ? Math.round((computedFee.paid / computedFee.total) * 100) : 0}% cleared
                </div>
              </div>

              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pending Balance</div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: computedFee.pending > 0 ? 'var(--status-absent)' : 'var(--navy-950)',
                    marginTop: '2px',
                  }}
                >
                  ₹{computedFee.pending.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Next Due: {feeRecord?.next_due_date || 'All Cleared'}
                </div>
              </div>

              <div style={{ padding: '12px 16px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Account Status</div>
                <div style={{ marginTop: '6px' }}>
                  <Badge status={computedFee.badgeStatus}>{computedFee.label}</Badge>
                </div>
                {feeRecord?.last_reminder_sent_at && (
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Reminded: {new Date(feeRecord.last_reminder_sent_at).toLocaleDateString('en-IN')}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)' }}>
                Term Installment Schedule &amp; Receipts
              </h4>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Send}
                  onClick={handleSendFeeReminder}
                  disabled={isSendingReminder || computedFee.pending === 0}
                  title="Dispatch fee reminder via Telegram to verified guardians"
                >
                  {isSendingReminder ? 'Sending...' : 'Send Telegram Reminder'}
                </Button>

                <Button
                  variant="gold"
                  size="sm"
                  icon={DollarSign}
                  onClick={() => handleOpenPayment()}
                  disabled={computedFee.pending === 0}
                >
                  Record Payment
                </Button>
              </div>
            </div>

            {/* Installments Table */}
            <div className="table-container">
              <table className="erp-table" style={{ fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th>Installment #</th>
                    <th>Milestone Details</th>
                    <th>Scheduled Due Date</th>
                    <th>Amount</th>
                    <th>Payment Status</th>
                    <th>Payment Details</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(feeRecord?.installment_schedule || []).map((inst, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--navy-900)' }}>#{inst.installment_no}</td>
                      <td>
                        <strong>{inst.label}</strong>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{inst.due_date || '—'}</td>
                      <td style={{ fontWeight: 700, color: 'var(--navy-950)' }}>
                        ₹{inst.amount.toLocaleString('en-IN')}
                      </td>
                      <td>
                        {inst.status === 'paid' ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: 'var(--status-present)',
                              backgroundColor: 'var(--status-present-bg)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            ✓ Paid
                          </span>
                        ) : inst.due_date && inst.due_date < new Date().toISOString().split('T')[0] ? (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: 'var(--status-absent)',
                              backgroundColor: 'var(--status-absent-bg)',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            ! Overdue
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              color: 'var(--text-muted)',
                              backgroundColor: '#f1f5f9',
                              padding: '2px 8px',
                              borderRadius: '4px',
                            }}
                          >
                            Pending
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {inst.status === 'paid' ? (
                          <span>
                            {inst.payment_method} &bull; {inst.reference_no || 'Receipt'}
                          </span>
                        ) : (
                          'Awaiting clearance'
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {inst.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(inst)}
                            className="btn btn-sm btn-outline"
                            style={{ padding: '2px 8px', fontSize: '11px' }}
                          >
                            Pay Installment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: MULTI-GUARDIAN & ALERT ROUTING */}
        {activeTab === 'guardians' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  Family Guardian Registry &amp; Alert Routing
                </h4>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Configure individual alert preferences for Mother, Father, and Local Guardians.
                </p>
              </div>

              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setNewGuardianForm({
                    fullName: '',
                    phone: '',
                    relationship: 'Mother',
                    contactPriority: 'secondary',
                    alertPreference: 'all',
                  });
                  setIsLinkGuardianModalOpen(true);
                }}
              >
                Add / Link Guardian
              </Button>
            </div>

            {guardians.length === 0 ? (
              <div
                style={{
                  padding: '36px',
                  textAlign: 'center',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '6px',
                  border: '1px dashed var(--border-subtle)',
                }}
              >
                <UserCheck size={32} color="var(--gold-dark)" style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-950)' }}>
                  No Guardians Linked Yet
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Link a Father, Mother, or Local Guardian to enable automated Telegram attendance and fee alerts.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {guardians.map((g) => {
                  const parent = g.parents || {};
                  const isPrimary = g.is_primary_contact;
                  const pref = g.alert_preference || 'all';

                  return (
                    <div
                      key={g.id}
                      style={{
                        padding: '16px',
                        backgroundColor: '#ffffff',
                        border: `1px solid ${isPrimary ? 'var(--navy-700)' : 'var(--border-subtle)'}`,
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '50%',
                            backgroundColor: isPrimary ? 'var(--navy-900)' : '#f1f5f9',
                            color: isPrimary ? 'var(--gold-light)' : 'var(--navy-800)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '14px',
                          }}
                        >
                          {g.relationship ? g.relationship[0] : 'G'}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <strong style={{ fontSize: '14px', color: 'var(--navy-950)' }}>
                              {parent.full_name || 'Guardian'}
                            </strong>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--gold-subtle-bg)',
                                color: 'var(--gold-dark)',
                              }}
                            >
                              {g.relationship || 'Guardian'}
                            </span>
                            {isPrimary && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  backgroundColor: '#dbeafe',
                                  color: '#1d4ed8',
                                }}
                              >
                                Primary Contact
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Phone size={12} /> {parent.phone || 'No phone'}
                            </span>
                            {parent.email && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Mail size={12} /> {parent.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Telegram status & Alert Preference Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                        {/* Telegram Link Status */}
                        <div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                            Telegram Integration
                          </span>
                          {parent.is_verified && parent.telegram_chat_id ? (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--status-present)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ShieldCheck size={13} /> Linked ({parent.telegram_chat_id})
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              Not Linked
                            </span>
                          )}
                        </div>

                        {/* Alert Preference Dropdown */}
                        <div>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
                            Notification Route
                          </span>
                          <select
                            value={pref}
                            onChange={(e) => handleUpdateGuardianPreference(g.id, e.target.value)}
                            className="form-select"
                            style={{ height: '30px', fontSize: '11px', padding: '2px 8px' }}
                          >
                            <option value="all">All Alerts (Roll Call + Fees)</option>
                            <option value="emergency_only">Emergency Only (Critical Absences)</option>
                            <option value="none">Muted / No Alerts</option>
                          </select>
                        </div>

                        {/* Make Primary Button */}
                        {!isPrimary && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetPrimaryGuardian(g.id)}
                            style={{ height: '30px', fontSize: '11px' }}
                          >
                            Set as Primary
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <Modal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          title="Record Tuition Fee Payment"
          subtitle={`Student: ${student.full_name} (${student.admission_no}) • Outstanding: ₹${computedFee.pending.toLocaleString('en-IN')}`}
          size="sm"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleSavePayment}
                disabled={isRecordingPayment}
              >
                {isRecordingPayment ? 'Recording...' : 'Confirm Payment'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSavePayment}>
            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">Payment Amount (₹)</label>
              <input
                type="number"
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                className="form-input"
                required
                min="1"
                max={computedFee.pending}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">Payment Mode</label>
              <select
                value={paymentForm.paymentMethod}
                onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                className="form-select"
              >
                <option value="UPI">UPI / Google Pay / PhonePe</option>
                <option value="Cash">Cash at Reception</option>
                <option value="Bank Transfer">NEFT / RTGS / Bank Transfer</option>
                <option value="Cheque">Cheque Deposit</option>
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label className="form-label">Receipt / Transaction Reference</label>
              <input
                type="text"
                placeholder="e.g. UPI-TXN-89412 or Receipt #104"
                value={paymentForm.referenceNo}
                onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })}
                className="form-input"
              />
            </div>

            <div>
              <label className="form-label">Notes</label>
              <input
                type="text"
                placeholder="Optional notes or remarks"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                className="form-input"
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
          title="Add / Link Guardian"
          subtitle={`Link Mother, Father, or Local Guardian for ${student.full_name}`}
          size="md"
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setIsLinkGuardianModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={handleSaveNewGuardian}
                disabled={isSavingGuardian}
              >
                {isSavingGuardian ? 'Linking...' : 'Save Guardian'}
              </Button>
            </>
          }
        >
          <form onSubmit={handleSaveNewGuardian}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label className="form-label">Guardian Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Smt. Neeta Shah"
                  value={newGuardianForm.fullName}
                  onChange={(e) => setNewGuardianForm({ ...newGuardianForm, fullName: e.target.value })}
                  className="form-input"
                  required
                />
              </div>

              <div>
                <label className="form-label">Contact Phone (Mobile)</label>
                <input
                  type="tel"
                  placeholder="e.g. 9820112233"
                  value={newGuardianForm.phone}
                  onChange={(e) => setNewGuardianForm({ ...newGuardianForm, phone: e.target.value })}
                  className="form-input"
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div>
                <label className="form-label">Relationship</label>
                <select
                  value={newGuardianForm.relationship}
                  onChange={(e) => setNewGuardianForm({ ...newGuardianForm, relationship: e.target.value })}
                  className="form-select"
                >
                  <option value="Mother">Mother</option>
                  <option value="Father">Father</option>
                  <option value="Local Guardian">Local Guardian</option>
                  <option value="Guardian">Guardian</option>
                </select>
              </div>

              <div>
                <label className="form-label">Contact Priority</label>
                <select
                  value={newGuardianForm.contactPriority}
                  onChange={(e) => setNewGuardianForm({ ...newGuardianForm, contactPriority: e.target.value })}
                  className="form-select"
                >
                  <option value="secondary">Secondary Contact</option>
                  <option value="primary">Primary Contact</option>
                </select>
              </div>

              <div>
                <label className="form-label">Alert Routing</label>
                <select
                  value={newGuardianForm.alertPreference}
                  onChange={(e) => setNewGuardianForm({ ...newGuardianForm, alertPreference: e.target.value })}
                  className="form-select"
                >
                  <option value="all">All Alerts</option>
                  <option value="emergency_only">Emergency Only</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
