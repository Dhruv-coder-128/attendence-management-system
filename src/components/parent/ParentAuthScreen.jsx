import React, { useState, useEffect } from 'react';
import { Smartphone, Hash, ShieldCheck, AlertCircle, Loader2, School, PhoneCall } from 'lucide-react';
import { authenticateParent } from '../../lib/parentPortalService';
import { useAcademySettings } from '../../lib/academySettings';

export default function ParentAuthScreen({ onAuthenticated, initialPhone = '', initialAdm = '' }) {
  const settings = useAcademySettings();
  const [phone, setPhone] = useState(initialPhone || '');
  const [identifier, setIdentifier] = useState(initialAdm || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-authenticate if initialPhone & initialAdm are passed from WhatsApp magic link
  useEffect(() => {
    if (initialPhone && initialAdm) {
      handleAutoLogin(initialPhone, initialAdm);
    }
  }, [initialPhone, initialAdm]);

  const handleAutoLogin = async (p, id) => {
    setLoading(true);
    setError('');
    const res = await authenticateParent(p, id);
    setLoading(false);
    if (res.ok) {
      onAuthenticated(res);
    } else {
      setError(res.error || 'Failed to authenticate via link. Please enter manually.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter your 10-digit registered mobile number.');
      return;
    }

    setLoading(true);
    setError('');

    const res = await authenticateParent(phone.trim(), identifier.trim());
    setLoading(false);

    if (res.ok) {
      onAuthenticated(res);
    } else {
      setError(res.error || 'No matching student found. Please verify details.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px 16px',
      backgroundColor: '#0a1424',
      backgroundImage: 'radial-gradient(ellipse at 50% 20%, rgba(197, 168, 128, 0.15), transparent 70%)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)',
        overflow: 'hidden',
        border: '1px solid rgba(197, 168, 128, 0.3)',
      }}>
        {/* Header with Academy Crest */}
        <div style={{
          backgroundColor: '#070e19',
          padding: '28px 24px 22px',
          textAlign: 'center',
          borderBottom: '1px solid #1f3250',
          position: 'relative',
        }}>
          <div style={{
            width: '68px',
            height: '68px',
            borderRadius: '16px',
            margin: '0 auto 12px auto',
            backgroundColor: '#0f1c32',
            border: '2px solid var(--gold-border, #c5a880)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {settings.logo ? (
              <img
                src={settings.logo}
                alt="Academy Logo"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <School size={32} color="#c5a880" />
            )}
          </div>

          <h2 style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#ffffff',
            margin: '0 0 4px 0',
            fontFamily: 'var(--font-heading, Outfit, sans-serif)',
          }}>
            {settings.schoolName || 'SMS Academy'}
          </h2>
          <p style={{
            fontSize: '12.5px',
            color: '#94a3b8',
            margin: 0,
            letterSpacing: '0.3px',
          }}>
            Parent &amp; Student Portal (PWA)
          </p>
        </div>

        {/* Login Form */}
        <div style={{ padding: '24px' }}>
          <div style={{
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px 14px',
            marginBottom: '18px',
            fontSize: '12px',
            color: '#475569',
            lineHeight: 1.5,
          }}>
            👋 Welcome! Track your child's <strong>daily attendance, test results, fee receipts, and homework</strong> in real-time.
          </div>

          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              color: '#b91c1c',
              fontSize: '12.5px',
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Parent Mobile Number */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                display: 'block',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '6px',
              }}>
                Registered Parent Mobile Number
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  fontSize: '13px',
                  fontWeight: 600,
                }}>
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="98765 43210"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 48px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    fontFamily: 'var(--font-mono, monospace)',
                    letterSpacing: '0.5px',
                  }}
                  disabled={loading}
                  autoFocus
                  required
                />
              </div>
            </div>

            {/* Student Roll or Admission Number */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#1e293b' }}>
                  Student Roll No. or Admission No.
                </label>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>e.g. 101 or ADM-001</span>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
                  placeholder="e.g. 101 or ADM-2026-001"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontFamily: 'var(--font-mono, monospace)',
                    letterSpacing: '0.5px',
                  }}
                  disabled={loading}
                />
              </div>
              <p style={{ margin: '5px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                If you have multiple children in this academy, entering either child's roll number will link all siblings.
              </p>
            </div>

            {/* Login Action Button */}
            <button
              type="submit"
              disabled={loading || phone.length < 10}
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                backgroundColor: '#0a1424',
                color: '#ffffff',
                border: '1px solid var(--gold-border, #c5a880)',
                cursor: loading || phone.length < 10 ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Verifying Details...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={17} color="#c5a880" />
                  <span>Access Student Portal</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Helpline */}
          <div style={{
            marginTop: '22px',
            paddingTop: '16px',
            borderTop: '1px solid #f1f5f9',
            textAlign: 'center',
            fontSize: '11.5px',
            color: '#64748b',
          }}>
            <span>Need assistance? Contact Academy Office:</span>
            <div style={{ marginTop: '4px', fontWeight: 600, color: '#0f172a' }}>
              📞 {settings.phone || '+91 8866039007'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
