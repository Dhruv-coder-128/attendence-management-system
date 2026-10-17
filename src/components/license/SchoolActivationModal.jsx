import React, { useState } from 'react';
import { KeyRound, ShieldCheck, AlertCircle, Building2, ExternalLink, Mail, Phone, MessageSquare, CheckCircle2, Database, Copy, Check, ArrowLeft } from 'lucide-react';
import { activateSchoolLicense, configureCustomSchoolDatabase, getContactDeveloperLinks, getStoredLicense, isTauriDesktop } from '../../lib/licenseService';
import { reinitializeSupabaseClient } from '../../lib/supabase';
import { openExternalLink, copyToClipboard } from '../../lib/externalOpener';

export default function SchoolActivationModal({ isOpen, onClose, onActivated, isForced = false }) {
  const currentLicense = getStoredLicense();
  const [activeTab, setActiveTab] = useState('license'); // 'license' | 'customDb'
  const [licenseKey, setLicenseKey] = useState(currentLicense?.licenseKey || '');
  const [isChangingKey, setIsChangingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  
  // Custom Supabase Database fields
  const [schoolName, setSchoolName] = useState(currentLicense?.schoolName || '');
  const [customDbUrl, setCustomDbUrl] = useState(currentLicense?.databaseConfig?.supabaseUrl || '');
  const [customDbAnonKey, setCustomDbAnonKey] = useState(currentLicense?.databaseConfig?.supabaseAnonKey || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [copiedInfo, setCopiedInfo] = useState('');

  const contactLinks = getContactDeveloperLinks();

  if (!isOpen) return null;

  const isAlreadyActive = !isChangingKey && !successData && 
    (currentLicense?.status === 'licensed' || currentLicense?.status === 'trial_active') &&
    (currentLicense?.daysRemaining === undefined || currentLicense?.daysRemaining > 0);

  const handleActivateLicense = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) {
      setError('Please enter a valid school license key.');
      return;
    }

    setLoading(true);
    setError('');

    const res = await activateSchoolLicense(licenseKey.trim());
    setLoading(false);

    if (res.ok) {
      reinitializeSupabaseClient();
      setSuccessData(res.data);
      setIsChangingKey(false);
      if (onActivated) {
        onActivated(res.data);
      }
    } else {
      setError(res.error || 'Activation failed. Please check the license key.');
    }
  };

  const handleConnectCustomDb = (e) => {
    e.preventDefault();
    if (!customDbUrl.trim() || !customDbAnonKey.trim()) {
      setError('Both Supabase URL and Publishable Anon Key are required.');
      return;
    }

    setLoading(true);
    setError('');

    const res = configureCustomSchoolDatabase({
      schoolName: schoolName.trim() || 'Institutional Database',
      supabaseUrl: customDbUrl.trim(),
      supabaseAnonKey: customDbAnonKey.trim(),
      licenseKey: licenseKey.trim(),
    });

    setLoading(false);

    if (res.ok) {
      reinitializeSupabaseClient();
      setSuccessData(res.data);
      setIsChangingKey(false);
      if (onActivated) {
        onActivated(res.data);
      }
    } else {
      setError(res.error || 'Failed to configure custom database.');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(7, 14, 25, 0.75)' }}>
      <div className="modal-dialog" style={{ maxWidth: '540px', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        
        {/* Header */}
        <div style={{ backgroundColor: 'var(--navy-900)', padding: '22px 24px', color: '#ffffff', borderBottom: '1px solid var(--navy-700)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', backgroundColor: 'var(--gold-subtle-bg)', border: '1px solid var(--gold-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={20} color="var(--gold-light)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#ffffff' }}>
                {isAlreadyActive ? 'Active School License' : 'School License & Database Setup'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: 'var(--text-on-navy-muted)' }}>
                SMS — Student Management System
              </p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-on-navy-muted)', lineHeight: 1.5 }}>
            {isAlreadyActive
              ? `Currently connected to ${currentLicense?.schoolName || 'Enrolled School'}. Manage your license or switch keys below.`
              : (isTauriDesktop()
                ? 'Each institution operates on a private, isolated local on-device database. Enter your School License Key to activate.'
                : 'Each client/school operates on an isolated database. Connect using your School License Key or your own dedicated Supabase cloud project.')}
          </p>
        </div>

        {/* Tab Selector — Only shown when setting up or changing key in web mode */}
        {!isAlreadyActive && !successData && !isTauriDesktop() && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-subtle)' }}>
            <button
              type="button"
              onClick={() => { setActiveTab('license'); setError(''); }}
              style={{
                flex: 1,
                padding: '11px',
                fontSize: '13px',
                fontWeight: activeTab === 'license' ? 600 : 500,
                color: activeTab === 'license' ? 'var(--navy-950)' : 'var(--text-muted)',
                backgroundColor: activeTab === 'license' ? '#ffffff' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'license' ? '2px solid var(--gold-primary)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <KeyRound size={14} /> School License Key
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('customDb'); setError(''); }}
              style={{
                flex: 1,
                padding: '11px',
                fontSize: '13px',
                fontWeight: activeTab === 'customDb' ? 600 : 500,
                color: activeTab === 'customDb' ? 'var(--navy-950)' : 'var(--text-muted)',
                backgroundColor: activeTab === 'customDb' ? '#ffffff' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'customDb' ? '2px solid var(--gold-primary)' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <Database size={14} /> Connect School Supabase DB
            </button>
          </div>
        )}

        {/* Body */}
        <div className="modal-body" style={{ padding: '24px', backgroundColor: '#ffffff' }}>
          {isAlreadyActive ? (
            /* Connected & Active View */
            <div style={{ padding: '4px 0' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                    boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.2)'
                  }} />
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>
                      {currentLicense?.status === 'licensed' ? 'Enterprise License Active' : 'Active Evaluation License'}
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: '#047857' }}>
                      Institutional database connected and authenticated
                    </span>
                  </div>
                </div>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: '#d1fae5',
                  color: '#065f46',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  border: '1px solid #6ee7b7'
                }}>
                  🟢 Connected
                </span>
              </div>

              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '14px 16px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Building2 size={18} color="#334155" />
                  <div>
                    <div style={{ fontSize: '10.5px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
                      Licensed School / Institution
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
                      {currentLicense?.schoolName || 'SMS Academy'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Remaining Time</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: (currentLicense?.daysRemaining !== undefined && currentLicense?.daysRemaining <= 5) ? '#dc2626' : '#0f172a', marginTop: '2px' }}>
                      {currentLicense?.status === 'licensed' || (currentLicense?.daysRemaining !== undefined && currentLicense?.daysRemaining >= 9000)
                        ? 'Lifetime / Pro'
                        : `${currentLicense?.daysRemaining ?? 30} Days Remaining`}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '10px' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Database Architecture</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#0f172a', marginTop: '3px' }}>
                      {isTauriDesktop()
                        ? 'Private Local DB'
                        : (currentLicense?.isCustomSchoolDb ? 'Dedicated Supabase' : 'Isolated Cloud DB')}
                    </div>
                  </div>
                </div>

                <div style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px'
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>Active License Key</div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '13px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.5px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {currentLicense?.licenseKey || 'N/A'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (currentLicense?.licenseKey) {
                        await copyToClipboard(currentLicense.licenseKey);
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }
                    }}
                    className="btn btn-outline"
                    style={{ padding: '5px 9px', fontSize: '11px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                    title="Copy License Key"
                  >
                    {copiedKey ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    if (onClose) onClose();
                  }}
                  style={{ width: '100%', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13.5px' }}
                >
                  <CheckCircle2 size={16} />
                  Continue to System
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsChangingKey(true);
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted, #64748b)',
                    fontSize: '12px',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    padding: '4px 0',
                    textAlign: 'center'
                  }}
                >
                  Enter or switch to a different license key
                </button>
              </div>
            </div>
          ) : successData ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'var(--status-present-bg)', border: '2px solid var(--status-present-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
                <CheckCircle2 size={32} color="var(--status-present)" />
              </div>
              <h4 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-900)', margin: '0 0 6px 0' }}>
                Setup &amp; Connection Successful!
              </h4>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
                Connected to <strong>{successData.schoolName}</strong>
              </p>

              <div style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', textAlign: 'left', marginBottom: '20px', fontSize: '12.5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <span style={{ fontWeight: 600, color: 'var(--status-present)' }}>Active Institutional</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Database Instance:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--navy-900)' }}>
                    {successData.isCustomSchoolDb ? 'Dedicated School Supabase Project' : 'Isolated Cloud Database'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSuccessData(null);
                  setIsChangingKey(false);
                  if (onClose) onClose();
                }}
                style={{ width: '100%', padding: '10px 16px' }}
              >
                Launch Student Management System
              </button>
            </div>
          ) : activeTab === 'license' ? (
            <form onSubmit={handleActivateLicense}>
              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'var(--status-absent-bg)', border: '1px solid var(--status-absent-border)', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: 'var(--status-absent)', fontSize: '12.5px' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{error}</div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>School License Key</span>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '11.5px' }}>e.g. SMS-MASTER-2026 or SMS-TRIAL-2026</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={licenseKey}
                    onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                    placeholder="SMS-TRIAL-2026"
                    className="form-input"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      padding: '10px 12px',
                    }}
                    disabled={loading}
                    autoFocus
                  />
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  A unique 30-day evaluation trial begins on first activation.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                {isChangingKey && (currentLicense?.status === 'licensed' || currentLicense?.status === 'trial_active') ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingKey(false);
                      setError('');
                    }}
                    className="btn btn-outline"
                    disabled={loading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : !isForced ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-outline"
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !licenseKey.trim()}
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <ShieldCheck size={16} />
                  {loading ? 'Activating License...' : 'Activate & Connect'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConnectCustomDb}>
              {error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'var(--status-absent-bg)', border: '1px solid var(--status-absent-border)', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: 'var(--status-absent)', fontSize: '12.5px' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>{error}</div>
                </div>
              )}

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '12.5px' }}>
                  School / Institution Name
                </label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Noble High School"
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '12.5px' }}>
                  Supabase Project URL
                </label>
                <input
                  type="url"
                  value={customDbUrl}
                  onChange={(e) => setCustomDbUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '12.5px', fontFamily: 'var(--font-mono)' }}
                  disabled={loading}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label className="form-label" style={{ fontWeight: 600, fontSize: '12.5px' }}>
                  Supabase Publishable / Anon Key
                </label>
                <input
                  type="text"
                  value={customDbAnonKey}
                  onChange={(e) => setCustomDbAnonKey(e.target.value)}
                  placeholder="sb_publishable_... or anon key"
                  className="form-input"
                  style={{ padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                  disabled={loading}
                  required
                />
                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                  Safe client key. All data for this client will be stored exclusively in this Supabase database.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                {isChangingKey && (currentLicense?.status === 'licensed' || currentLicense?.status === 'trial_active') ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingKey(false);
                      setError('');
                    }}
                    className="btn btn-outline"
                    disabled={loading}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                ) : !isForced ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-outline"
                    disabled={loading}
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !customDbUrl.trim() || !customDbAnonKey.trim()}
                  style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  <Database size={16} />
                  {loading ? 'Connecting...' : 'Connect Dedicated Database'}
                </button>
              </div>
            </form>
          )}

          {/* Contact Developer Section */}
          <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Need a License Key or Database Assistance?</span>
              {copiedInfo && (
                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                  ✓ Copied: {copiedInfo}!
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(contactLinks.email);
                  setCopiedInfo('Email');
                  setTimeout(() => setCopiedInfo(''), 2500);
                  openExternalLink(contactLinks.emailLink);
                }}
                className="btn btn-outline"
                style={{ padding: '5px 10px', fontSize: '11.5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Mail size={13} />
                <span>Email Developer</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard('8866039007');
                  setCopiedInfo('WhatsApp Number');
                  setTimeout(() => setCopiedInfo(''), 2500);
                  openExternalLink(contactLinks.whatsappLink);
                }}
                className="btn btn-outline"
                style={{ padding: '5px 10px', fontSize: '11.5px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', borderColor: '#22c55e', color: '#15803d', backgroundColor: '#f0fdf4' }}
              >
                <MessageSquare size={13} />
                <span>WhatsApp (+91 8866039007)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
