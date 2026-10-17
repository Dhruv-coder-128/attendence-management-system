import React, { useState, useEffect } from 'react';
import {
  Shield,
  Database,
  Bot,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Link,
  Trash2,
  Send,
  KeyRound,
  Download,
  Upload,
  HardDrive,
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import UsersManagement from '../components/settings/UsersManagement';
import MessageCenter from '../components/settings/MessageCenter';
import { isSupabaseConfigured, checkSupabaseConnection, supabaseConfig } from '../lib/supabase';
import { getStoredLicense, isTauriDesktop } from '../lib/licenseService';
import {
  getTelegramBotStatus,
  setupTelegramWebhook,
  TELEGRAM_BOT_USERNAME,
  getSchoolTelegramSettings,
  saveSchoolTelegramSettings,
  testTelegramBotConnection,
} from '../lib/telegramClient';
import {
  getStorageMode,
  setStorageMode,
  exportDatabaseBackup,
  importDatabaseBackup,
} from '../lib/databaseAdapter';
import {
  fetchAcademySettings,
  updateAcademySettings,
  DEFAULT_ACADEMY_SETTINGS,
} from '../lib/academySettings';

/**
 * System Settings, Cloud Integration Status & Staff Access Page
 */
export default function SettingsPage({ currentUserProfile, onOpenLicenseModal, onNavigate }) {
  const storedLicense = getStoredLicense();
  const [instituteName, setInstituteName] = useState(DEFAULT_ACADEMY_SETTINGS.academy_name);
  const [campusName, setCampusName] = useState(DEFAULT_ACADEMY_SETTINGS.branch_name);
  const [address, setAddress] = useState(DEFAULT_ACADEMY_SETTINGS.address);
  const [phone, setPhone] = useState(DEFAULT_ACADEMY_SETTINGS.phone);
  const [email, setEmail] = useState(DEFAULT_ACADEMY_SETTINGS.email);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_ACADEMY_SETTINGS.logo_url);
  const [tagline, setTagline] = useState(DEFAULT_ACADEMY_SETTINGS.tagline);
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMY_SETTINGS.academic_year);
  const [minAttendanceThreshold, setMinAttendanceThreshold] = useState(DEFAULT_ACADEMY_SETTINGS.min_attendance_threshold);
  const [lateGracePeriod, setLateGracePeriod] = useState(DEFAULT_ACADEMY_SETTINGS.late_grace_minutes);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Per-School Custom Telegram Bot State
  const schoolBotConfig = getSchoolTelegramSettings();
  const [customBotUsername, setCustomBotUsername] = useState(schoolBotConfig.botUsername || '');
  const [customBotToken, setCustomBotToken] = useState(schoolBotConfig.botToken || '');
  const [botTestResult, setBotTestResult] = useState(null);
  const [testingBot, setTestingBot] = useState(false);
  const [botNotice, setBotNotice] = useState('');

  // Storage Engine & Backup State
  const [activeStorageMode, setActiveStorageMode] = useState(getStorageMode());
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupNotice, setBackupNotice] = useState('');

  // Supabase Connection Diagnostics State
  const [connectionState, setConnectionState] = useState({
    loading: false,
    tested: false,
    ok: false,
    url: '',
    latencyMs: 0,
    error: null,
    statusText: '',
  });

  const runConnectionTest = async () => {
    setConnectionState((prev) => ({ ...prev, loading: true }));
    const result = await checkSupabaseConnection();
    setConnectionState({
      loading: false,
      tested: true,
      ok: result.ok,
      url: result.url,
      latencyMs: result.latencyMs,
      error: result.error,
      statusText: result.statusText,
    });
  };

  // Telegram Bot Gateway Diagnostics & Webhook Manager State
  const [telegramStatus, setTelegramStatus] = useState({
    loading: false,
    checked: false,
    data: null,
    error: null,
  });
  const [webhookUrlInput, setWebhookUrlInput] = useState(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/api/telegram-webhook`;
    }
    return '';
  });
  const [webhookNotice, setWebhookNotice] = useState(null);
  const [isConfiguringWebhook, setIsConfiguringWebhook] = useState(false);

  const fetchTelegramStatus = async () => {
    setTelegramStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await getTelegramBotStatus();
      if (res.ok || (res.configured && res.valid)) {
        setTelegramStatus({
          loading: false,
          checked: true,
          data: res,
          error: null,
        });
        if (res.webhook?.url) {
          setWebhookUrlInput(res.webhook.url);
        }
      } else {
        setTelegramStatus({
          loading: false,
          checked: true,
          data: null,
          error: res.error || 'Failed to connect to Telegram Bot API.',
        });
      }
    } catch (err) {
      setTelegramStatus({
        loading: false,
        checked: true,
        data: null,
        error: err.message || 'Network error communicating with Telegram status endpoint.',
      });
    }
  };

  const handleSetWebhook = async (action = 'set') => {
    if (action === 'set' && !webhookUrlInput.trim()) {
      alert('Please enter a valid HTTPS webhook URL.');
      return;
    }
    setIsConfiguringWebhook(true);
    setWebhookNotice(null);
    try {
      const res = await setupTelegramWebhook(webhookUrlInput.trim(), action);
      if (res.ok) {
        setWebhookNotice({
          type: 'success',
          message: action === 'set' ? 'Webhook URL registered successfully on Telegram!' : 'Webhook URL cleared (switched to polling mode).',
        });
        await fetchTelegramStatus();
      } else {
        setWebhookNotice({
          type: 'error',
          message: res.error || 'Failed to update webhook configuration.',
        });
      }
    } catch (err) {
      setWebhookNotice({
        type: 'error',
        message: err.message || 'Error updating webhook configuration.',
      });
    } finally {
      setIsConfiguringWebhook(false);
    }
  };

  useEffect(() => {
    runConnectionTest();
    fetchTelegramStatus();
    // Load Academy Branding from Supabase
    fetchAcademySettings().then((s) => {
      if (s) {
        setInstituteName(s.academy_name || DEFAULT_ACADEMY_SETTINGS.academy_name);
        setCampusName(s.branch_name || DEFAULT_ACADEMY_SETTINGS.branch_name);
        setAddress(s.address || DEFAULT_ACADEMY_SETTINGS.address);
        setPhone(s.phone || DEFAULT_ACADEMY_SETTINGS.phone);
        setEmail(s.email || DEFAULT_ACADEMY_SETTINGS.email);
        setLogoUrl(s.logo_url || '');
        setTagline(s.tagline || DEFAULT_ACADEMY_SETTINGS.tagline);
        setAcademicYear(s.academic_year || DEFAULT_ACADEMY_SETTINGS.academic_year);
        setMinAttendanceThreshold(s.min_attendance_threshold ?? DEFAULT_ACADEMY_SETTINGS.min_attendance_threshold);
        setLateGracePeriod(s.late_grace_minutes ?? DEFAULT_ACADEMY_SETTINGS.late_grace_minutes);
      }
    });
  }, []);

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo image should be under 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      setLogoUrl(uploadEvent.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setIsSaving(true);
    try {
      await updateAcademySettings({
        academy_name: instituteName,
        branch_name: campusName,
        address,
        phone,
        email,
        logo_url: logoUrl,
        tagline,
        academic_year: academicYear,
        min_attendance_threshold: Number(minAttendanceThreshold),
        late_grace_minutes: Number(lateGracePeriod),
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestCustomBot = async () => {
    if (!customBotToken.trim()) {
      setBotNotice({ type: 'error', message: 'Please enter a Telegram Bot Token to test.' });
      return;
    }
    setTestingBot(true);
    setBotNotice('');
    setBotTestResult(null);

    const res = await testTelegramBotConnection(customBotToken);
    setTestingBot(false);
    if (res.ok) {
      setBotTestResult(res);
      setCustomBotUsername(res.username);
      setBotNotice({ type: 'success', message: `Verified! Connected to @${res.username} (${res.botName}) successfully.` });
    } else {
      setBotNotice({ type: 'error', message: res.error || 'Failed to connect to Telegram bot.' });
    }
  };

  const handleSaveCustomBot = () => {
    saveSchoolTelegramSettings({
      botUsername: customBotUsername,
      botToken: customBotToken,
      botName: botTestResult?.botName || '',
    });
    setBotNotice({ type: 'success', message: 'School Telegram Bot configuration saved successfully!' });
    setTimeout(() => setBotNotice(''), 4000);
  };

  const handleExportBackup = async () => {
    setBackupExporting(true);
    try {
      const res = await exportDatabaseBackup();
      setBackupNotice({ type: 'success', message: `Universal backup exported successfully: ${res.filename} (100% tables, broadcasts & settings)` });
    } catch (err) {
      setBackupNotice({ type: 'error', message: 'Failed to export database backup: ' + err.message });
    } finally {
      setBackupExporting(false);
      setTimeout(() => setBackupNotice(''), 5000);
    }
  };

  const handleRestoreBackupFile = async (e) => {
    const backupFile = e.target.files?.[0];
    if (!backupFile) return;
    try {
      const text = await backupFile.text();
      const res = await importDatabaseBackup(text);
      if (res.ok) {
        setBackupNotice({
          type: 'success',
          message: `Universal database & settings restored successfully (${Object.keys(res.summary?.tables || {}).length} tables, ${res.summary?.settingsCount || 0} configurations)! Reloading...`,
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setBackupNotice({ type: 'error', message: 'Restore failed: ' + res.error });
      }
    } catch (err) {
      setBackupNotice({ type: 'error', message: 'Failed to read backup file: ' + err.message });
    }
  };

  const handleToggleStorageMode = (newMode) => {
    setStorageMode(newMode);
    setActiveStorageMode(newMode);
    setBackupNotice({ type: 'success', message: `Switched storage engine to ${newMode === 'offline' ? 'Offline Local DB' : 'Cloud Supabase'}. Reloading...` });
    setTimeout(() => window.location.reload(), 1200);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Institution &amp; ERP System Settings</h1>
          <p className="page-description">
            Academic Policies, Supabase PostgreSQL Connection Diagnostics &amp; Cloud Gateway
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={runConnectionTest}
            disabled={connectionState.loading}
          >
            {connectionState.loading ? 'Checking...' : 'Re-test Supabase'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Save}
            onClick={handleSaveSettings}
          >
            Save Configuration
          </Button>
        </div>
      </div>

      {savedNotice && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '6px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>System configuration preferences saved successfully.</span>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '24px',
        }}
      >
        {/* Left Column: Institute Profile & Attendance Policy */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--navy-950)',
                marginBottom: '4px',
              }}
            >
              Institution Profile
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Official details displayed on roll sheets and guardian notification broadcasts
            </p>

            <Input
              label="Academy Name"
              value={instituteName}
              onChange={(e) => setInstituteName(e.target.value)}
              placeholder="e.g. SMS Academy"
            />

            <Input
              label="Campus / Branch Name"
              value={campusName}
              onChange={(e) => setCampusName(e.target.value)}
              placeholder="e.g. Central Campus — Main Wing"
            />

            <Input
              label="Official Street Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 123 Education Hub, MG Road, Mumbai"
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                label="Official Contact Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
              <Input
                label="Official Contact Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@institution.edu"
              />
            </div>

            <Input
              label="Official Tagline / Motto"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Excellence in Higher Secondary & College Education"
            />

            <Input
              label="Active Academic Year / Term"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />

            {/* Logo Customization */}
            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--navy-900)',
                  marginBottom: '6px',
                }}
              >
                Official Academy Logo (Printed on receipts &amp; report cards)
              </label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                {logoUrl ? (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#ffffff',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={logoUrl}
                      alt="Academy Logo"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#f8fafc',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                    }}
                  >
                    No Logo
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    style={{ fontSize: '12px' }}
                  />
                  {logoUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setLogoUrl('')}
                      style={{ width: 'fit-content', color: 'var(--status-absent)' }}
                    >
                      Remove Logo
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="erp-card" style={{ padding: '20px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--navy-950)',
                marginBottom: '4px',
              }}
            >
              Attendance &amp; Roll Call Policies
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Thresholds for triggering automated parent Telegram notices and academic flags
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Input
                label="Minimum Attendance Threshold (%)"
                type="number"
                value={minAttendanceThreshold}
                onChange={(e) => setMinAttendanceThreshold(e.target.value)}
                helperText="Students below this are highlighted"
              />
              <Input
                label="Late Arrival Grace (Minutes)"
                type="number"
                value={lateGracePeriod}
                onChange={(e) => setLateGracePeriod(e.target.value)}
                helperText="After which student is marked Late"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Database Storage Engine & Diagnostics */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={18} color="var(--navy-800)" />
                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--navy-950)',
                  }}
                >
                  {isTauriDesktop() ? 'Institution Database & Storage Engine' : 'Supabase & PostgreSQL Database'}
                </h2>
              </div>

              {!isTauriDesktop() && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  onClick={runConnectionTest}
                  disabled={connectionState.loading}
                >
                  {connectionState.loading ? 'Testing...' : 'Test Connection'}
                </Button>
              )}
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              {isTauriDesktop()
                ? '100% Offline On-Device Storage — Private, High-Performance & Secure (Zero Cloud Dependency)'
                : 'Dual-Mode Engine: 100% Offline Local On-Device Storage or Dedicated Cloud Supabase'}
            </p>

            {/* Storage Engine Status & Backup Hub */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)' }}>
                  Active Storage Engine:
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: (isTauriDesktop() || activeStorageMode === 'offline') ? '#f0fdf4' : '#eff6ff',
                    color: (isTauriDesktop() || activeStorageMode === 'offline') ? '#166534' : '#1e40af',
                    border: `1px solid ${(isTauriDesktop() || activeStorageMode === 'offline') ? '#bbf7d0' : '#bfdbfe'}`,
                  }}
                >
                  {isTauriDesktop() || activeStorageMode === 'offline' ? '100% Offline On-Device (SQLite / IndexedDB)' : 'Cloud PostgreSQL'}
                </span>
              </div>

              {!isTauriDesktop() && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                  <button
                    type="button"
                    onClick={() => handleToggleStorageMode('offline')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: `2px solid ${activeStorageMode === 'offline' ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: activeStorageMode === 'offline' ? '#ffffff' : 'transparent',
                      color: 'var(--navy-950)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      justifyContent: 'center',
                    }}
                  >
                    <HardDrive size={15} color={activeStorageMode === 'offline' ? 'var(--gold-dark)' : 'var(--text-muted)'} />
                    <span>Offline Local Engine</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleStorageMode('cloud')}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: `2px solid ${activeStorageMode === 'cloud' ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: activeStorageMode === 'cloud' ? '#ffffff' : 'transparent',
                      color: 'var(--navy-950)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      justifyContent: 'center',
                    }}
                  >
                    <Cloud size={15} color={activeStorageMode === 'cloud' ? 'var(--gold-dark)' : 'var(--text-muted)'} />
                    <span>Cloud Supabase DB</span>
                  </button>
                </div>
              )}

              {/* 1-Click Backup & Restore */}
              <div style={{ paddingTop: '10px', borderTop: isTauriDesktop() ? 'none' : '1px solid var(--border-subtle)', display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download}
                  onClick={handleExportBackup}
                  disabled={backupExporting}
                  style={{ flex: 1, fontSize: '11.5px', backgroundColor: '#ffffff' }}
                >
                  {backupExporting ? 'Exporting...' : 'Export Backup (.smsdb)'}
                </Button>

                <label
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: '#ffffff',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: 'var(--navy-900)',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={14} />
                  <span>Restore Backup</span>
                  <input
                    type="file"
                    accept=".smsdb,.json"
                    onChange={handleRestoreBackupFile}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {backupNotice && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: backupNotice.type === 'success' ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                    color: backupNotice.type === 'success' ? 'var(--status-present)' : 'var(--status-absent)',
                    fontSize: '11.5px',
                    fontWeight: 600,
                  }}
                >
                  {backupNotice.message}
                </div>
              )}
            </div>

            {/* Live Connection Status Banner — Only shown in web cloud mode */}
            {!isTauriDesktop() && (
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '6px',
                  backgroundColor: connectionState.ok
                    ? 'var(--status-present-bg)'
                    : isSupabaseConfigured
                    ? 'var(--status-absent-bg)'
                    : '#f8fafc',
                  border: `1px solid ${
                    connectionState.ok
                      ? 'var(--status-present-border)'
                      : isSupabaseConfigured
                      ? 'var(--status-absent-border)'
                      : 'var(--border-subtle)'
                  }`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  marginBottom: '14px',
                }}
              >
                {connectionState.ok ? (
                  <CheckCircle2 size={20} color="var(--status-present)" style={{ marginTop: '2px', flexShrink: 0 }} />
                ) : (
                  <AlertCircle
                    size={20}
                    color={isSupabaseConfigured ? 'var(--status-absent)' : 'var(--gold-dark)'}
                    style={{ marginTop: '2px', flexShrink: 0 }}
                  />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong
                      style={{
                        color: connectionState.ok
                          ? 'var(--status-present)'
                          : isSupabaseConfigured
                          ? 'var(--status-absent)'
                          : 'var(--navy-950)',
                        fontSize: '13px',
                      }}
                    >
                      {connectionState.ok
                        ? 'Supabase Connection Active'
                        : isSupabaseConfigured
                        ? 'Connection Failed'
                        : 'Configuration Missing'}
                    </strong>

                    {connectionState.latencyMs > 0 && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          backgroundColor: '#ffffff',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {connectionState.latencyMs}ms
                      </span>
                    )}
                  </div>

                  {connectionState.ok ? (
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '3px' }}>
                      Successfully verified connection to endpoint: <code>{connectionState.url}</code>
                    </div>
                  ) : (
                    <div
                      style={{
                        fontSize: '12px',
                        color: isSupabaseConfigured ? 'var(--status-absent)' : 'var(--text-secondary)',
                        marginTop: '3px',
                      }}
                    >
                      {connectionState.error || 'Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Technical Parameters Box */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                padding: '12px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>School / Tenant:</span>
                <span style={{ fontWeight: 600, color: 'var(--navy-900)' }}>
                  {storedLicense?.schoolName || supabaseConfig.schoolName || 'Primary Institution'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>License Mode:</span>
                <span style={{ fontWeight: 600, color: storedLicense?.status === 'trial_active' ? 'var(--gold-dark)' : 'var(--status-present)' }}>
                  {storedLicense?.status === 'trial_active'
                    ? `30-Day Trial (${storedLicense.daysRemaining ?? 30} Days Left)`
                    : (storedLicense?.status || 'Active Institutional')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Database Isolation:</span>
                <span style={{ color: isTauriDesktop() ? '#15803d' : (supabaseConfig.isCustomSchoolDb ? '#15803d' : 'var(--navy-700)'), fontWeight: 600 }}>
                  {isTauriDesktop() ? '100% Isolated Local On-Device Database' : (supabaseConfig.isCustomSchoolDb ? 'Dedicated School Supabase DB' : 'Default Project Instance (.env.local)')}
                </span>
              </div>
              {isTauriDesktop() ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Engine Architecture:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#166534' }}>
                      SQLite / IndexedDB Local Storage
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Data Privacy:</span>
                    <span style={{ color: 'var(--navy-900)', fontWeight: 600 }}>
                      Client Private Machine (No Cloud Leakage)
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Configured URL:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {supabaseConfig.url || '(None)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Publishable Key Status:</span>
                    <span style={{ color: isSupabaseConfigured ? 'var(--status-present)' : 'var(--status-absent)', fontWeight: 600 }}>
                      {isSupabaseConfigured ? 'Valid Client Key Loaded' : 'Missing in .env.local'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Security Scope:</span>
                    <span style={{ color: 'var(--navy-900)', fontWeight: 500 }}>
                      Client Publishable Key Only (Zero Secret Exposure)
                    </span>
                  </div>
                </>
              )}
              {!isTauriDesktop() && onOpenLicenseModal && (
                <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenLicenseModal}
                    icon={KeyRound}
                  >
                    Switch School License / Connect Database
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="erp-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={20} />
              </div>
              <div>
                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--navy-950)',
                    margin: 0,
                  }}
                >
                  Telegram Bot Settings
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Enter your school Telegram bot details to dispatch automated parent attendance alerts.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
              <Input
                label="Telegram Bot Username"
                value={customBotUsername}
                onChange={(e) => setCustomBotUsername(e.target.value)}
                placeholder="e.g. SMSAttendanceBot"
              />

              <Input
                label="Telegram Bot API Token"
                type="password"
                value={customBotToken}
                onChange={(e) => setCustomBotToken(e.target.value)}
                placeholder="e.g. 7123456789:AAHk3xyz-ABC_123456789"
              />
            </div>

            {botNotice && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: botNotice.type === 'success' ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                  border: `1px solid ${botNotice.type === 'success' ? 'var(--status-present-border)' : 'var(--status-absent-border)'}`,
                  color: botNotice.type === 'success' ? 'var(--status-present)' : 'var(--status-absent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {botNotice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{botNotice.message}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={handleTestCustomBot}
                disabled={testingBot || !customBotToken}
              >
                {testingBot ? 'Testing...' : 'Test Bot Connection'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Save}
                onClick={handleSaveCustomBot}
              >
                Save Settings
              </Button>
            </div>

            {/* Telegram Webhook & Desktop Polling Gateway Controls */}
            <div
              style={{
                marginTop: '20px',
                paddingTop: '16px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  Bot Gateway &amp; Webhook Diagnostics
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: telegramStatus.webhook?.url ? 'var(--status-absent-bg)' : 'var(--status-present-bg)',
                    color: telegramStatus.webhook?.url ? 'var(--status-absent)' : 'var(--status-present)',
                  }}
                >
                  {telegramStatus.webhook?.url ? 'Webhook Mode (Cloud)' : '🟢 Direct Polling Mode (Desktop / Local)'}
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                {telegramStatus.webhook?.url
                  ? `Active Webhook: ${telegramStatus.webhook.url}. (Note: Polling is blocked when a webhook is active. Switch to Direct Polling for desktop use.)`
                  : 'Desktop app is in Direct Polling mode. Telegram /start tokens and confirmations are received directly.'}
              </p>

              {webhookNotice && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: webhookNotice.type === 'success' ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                    border: `1px solid ${webhookNotice.type === 'success' ? 'var(--status-present-border)' : 'var(--status-absent-border)'}`,
                    color: webhookNotice.type === 'success' ? 'var(--status-present)' : 'var(--status-absent)',
                    fontSize: '11px',
                    fontWeight: 600,
                    marginBottom: '10px',
                  }}
                >
                  {webhookNotice.message}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="gold"
                  size="sm"
                  onClick={() => handleSetWebhook('delete')}
                  disabled={isConfiguringWebhook}
                  title="Clear any registered Telegram webhook and switch to desktop polling"
                >
                  {isConfiguringWebhook ? 'Clearing...' : 'Clear Webhook (Enable Desktop Polling)'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  onClick={fetchTelegramStatus}
                  disabled={telegramStatus.loading}
                >
                  {telegramStatus.loading ? 'Checking...' : 'Refresh Gateway Status'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Center & Notification Templates Configurator */}
      <MessageCenter />

      {/* Staff & Role-Based Access Control Section */}
      <UsersManagement currentUserProfile={currentUserProfile} />

      {/* SaaS Multi-School Admin & Cloud Master Portal Section (Vercel Web Only) */}
      {!isTauriDesktop() && onNavigate && (
        <div
          className="card"
          style={{
            marginTop: '24px',
            border: '1px solid #bfdbfe',
            background: 'linear-gradient(135deg, #ffffff 0%, #f0f9ff 100%)',
            padding: '24px',
            borderRadius: '12px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  backgroundColor: '#e0f2fe',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0284c7',
                }}
              >
                <Shield size={24} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                    SaaS Multi-School Admin &amp; Cloud Master Portal
                  </h3>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: '#dbeafe',
                      color: '#1d4ed8',
                    }}
                  >
                    Cloud Master
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                  Manage multiple school tenants, provision new institutional branches, audit database sync, and monitor global metrics.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              icon={ExternalLink}
              onClick={() => onNavigate('master-portal')}
            >
              Open SaaS Console
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
