import React from 'react';
import { Users, CheckCircle2, ChevronRight, X, GraduationCap } from 'lucide-react';

export default function ParentSiblingSwitcherModal({
  isOpen,
  onClose,
  students = [],
  selectedStudentId,
  onSelectStudent,
}) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(3px)', backgroundColor: 'rgba(7, 14, 25, 0.7)' }}>
      <div className="modal-dialog" style={{ maxWidth: '440px', borderRadius: '14px', overflow: 'hidden' }}>
        
        {/* Modal Header */}
        <div style={{
          backgroundColor: '#070e19',
          padding: '16px 20px',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1f3250',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: 'rgba(197, 168, 128, 0.15)',
              border: '1px solid rgba(197, 168, 128, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Users size={16} color="#c5a880" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                Select Student / Child
              </h3>
              <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                {students.length} Enrolled Siblings Found
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: Sibling List */}
        <div style={{ padding: '16px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {students.map((student) => {
            const isSelected = student.id === selectedStudentId;
            return (
              <div
                key={student.id}
                onClick={() => {
                  onSelectStudent(student.id);
                  onClose();
                }}
                style={{
                  padding: '14px 16px',
                  borderRadius: '10px',
                  backgroundColor: '#ffffff',
                  border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                  boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: isSelected ? '#e0f2fe' : '#f1f5f9',
                    border: isSelected ? '2px solid #38bdf8' : '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                  }}>
                    {student.gender === 'Female' ? '👧' : '👦'}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{student.full_name}</span>
                      {isSelected && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: '#e0f2fe',
                          color: '#0369a1',
                          padding: '2px 6px',
                          borderRadius: '8px',
                        }}>
                          Viewing
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{student.batches?.name || student.courses?.name || 'Enrolled Student'}</span>
                      <span>•</span>
                      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                        Roll: {student.roll_no || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isSelected ? '#0284c7' : '#94a3b8' }}>
                  {isSelected ? <CheckCircle2 size={20} color="#0284c7" /> : <ChevronRight size={18} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#ffffff',
          borderTop: '1px solid #e2e8f0',
          textAlign: 'center',
          fontSize: '11.5px',
          color: '#64748b',
        }}>
          Switching will update the attendance heatmap, fee receipts, and test reports.
        </div>
      </div>
    </div>
  );
}
