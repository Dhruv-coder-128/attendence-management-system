import React, { useState } from 'react';
import { Smartphone, X, Copy, Check, MessageSquare, ExternalLink } from 'lucide-react';
import { buildParentPortalLink } from '../../lib/parentPortalService';
import { copyToClipboard, openExternalLink } from '../../lib/externalOpener';
import ParentPortalPage from '../../pages/ParentPortalPage';

export default function ParentPortalPreviewModal({
  isOpen,
  onClose,
  parent,
  student,
  allStudents = [],
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !student) return null;

  const portalLink = buildParentPortalLink(parent, student);
  const studentList = allStudents.length > 0 ? allStudents : [student];

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello ${parent?.full_name || 'Parent'},\n\nHere is your official mobile link to access *${student.full_name}'s* live Attendance, Fee Receipts, and Test Marksheets on the Parent Portal (PWA):\n\n🔗 ${portalLink}\n\nOpen this link in your phone browser and tap "Add to Home Screen" to install it as an app.`
    );
    const waUrl = `https://wa.me/${(parent?.phone || '').replace(/[^0-9]/g, '')}?text=${text}`;
    openExternalLink(waUrl);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(5px)', backgroundColor: 'rgba(7, 14, 25, 0.85)', padding: '16px' }}>
      <div style={{
        maxWidth: '500px',
        width: '100%',
        backgroundColor: '#070e19',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
        border: '1px solid #1f3250',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '94vh',
      }}>
        {/* Top Control Bar for Admin */}
        <div style={{
          padding: '14px 18px',
          backgroundColor: '#0a1424',
          borderBottom: '1px solid #1f3250',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#ffffff',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Smartphone size={18} color="#c5a880" />
            <div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#ffffff' }}>
                Parent Mobile Portal Preview
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                Viewing as parent of: <strong>{student.full_name}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={async () => {
                await copyToClipboard(portalLink);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="btn btn-outline"
              style={{ padding: '5px 9px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#334155', color: '#cbd5e1' }}
              title="Copy 1-Click Access Link"
            >
              {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="btn btn-outline"
              style={{ padding: '5px 9px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', borderColor: '#22c55e', color: '#16a34a', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
              title="Share via WhatsApp"
            >
              <MessageSquare size={12} />
              <span>WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mobile Device Frame */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: '#0f172a',
          padding: '12px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <div style={{
            width: '100%',
            maxWidth: '414px',
            backgroundColor: '#ffffff',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 0 0 8px #1e293b, 0 15px 35px rgba(0,0,0,0.5)',
            border: '2px solid #334155',
            minHeight: '620px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Phone Speaker Notch */}
            <div style={{
              height: '18px',
              backgroundColor: '#070e19',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: '#334155' }} />
            </div>

            {/* Embedded Live Portal Page */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <ParentPortalPage
                previewMode={true}
                previewStudent={student}
                previewStudents={studentList}
                previewParent={parent || { full_name: `${student.full_name}'s Guardian`, phone: '9876543210' }}
                onClosePreview={onClose}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
