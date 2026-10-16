import React from 'react';
import {
  Printer,
  X,
  GraduationCap,
  CheckCircle2,
  Receipt,
  CreditCard,
  Calendar,
  Building,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { getStoredAcademySettings, fetchAcademySettings } from '../../lib/academySettings';

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
  if (!isOpen || !student) return null;

  const [branding, setBranding] = React.useState(() => getStoredAcademySettings());

  React.useEffect(() => {
    fetchAcademySettings().then((s) => {
      if (s) setBranding(s);
    });
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const receiptNo = paymentRecord?.reference_no ||
    `REC-${new Date().getFullYear()}-${(student?.admission_no || 'STU').replace(/[^A-Z0-9]/gi, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

  const totalFee = Number(student?.tuition_fee) || 45000;
  const paidAmount = paymentRecord ? Number(paymentRecord.amount) : Number(student?.fee_paid) || 0;
  const totalPaid = Number(student?.fee_paid) || paidAmount;
  const pendingAmount = Math.max(0, totalFee - totalPaid);
  const paymentMode = paymentRecord?.payment_method || 'Cash / Online Transfer';

  return (
    <>
      {/* Print Specific CSS styles injected for perfect paper output */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-fee-receipt, #printable-fee-receipt * {
            visibility: visible !important;
          }
          #printable-fee-receipt {
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
          #printable-fee-receipt img {
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
            maxHeight: '92vh',
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
                    style={{ height: '42px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <GraduationCap size={32} />
                )}
                <span
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}
                >
                  {branding.academy_name}
                </span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                {branding.branch_name} &bull; {branding.address}
              </div>

              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
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
                  marginTop: '10px',
                  padding: '3px 18px',
                  backgroundColor: 'var(--navy-950)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '1px',
                  borderRadius: '20px',
                  textTransform: 'uppercase',
                }}
              >
                Official Fee Payment Receipt
              </div>
            </div>

            {/* 2. Receipt Meta Toolbar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                marginBottom: '18px',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ color: '#64748b' }}>Receipt Number: </span>
                <strong style={{ color: '#0f172a' }}>{receiptNo}</strong>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: '#64748b' }}>Date of Issue: </span>
                <strong style={{ color: '#0f172a' }}>{todayStr}</strong>
              </div>
            </div>

            {/* 3. Student & Academic Details */}
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
                  {student.courses?.name || student.course_name || 'Standard Curriculum'}
                </div>
              </div>

              <div>
                <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 }}>
                  Batch / Cohort
                </div>
                <div style={{ fontWeight: 600, color: '#334155' }}>
                  {student.batches?.name || student.batch_name || 'Assigned Batch'}
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

            {/* 6. Signature & Verification Footer */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.5fr 1fr',
                gap: '24px',
                paddingTop: '20px',
                borderTop: '1px dashed #cbd5e1',
                fontSize: '11px',
                color: '#64748b',
                alignItems: 'flex-end',
              }}
            >
              <div>
                <p style={{ margin: '0 0 4px 0' }}>
                  &bull; This is an authentic computer-generated tuition fee receipt from SMS — Student Management System.
                </p>
                <p style={{ margin: 0 }}>
                  &bull; Retain this receipt for academic verification and semester examination clearance.
                </p>
              </div>

              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    borderBottom: '1px solid #0f172a',
                    width: '160px',
                    margin: '0 auto 6px auto',
                    height: '32px',
                  }}
                />
                <strong style={{ color: '#0f172a', fontSize: '12px' }}>Authorized Signatory</strong>
                <div style={{ fontSize: '10px' }}>SMS Accounts Department</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
