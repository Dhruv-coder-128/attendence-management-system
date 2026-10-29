import React, { useState } from 'react';
import { Lock, Mail, Phone, MessageSquare, ShieldAlert, KeyRound, ArrowRight } from 'lucide-react';
import { getContactDeveloperLinks, getStoredLicense } from '../../lib/licenseService';
import { openExternalLink, copyToClipboard } from '../../lib/externalOpener';
import SchoolActivationModal from './SchoolActivationModal';

export default function TrialExpiredLockout({ onReactivated, licenseStatus }) {
  const [showActivationModal, setShowActivationModal] = useState(false);
  const license = getStoredLicense();
  const contactLinks = getContactDeveloperLinks(licenseStatus?.developerContact || license?.developerContact);

  const isClonedOrMismatch =
    licenseStatus?.status === 'cloned_copy_detected' ||
    licenseStatus?.status === 'hardware_mismatch' ||
    license?.status === 'cloned_copy_detected' ||
    license?.status === 'hardware_mismatch';

  const isSuspendedOrRevoked =
    isClonedOrMismatch ||
    licenseStatus?.status === 'suspended' ||
    licenseStatus?.status === 'revoked' ||
    licenseStatus?.status === 'locked' ||
    license?.status === 'suspended' ||
    license?.status === 'revoked';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 20, 36, 0.96)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-strong)',
          textAlign: 'center',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            backgroundColor: isClonedOrMismatch ? '#831843' : (isSuspendedOrRevoked ? '#7f1d1d' : '#991b1b'),
            color: '#ffffff',
            padding: '28px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            {isClonedOrMismatch ? <ShieldAlert size={32} color="#ffffff" /> : <Lock size={32} color="#ffffff" />}
          </div>
          <h2
            style={{
              margin: '0 0 6px 0',
              fontSize: '22px',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color: '#ffffff',
            }}
          >
            {isClonedOrMismatch
              ? 'Unauthorized Workstation Copy Detected'
              : (isSuspendedOrRevoked ? 'Access Suspended by Developer' : 'Evaluation Trial Concluded')}
          </h2>
          <span style={{ fontSize: '13px', color: '#fecaca', letterSpacing: '0.3px' }}>
            {license?.schoolName ? `${license.schoolName} — ` : ''}SMS Student Management System
          </span>
        </div>

        {/* Content Body */}
        <div style={{ padding: '28px 24px' }}>
          <div
            style={{
              backgroundColor: isClonedOrMismatch ? '#fdf2f8' : '#fef2f2',
              border: `1px solid ${isClonedOrMismatch ? '#fbcfe8' : '#fecaca'}`,
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '14.5px',
                fontWeight: 600,
                color: isClonedOrMismatch ? '#9d174d' : '#991b1b',
                lineHeight: 1.5,
              }}
            >
              {isClonedOrMismatch
                ? 'SECURITY LOCKOUT: This software installation was cloned or copied from another computer. The license is strictly bound to the original authorized workstation. contact support for license transfer.'
                : (isSuspendedOrRevoked
                  ? 'This school installation has been locked by the developer. Contact developer to resolve.'
                  : 'Your trial period has ended. Contact the developer to activate SMS.')}
            </p>
          </div>

          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <strong>Data Preservation Guarantee:</strong> All your school records, students, fee records, attendance registers, and exam marks remain securely preserved in your dedicated Supabase database. Entering an active license key will instantly unlock the system.
          </p>

          {/* Configurable Contact Developer Actions */}
          <div
            style={{
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '12px',
              }}
            >
              Authorized Developer Contact
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  copyToClipboard(contactLinks.email);
                  openExternalLink(contactLinks.emailLink);
                }}
                className="btn btn-outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Mail size={16} color="var(--navy-700)" />
                  <span>Email Developer: <strong>{contactLinks.email}</strong></span>
                </div>
                <ArrowRight size={14} color="var(--text-muted)" />
              </button>

              {contactLinks.whatsappLink && (
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard((supportContact?.phone||'').replace(/[^0-9]/g,''));
                    openExternalLink(contactLinks.whatsappLink);
                  }}
                  className="btn btn-outline"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderColor: '#22c55e',
                    backgroundColor: '#f0fdf4',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#15803d' }}>
                    <MessageSquare size={16} />
                    <span>WhatsApp Developer Support (+91 8866039007)</span>
                  </div>
                  <ArrowRight size={14} color="#15803d" />
                </button>
              )}

              {contactLinks.phoneLink && (
                <button
                  type="button"
                  onClick={() => {
                    copyToClipboard((supportContact?.phone||'').replace(/[^0-9]/g,''));
                    openExternalLink(contactLinks.phoneLink);
                  }}
                  className="btn btn-outline"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Phone size={16} color="var(--navy-700)" />
                    <span>Phone: {contactLinks.phone}</span>
                  </div>
                  <ArrowRight size={14} color="var(--text-muted)" />
                </button>
              )}
            </div>
          </div>

          {/* Enter Renewal / Full License Key */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowActivationModal(true)}
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <KeyRound size={17} />
            <span>Enter Renewal or Full License Key</span>
          </button>
        </div>

        {/* Modal for Entering Key */}
        <SchoolActivationModal
          isOpen={showActivationModal}
          onClose={() => setShowActivationModal(false)}
          onActivated={(data) => {
            setShowActivationModal(false);
            if (onReactivated) onReactivated(data);
          }}
          isForced={false}
        />
      </div>
    </div>
  );
}
