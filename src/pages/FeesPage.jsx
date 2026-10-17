import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  Search,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  Eye,
  Printer,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import StatsCard from '../components/common/StatsCard';
import StudentAcademicDossier from '../components/students/StudentAcademicDossier';
import FeeReceiptModal from '../components/fees/FeeReceiptModal';
import Pagination from '../components/common/Pagination';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  recordFeePayment,
  computeFeeStatus,
  getStandardCoursePolicy,
} from '../lib/feeService';
import { sendVerifiedFeeReminder } from '../lib/telegramClient';

/**
 * Tuition Fees & Accounts Management
 * Displays real student fee records, supports installment recording & Telegram reminders.
 */
export default function FeesPage({ onRefreshCounts }) {
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  // Filters, Search & Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Record Payment Modal State
  const [selectedStudentForPayment, setSelectedStudentForPayment] = useState(null);
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash',
    referenceNo: '',
    notes: '',
  });
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Sending Telegram Reminder State
  const [sendingReminderId, setSendingReminderId] = useState(null);

  // Dossier Modal State
  const [dossierStudent, setDossierStudent] = useState(null);

  // Official Fee Receipt Modal State
  const [receiptStudent, setReceiptStudent] = useState(null);
  const [receiptPaymentRecord, setReceiptPaymentRecord] = useState(null);

  // Fetch all students and their fee records with resilient parallel query
  const loadFeesData = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch batches for filter dropdown
      const { data: batchesData } = await supabase
        .from('batches')
        .select('id, name, code')
        .order('name');
      setBatches(batchesData || []);

      // 2. Fetch students with course and batch joins
      const { data: studentsData, error: sErr } = await supabase
        .from('students')
        .select(`
          id,
          admission_no,
          roll_no,
          full_name,
          email,
          phone,
          status,
          tuition_fee,
          fee_paid,
          fee_status,
          fee_due_date,
          enrollment_date,
          courses:course_id ( id, name, code, level ),
          batches:batch_id ( id, name, code )
        `)
        .order('full_name');

      if (sErr) throw sErr;

      // 3. In parallel, fetch student_fees records if available
      let feeRecordsMap = {};
      try {
        const { data: feeRecords, error: fErr } = await supabase
          .from('student_fees')
          .select('id, student_id, total_amount, paid_amount, pending_amount, status, next_due_date, installment_schedule');

        if (!fErr && feeRecords) {
          feeRecords.forEach((f) => {
            feeRecordsMap[f.student_id] = f;
          });
        }
      } catch (fCatch) {
        console.warn('student_fees query note:', fCatch);
      }

      // 4. Merge students with fee data
      const mergedStudents = (studentsData || []).map((student) => {
        const feeRecord = feeRecordsMap[student.id];
        const policy = getStandardCoursePolicy(student.courses);
        const total = Number(feeRecord?.total_amount ?? student.tuition_fee ?? policy.total);
        const paid = Number(feeRecord?.paid_amount ?? student.fee_paid ?? 0);
        const computed = computeFeeStatus(
          total,
          paid,
          feeRecord?.installment_schedule || [],
          feeRecord?.next_due_date || student.fee_due_date
        );

        return {
          ...student,
          student_fees: feeRecord ? [feeRecord] : [],
          tuition_fee: total,
          fee_paid: paid,
          fee_status: computed.status,
          fee_due_date: feeRecord?.next_due_date || student.fee_due_date || computed.nextDueDate,
        };
      });

      setStudents(mergedStudents);
    } catch (err) {
      console.error('Error fetching fees data:', err);
      setError(err.message || 'Failed to load student fee records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeesData();
  }, [loadFeesData]);

  const showNotice = (msg, isError = false) => {
    setNotice({ text: msg, isError });
    setTimeout(() => setNotice(null), 4500);
  };

  // Derived KPI Totals
  const stats = useMemo(() => {
    let totalExpected = 0;
    let totalCollected = 0;
    let overdueCount = 0;

    students.forEach((s) => {
      const tuition = Number(s.tuition_fee ?? 36000);
      const paid = Number(s.fee_paid || 0);
      const status = s.fee_status || 'pending';

      totalExpected += tuition;
      totalCollected += paid;

      if (status === 'overdue') overdueCount++;
    });

    const pendingBalance = Math.max(0, totalExpected - totalCollected);

    return {
      totalExpected,
      totalCollected,
      pendingBalance,
      overdueCount,
    };
  }, [students]);

  // Filtered Students List
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        !searchTerm ||
        s.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.admission_no?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.roll_no?.toLowerCase().includes(searchTerm.toLowerCase());

      const batchId = s.batches?.id;
      const matchesBatch = selectedBatch === 'ALL' || batchId === selectedBatch;

      const status = (s.fee_status || 'pending').toLowerCase();
      const matchesStatus =
        selectedStatus === 'ALL' || status === selectedStatus.toLowerCase();

      return matchesSearch && matchesBatch && matchesStatus;
    });
  }, [students, searchTerm, selectedBatch, selectedStatus]);

  // 20-Row Pagination Calculation
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, currentPage, pageSize]);

  // Handle Record Payment Submit
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedStudentForPayment) return;

    const amt = parseFloat(paymentData.amount);
    if (isNaN(amt) || amt <= 0) {
      alert('Please enter a valid positive payment amount.');
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const feeRec = selectedStudentForPayment.student_fees?.[0];
      const res = await recordFeePayment({
        studentId: selectedStudentForPayment.id,
        amount: amt,
        paymentMethod: paymentData.paymentMethod,
        referenceNo: paymentData.referenceNo,
        notes: paymentData.notes,
        existingFeeRecord: feeRec || {
          total_amount: Number(selectedStudentForPayment.tuition_fee || 36000),
          paid_amount: Number(selectedStudentForPayment.fee_paid || 0),
          academic_year: '2026-27',
        },
      });

      if (res.success) {
        showNotice(res.message || 'Payment recorded successfully.');

        const newPaid = res.paid_amount !== undefined
          ? res.paid_amount
          : (Number(selectedStudentForPayment.fee_paid || 0) + amt);

        const newPending = res.pending_amount !== undefined
          ? res.pending_amount
          : Math.max(0, Number(selectedStudentForPayment.tuition_fee || 36000) - newPaid);

        const newTotal = res.total_amount || Number(selectedStudentForPayment.tuition_fee || 36000);

        const updatedStudent = {
          ...selectedStudentForPayment,
          fee_paid: newPaid,
          tuition_fee: newTotal,
          fee_status: res.status || (newPending === 0 ? 'paid' : 'partial'),
          fee_due_date: res.next_due_date || selectedStudentForPayment.fee_due_date,
          student_fees: [res.feeRecord || res],
        };

        const paidDetails = {
          amount: amt,
          payment_method: paymentData.paymentMethod,
          reference_no: paymentData.referenceNo,
          notes: paymentData.notes,
          total_paid: newPaid,
          pending_amount: newPending,
          total_amount: newTotal,
        };

        // Optimistically update students list so table immediately shows new figures
        setStudents((prev) =>
          prev.map((s) => (s.id === selectedStudentForPayment.id ? { ...s, ...updatedStudent } : s))
        );

        setSelectedStudentForPayment(null);
        setPaymentData({ amount: '', paymentMethod: 'Cash', referenceNo: '', notes: '' });

        // Immediately present receipt modal for printing with the updated student record
        setReceiptPaymentRecord(paidDetails);
        setReceiptStudent(updatedStudent);

        await loadFeesData();
        if (onRefreshCounts) onRefreshCounts();
      } else {
        showNotice(res.error || 'Failed to record payment.', true);
      }
    } catch (err) {
      showNotice(err.message || 'Error recording payment.', true);
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Handle Telegram Fee Reminder
  const handleSendReminder = async (student) => {
    setSendingReminderId(student.id);
    try {
      const feeRec = student.student_fees?.[0];
      const res = await sendVerifiedFeeReminder(student.id, feeRec || {
        total_amount: Number(student.tuition_fee || 36000),
        paid_amount: Number(student.fee_paid || 0),
        pending_amount: Number(student.tuition_fee || 36000) - Number(student.fee_paid || 0),
        status: student.fee_status || 'pending',
        next_due_date: student.fee_due_date,
      });

      if (res.ok) {
        showNotice(
          `Fee reminder sent via Telegram to ${res.sentCount || 1} verified guardian(s) of ${student.full_name}!`
        );
      } else {
        showNotice(res.error || 'Failed to dispatch Telegram fee reminder.', true);
      }
    } catch (err) {
      showNotice(err.message || 'Error sending Telegram fee reminder.', true);
    } finally {
      setSendingReminderId(null);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Fees</h1>
          <p className="page-description">
            Track student tuition installments, record fee payments, and send Telegram reminders to guardians
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={loadFeesData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            borderRadius: '6px',
            backgroundColor: notice.isError ? 'var(--status-absent-bg)' : 'var(--status-present-bg)',
            border: `1px solid ${notice.isError ? 'var(--status-absent-border)' : 'var(--status-present-border)'}`,
            color: notice.isError ? 'var(--status-absent)' : 'var(--status-present)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {notice.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Primary KPI Cards (Consistent with design system) */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <StatsCard
          title="Total Fees"
          value={loading ? '...' : `₹${stats.totalExpected.toLocaleString('en-IN')}`}
          subtext="Annual academic billing"
          icon={DollarSign}
          variant="navy"
        />

        <StatsCard
          title="Total Paid"
          value={loading ? '...' : `₹${stats.totalCollected.toLocaleString('en-IN')}`}
          subtext={
            stats.totalExpected > 0
              ? `${Math.round((stats.totalCollected / stats.totalExpected) * 100)}% Collected`
              : 'Cleared receipts'
          }
          icon={CheckCircle2}
          variant="success"
        />

        <StatsCard
          title="Pending Balance"
          value={loading ? '...' : `₹${stats.pendingBalance.toLocaleString('en-IN')}`}
          subtext="Outstanding dues"
          icon={CreditCard}
          variant="gold"
        />

        <StatsCard
          title="Overdue Accounts"
          value={loading ? '...' : String(stats.overdueCount)}
          subtext={stats.overdueCount > 0 ? 'Past payment deadline' : 'Zero overdue installments'}
          icon={AlertTriangle}
          variant={stats.overdueCount > 0 ? 'danger' : 'navy'}
        />
      </div>

      {/* Main Table Card */}
      <div className="erp-card" style={{ padding: '20px' }}>
        {/* Search & Filter Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search student or admission no..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="form-input"
                style={{ paddingLeft: '32px', fontSize: '13px' }}
              />
            </div>

            <select
              value={selectedBatch}
              onChange={(e) => {
                setSelectedBatch(e.target.value);
                setCurrentPage(1);
              }}
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
            >
              <option value="ALL">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="form-input"
              style={{ width: 'auto', fontSize: '13px' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing <strong>{filteredStudents.length}</strong> of {students.length} students
          </div>
        </div>

        {/* Fees Table */}
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Batch</th>
                <th style={{ textAlign: 'right' }}>Total Fee</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th style={{ textAlign: 'right' }}>Pending</th>
                <th>Status</th>
                <th>Next Due Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    Loading fee records...
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    No student fee records found matching your filters.
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s) => {
                  const total = Number(s.tuition_fee ?? 36000);
                  const paid = Number(s.fee_paid || 0);
                  const pending = Math.max(0, total - paid);
                  const status = (s.fee_status || 'pending').toLowerCase();
                  const dueDate = s.fee_due_date || 'N/A';

                  let badgeVariant = 'gold';
                  if (status === 'paid') badgeVariant = 'present';
                  else if (status === 'overdue') badgeVariant = 'absent';
                  else if (status === 'partial') badgeVariant = 'late';

                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Adm: {s.admission_no || 'N/A'} {s.roll_no ? `| Roll: ${s.roll_no}` : ''}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {s.batches?.name || 'Unassigned'}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--navy-950)' }}>
                        ₹{total.toLocaleString('en-IN')}
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--status-present)' }}>
                        ₹{paid.toLocaleString('en-IN')}
                      </td>

                      <td
                        style={{
                          textAlign: 'right',
                          fontWeight: 600,
                          color: pending > 0 ? 'var(--status-absent)' : 'var(--text-muted)',
                        }}
                      >
                        ₹{pending.toLocaleString('en-IN')}
                      </td>

                      <td>
                        <Badge variant={badgeVariant}>
                          {status.toUpperCase()}
                        </Badge>
                      </td>

                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {dueDate}
                        </span>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setSelectedStudentForPayment(s);
                              setPaymentData({
                                amount: '',
                                paymentMethod: 'Cash',
                                referenceNo: '',
                                notes: '',
                              });
                            }}
                            title="Record Payment"
                          >
                            Pay
                          </Button>

                          {pending > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Send}
                              onClick={() => handleSendReminder(s)}
                              disabled={sendingReminderId === s.id}
                              title="Send Telegram Fee Reminder"
                            >
                              {sendingReminderId === s.id ? '...' : 'Remind'}
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            icon={Printer}
                            onClick={() => {
                              setReceiptPaymentRecord(null);
                              setReceiptStudent(s);
                            }}
                            title="Print Official Fee Receipt"
                          >
                            Receipt
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            icon={Eye}
                            onClick={() => setDossierStudent(s)}
                            title="View Full Dossier"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredStudents.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={Boolean(selectedStudentForPayment)}
        onClose={() => setSelectedStudentForPayment(null)}
        title={`Record Tuition Payment: ${selectedStudentForPayment?.full_name}`}
        subtitle="Submit fee receipt and update student balance in PostgreSQL"
      >
        {selectedStudentForPayment && (() => {
          const totalFee = Number(
            selectedStudentForPayment?.student_fees?.[0]?.total_amount ??
            selectedStudentForPayment?.tuition_fee ??
            36000
          );
          const alreadyPaid = Number(
            selectedStudentForPayment?.student_fees?.[0]?.paid_amount ??
            selectedStudentForPayment?.fee_paid ??
            0
          );
          const pendingBefore = Math.max(0, totalFee - alreadyPaid);
          const enteredAmt = Math.max(0, parseFloat(paymentData.amount) || 0);
          const remainingAfter = Math.max(0, pendingBefore - enteredAmt);

          return (
            <form onSubmit={handleRecordPayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Real-time Dynamic Financial Breakdown Card */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--slate-50, #f8fafc)',
                  border: '1px solid var(--slate-200, #e2e8f0)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>Total Course Fee</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-950, #0f172a)' }}>
                    ₹{totalFee.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>Already Paid</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--status-present, #10b981)' }}>
                    ₹{alreadyPaid.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary, #64748b)' }}>Current Pending Balance</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: pendingBefore > 0 ? 'var(--status-absent, #ef4444)' : 'var(--text-muted, #94a3b8)' }}>
                    ₹{pendingBefore.toLocaleString('en-IN')}
                  </span>
                </div>

                <div style={{ borderTop: '1px dashed var(--slate-200, #cbd5e1)', margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-900, #1e293b)' }}>
                    Remaining Balance After This Payment
                  </span>
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 700,
                      color: remainingAfter === 0 ? 'var(--status-present, #10b981)' : 'var(--brand-primary, #4338ca)',
                    }}
                  >
                    ₹{remainingAfter.toLocaleString('en-IN')}
                    {remainingAfter === 0 && enteredAmt > 0 && (
                      <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--status-present, #10b981)', fontWeight: 600 }}>
                        (Fully Cleared)
                      </span>
                    )}
                  </span>
                </div>
              </div>

              <div>
                <Input
                  label="Payment Amount (₹)"
                  type="number"
                  placeholder="e.g. 10000"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  required
                  autoFocus
                />

                {/* Quick-select pills */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {pendingBefore > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: String(pendingBefore) })}
                      style={{
                        background: 'var(--slate-100, #f1f5f9)',
                        border: '1px solid var(--slate-300, #cbd5e1)',
                        color: 'var(--navy-900, #0f172a)',
                        cursor: 'pointer',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Clear Full Pending (₹{pendingBefore.toLocaleString('en-IN')})
                    </button>
                  )}
                  {pendingBefore >= 10000 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: '10000' })}
                      style={{
                        background: 'var(--slate-100, #f1f5f9)',
                        border: '1px solid var(--slate-300, #cbd5e1)',
                        color: 'var(--navy-900, #0f172a)',
                        cursor: 'pointer',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                    >
                      ₹10,000
                    </button>
                  )}
                  {pendingBefore >= 5000 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: '5000' })}
                      style={{
                        background: 'var(--slate-100, #f1f5f9)',
                        border: '1px solid var(--slate-300, #cbd5e1)',
                        color: 'var(--navy-900, #0f172a)',
                        cursor: 'pointer',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 500,
                      }}
                    >
                      ₹5,000
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--navy-900)',
                    marginBottom: '4px',
                  }}
                >
                  Payment Mode
                </label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value })}
                  className="form-input"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI / GPay / PhonePe">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer (NEFT/IMPS)">Bank Transfer (NEFT/IMPS)</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Debit / Credit Card">Debit / Credit Card</option>
                </select>
              </div>

              <Input
                label="Transaction / Reference Number (Optional)"
                placeholder="e.g. UPI-98745123 or Cheque #123456"
                value={paymentData.referenceNo}
                onChange={(e) => setPaymentData({ ...paymentData, referenceNo: e.target.value })}
              />

              <Input
                label="Notes / Receipt Remarks (Optional)"
                placeholder="e.g. Installment payment received"
                value={paymentData.notes}
                onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => setSelectedStudentForPayment(null)}
                  disabled={isSubmittingPayment}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={isSubmittingPayment || enteredAmt <= 0}
                >
                  {isSubmittingPayment ? 'Saving Receipt...' : `Confirm Payment (₹${(enteredAmt || 0).toLocaleString('en-IN')})`}
                </Button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* STUDENT ACADEMIC DOSSIER MODAL */}
      {dossierStudent && (
        <StudentAcademicDossier
          student={dossierStudent}
          isOpen={Boolean(dossierStudent)}
          onClose={() => {
            setDossierStudent(null);
            loadFeesData();
          }}
          onUpdateStudent={() => {
            loadFeesData();
          }}
        />
      )}

      {/* OFFICIAL FEE RECEIPT MODAL */}
      <FeeReceiptModal
        isOpen={Boolean(receiptStudent)}
        onClose={() => {
          setReceiptStudent(null);
          setReceiptPaymentRecord(null);
        }}
        student={receiptStudent}
        paymentRecord={receiptPaymentRecord}
      />
    </div>
  );
}
