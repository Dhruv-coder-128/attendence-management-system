import React from 'react';
import { printDocument } from '../../lib/printDocument';
import { DocumentHeader, DocumentFooter } from '../print/DocumentHeader';
import {
  Printer,
  X,
  Receipt,
} from 'lucide-react';
import Button from '../common/Button';
import { useAcademySettings } from '../../lib/academySettings';

/**
 * Printable Official Tuition Fee Receipt Modal
 * Formatted with print-friendly layout and native window.print() support
 */
export default function FeeReceiptModal({
  isOpen,
  onClose,
  student,
  paymentRecord = null,
}) {
  const branding = useAcademySettings();

  if (!isOpen || !student) return null;

  const handlePrint = () => printDocument('printable-fee-receipt');

  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const receiptNo = paymentRecord?.reference_no ||
    `REC-${String(student?.admission_no || student?.id || 'STU').replace(/[^A-Z0-9]/gi, '')}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const totalFee = Number(paymentRecord?.total_amount || student?.tuition_fee) || 0;
  const paidAmount = Number(paymentRecord ? paymentRecord.amount : student?.fee_paid) || 0;
  const totalPaid = paymentRecord?.total_paid !== undefined
    ? Number(paymentRecord.total_paid)
    : (Number(student?.fee_paid) || paidAmount);
  const pendingAmount = paymentRecord?.pending_amount !== undefined
    ? Number(paymentRecord.pending_amount)
    : Math.max(0, totalFee - totalPaid);
  const paymentMode = paymentRecord?.payment_method || 'Cash / Online Transfer';

  return (
    <>


      {/* Modal Backdrop */}
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          className="modal-content"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            maxWidth: '750px',
            width: '100%',
            maxHeight: 'calc(92vh / var(--ui-zoom, 1))',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            overflow: 'hidden',
          }}
        >
          {/* Modal Header Actions (Screen Only) */}
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
              <Receipt size={18} color="var(--navy-900)" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy-950)' }}>
                Official Tuition Fee Receipt
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="primary" size="sm" icon={Printer} onClick={handlePrint}>
                Print Receipt
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

          {/* Printable Receipt Area */}
          <div
            id="printable-fee-receipt"
            style={{
              padding: '32px',
              overflowY: 'auto',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              fontFamily: 'var(--font-sans, system-ui, sans-serif)',
            }}
          >
            <DocumentHeader branding={branding} title="Fee Payment Receipt" meta={[['Receipt No', receiptNo], ['Date', todayStr]]} />

            {/* Student & Academic Details */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                marginBottom: '20px',
                fontSize: '13px',
              }}
            >
              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Student Full Name
                </div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                  {student.full_name}
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Admission / Roll No.
                </div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#0f172a' }}>
                  {student.admission_no} {student.roll_no ? `(Roll: ${student.roll_no})` : ''}
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Course Enrolled
                </div>
                <div style={{ fontWeight: 600, color: '#334155' }}>
                  {student.courses?.name || student.course_name || '—'}
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Batch / Cohort
                </div>
                <div style={{ fontWeight: 600, color: '#334155' }}>
                  {student.batches?.name || student.batch_name || '—'}
                </div>
              </div>
            </div>

            {/* 4. Financial Table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '20px',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700 }}>Payment Method</th>
                  <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <strong>Tuition Fee Installment</strong>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Academic Year: {branding.academic_year}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#334155' }}>
                    {paymentMode}
                    {paymentRecord?.reference_no && (
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        Ref: {paymentRecord.reference_no}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontSize: '15px' }}>
                    ₹{paidAmount.toLocaleString('en-IN')}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 5. Statement Summary Breakdown */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '28px',
              }}
            >
              <div style={{ width: '280px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>Total Course Fee:</span>
                  <strong style={{ color: '#0f172a' }}>₹{totalFee.toLocaleString('en-IN')}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ color: '#64748b' }}>Total Fee Paid to Date:</span>
                  <strong style={{ color: 'var(--status-present)' }}>₹{totalPaid.toLocaleString('en-IN')}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '6px 0',
                    borderTop: '1px solid #e2e8f0',
                    marginTop: '4px',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Balance Outstanding:</span>
                  <strong style={{ color: pendingAmount > 0 ? 'var(--status-absent)' : 'var(--status-present)', fontSize: '14px' }}>
                    ₹{pendingAmount.toLocaleString('en-IN')}
                  </strong>
                </div>
              </div>
            </div>

            <DocumentFooter signatures={['Received by', 'Authorized Signatory']} note="Please keep this receipt for your records" />
          </div>
        </div>
      </div>
    </>
  );
}
