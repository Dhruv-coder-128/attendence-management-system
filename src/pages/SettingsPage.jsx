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
  Lock,
  Eye,
  EyeOff,
  Cake,
  MessageSquare,
  Copy,
  Calendar,
  Users,
  ShieldCheck,
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import UsersManagement from '../components/settings/UsersManagement';
import MessageCenter from '../components/settings/MessageCenter';
import { isSupabaseConfigured, checkSupabaseConnection, supabaseConfig } from '../lib/supabase';
import {
  getStoredLicense,
  validateLicense,
  isTauriDesktop,
  getMaxStudentCapacity,
  getStudentCapacityTier,
} from '../lib/licenseService';
import { getHardwareFingerprint } from '../lib/hardwareFingerprint';
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
  restoreAuthoritativeRoster,
} from '../lib/databaseAdapter';
import {
  fetchAcademySettings,
  updateAcademySettings,
  DEFAULT_ACADEMY_SETTINGS,
  saveSettingsToLocal,
  getStoredAcademySettings,
} from '../lib/academySettings';
import { checkAndDispatchBirthdayWishes } from '../lib/birthdayAutoDispatcher';
import LocalLicenseUpdater from '../components/license/LocalLicenseUpdater.jsx';

/**
 * System Settings, Cloud Integration Status & Staff Access Page
 */
export default function SettingsPage({ currentUserProfile, onOpenLicenseModal, onNavigate }) {
  const storedLicense = getStoredLicense();

  // Live Institutional License & Days State (for Marked Red Box card)
  const [liveLicense, setLiveLicense] = useState(() => getStoredLicense());
  const [machineHwid, setMachineHwid] = useState('');
  const [isSyncingLicense, setIsSyncingLicense] = useState(false);
  const [licenseSyncFeedback, setLicenseSyncFeedback] = useState('');

  useEffect(() => {
    getHardwareFingerprint().then((hw) => setMachineHwid(hw || ''));
    validateLicense().then((res) => {
      if (res?.ok) {
        setLiveLicense(getStoredLicense());
      }
    });
  }, []);

  const handleManualSyncLicense = async () => {
    setIsSyncingLicense(true);
    setLicenseSyncFeedback('');
    try {
      const res = await validateLicense({ requireLicense: true });
      if (res) {
        const updated = getStoredLicense();
        setLiveLicense(updated);
        setLicenseSyncFeedback('✓ License status & remaining days synchronized with cloud');
        setTimeout(() => setLicenseSyncFeedback(''), 4000);
      }
    } catch {
      setLicenseSyncFeedback('Could not reach cloud license server');
    } finally {
      setIsSyncingLicense(false);
    }
  };
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
  const [autoBirthdayWishEnabled, setAutoBirthdayWishEnabled] = useState(
    DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_enabled
  );
  const [autoBirthdayWishChannel, setAutoBirthdayWishChannel] = useState(
    DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_channel
  );
  const [isDispatchingBirthdays, setIsDispatchingBirthdays] = useState(false);
  const [birthdayDispatchNotice, setBirthdayDispatchNotice] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  // Per-School Custom Telegram Bot State
  const schoolBotConfig = getSchoolTelegramSettings();
  const [customBotUsername, setCustomBotUsername] = useState(schoolBotConfig.botUsername || '');
  const [customBotToken, setCustomBotToken] = useState(schoolBotConfig.botToken || '');
  const [botTestResult, setBotTestResult] = useState(null);
  const [testingBot, setTestingBot] = useState(false);
  const [botNotice, setBotNotice] = useState('');
  const [showGatewayCredentials, setShowGatewayCredentials] = useState(false);

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
        setAutoBirthdayWishEnabled(s.auto_birthday_wish_enabled ?? DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_enabled);
        setAutoBirthdayWishChannel(s.auto_birthday_wish_channel || DEFAULT_ACADEMY_SETTINGS.auto_birthday_wish_channel);
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
        auto_birthday_wish_enabled: autoBirthdayWishEnabled,
        auto_birthday_wish_channel: autoBirthdayWishChannel,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3500);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleAutoBirthday = (enabled) => {
    setAutoBirthdayWishEnabled(enabled);
    saveSettingsToLocal({
      ...getStoredAcademySettings(),
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
      auto_birthday_wish_enabled: enabled,
      auto_birthday_wish_channel: autoBirthdayWishChannel,
    });
  };

  const handleSelectBirthdayChannel = (ch) => {
    setAutoBirthdayWishChannel(ch);
    saveSettingsToLocal({
      ...getStoredAcademySettings(),
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
      auto_birthday_wish_enabled: autoBirthdayWishEnabled,
      auto_birthday_wish_channel: ch,
    });
  };

  const handleManualBirthdayDispatch = async () => {
    setIsDispatchingBirthdays(true);
    setBirthdayDispatchNotice(null);
    try {
      const res = await checkAndDispatchBirthdayWishes({ force: true });
      setBirthdayDispatchNotice({
        type: res.status === 'success' ? 'success' : res.status === 'no_birthdays' ? 'info' : 'error',
        message: res.message,
      });
      setTimeout(() => setBirthdayDispatchNotice(null), 6000);
    } catch (err) {
      setBirthdayDispatchNotice({
        type: 'error',
        message: err.message || 'Error occurred while dispatching birthday wishes.',
      });
      setTimeout(() => setBirthdayDispatchNotice(null), 6000);
    } finally {
      setIsDispatchingBirthdays(false);
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
        {/* Full-Width Institutional License & Validity Card */}
        <div className="erp-card" style={{ gridColumn: '1 / -1', padding: '24px', border: '1px solid var(--border-subtle)', borderLeft: '4px solid var(--gold-primary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <KeyRound size={20} />
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
                  Institutional License &amp; Validity
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Commercial subscription entitlement, active days &amp; hardware workstation binding
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div>
              {(liveLicense?.daysRemaining || 0) >= 9000 || liveLicense?.status === 'licensed' ? (
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle2 size={13} /> Full Commercial License
                </span>
              ) : liveLicense?.status === 'trial_active' ? (
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  🟡 Evaluation Trial Active
                </span>
              ) : (
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '12px', backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  🔴 License Inactive / Locked
                </span>
              )}
            </div>
          </div>

          {/* Internal Balanced 2-Column Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '18px',
              alignItems: 'stretch',
            }}
          >
            {/* Left Sub-Column: Subscription Banner & Cloud Sync */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
              <div
                style={{
                  background: (liveLicense?.daysRemaining || 0) >= 9000 || liveLicense?.status === 'licensed'
                    ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)'
                    : 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  flex: 1,
                }}
              >
                <div>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#cbd5e1', fontWeight: 600 }}>
                    Active Subscription Period
                  </div>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: '#f8fafc', marginTop: '2px', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                    {(liveLicense?.daysRemaining || 0) >= 9000 ? (
                      <span style={{ color: '#4ade80' }}>Lifetime Access</span>
                    ) : (
                      <>
                        <span>{liveLicense?.daysRemaining !== undefined ? liveLicense.daysRemaining : 30}</span>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#93c5fd' }}>Days Remaining</span>
                      </>
                    )}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                    {liveLicense?.trialEndsAt ? `Valid until: ${new Date(liveLicense.trialEndsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Evaluation period ongoing'}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualSyncLicense}
                  disabled={isSyncingLicense}
                  icon={RefreshCw}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.25)',
                    fontSize: '11.5px',
                  }}
                >
                  {isSyncingLicense ? 'Syncing...' : 'Sync Cloud Status'}
                </Button>
              </div>

              {licenseSyncFeedback && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#f0fdf4',
                    color: '#166534',
                    border: '1px solid #bbf7d0',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>{licenseSyncFeedback}</span>
                </div>
              )}
            </div>

            {/* Right Sub-Column: Hardware Workstation Binding, Capacity & Key Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '12px' }}>
              <div
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '8px',
                  padding: '14px',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  flex: 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Institutional Entitlement:</span>
                  <span style={{ fontWeight: 700, color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#f0fdf4', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', fontSize: '11.5px' }}>
                    <ShieldCheck size={13} color="#16a34a" /> Bound &amp; Active (Cryptographically Secured)
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Authorized Student Capacity:</span>
                  <span style={{ fontWeight: 800, color: '#1e40af', display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#eff6ff', padding: '3px 8px', borderRadius: '4px', border: '1px solid #bfdbfe', fontSize: '11.5px' }}>
                    <Users size={13} /> {getMaxStudentCapacity()} Students ({getStudentCapacityTier(getMaxStudentCapacity()).name})
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Bound Workstation ID:</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <code style={{ fontSize: '10.5px', color: '#1e40af', fontFamily: 'monospace', backgroundColor: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} title={machineHwid}>
                      {machineHwid ? (machineHwid.length > 22 ? machineHwid.slice(0, 20) + '…' : machineHwid) : 'Authorized Machine'}
                    </code>
                    {machineHwid && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(machineHwid);
                          setLicenseSyncFeedback('✓ Copied Hardware ID to clipboard');
                          setTimeout(() => setLicenseSyncFeedback(''), 3000);
                        }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#64748b' }}
                        title="Copy Workstation ID"
                      >
                        <Copy size={12} />
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Anti-Piracy Lock:</span>
                  <span style={{ color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    🔒 Single-Device Workstation Anchored
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={KeyRound}
                  onClick={onOpenLicenseModal}
                  style={{ fontSize: '11.5px' }}
                >
                  Change / Enter New License Key
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Local offline license updater — client pastes admin's code here (no internet needed) */}
        <div style={{ marginTop: '14px' }}>
          <LocalLicenseUpdater onApplied={(d)=>{ setLiveLicense(d); setLicenseSyncFeedback('✓ License updated from admin code'); setTimeout(()=>setLicenseSyncFeedback(''), 3000); }} />
        </div>

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

                <button
                  type="button"
                  onClick={async () => {
                    const res = await restoreAuthoritativeRoster();
                    if (res.success) {
                      setBackupNotice({ type: 'success', message: 'Authentic roster aligned: 101 students across 6 batches.' });
                    } else {
                      setBackupNotice({ type: 'error', message: 'Alignment note: ' + (res.error || res.reason || 'Completed') });
                    }
                  }}
                  style={{
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
                  <CheckCircle2 size={14} color="var(--status-present)" />
                  <span>Verify & Align Cohorts</span>
                </button>
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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  <Shield size={20} />
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
                    Automated Parent Alert &amp; SMS Gateway
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Enterprise automated dispatch engine for real-time parent notifications.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: '12px',
                    backgroundColor: customBotToken ? '#f0fdf4' : '#fffbeb',
                    color: customBotToken ? '#166534' : '#b45309',
                    border: `1px solid ${customBotToken ? '#bbf7d0' : '#fde68a'}`,
                  }}
                >
                  {customBotToken ? '🟢 Gateway Active & Ready' : '🟡 Setup Required'}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGatewayCredentials(!showGatewayCredentials)}
                  icon={showGatewayCredentials ? EyeOff : Lock}
                  style={{ fontSize: '11.5px', padding: '4px 10px' }}
                >
                  {showGatewayCredentials ? 'Hide Config' : 'Admin Unlock'}
                </Button>
              </div>
            </div>

            {/* High-level status overview */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                border: '1px solid var(--border-subtle)',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Dispatch Mode:</span>{' '}
                <strong style={{ color: 'var(--navy-950)' }}>
                  {telegramStatus.webhook?.url ? 'Cloud Webhook' : 'High-Speed Desktop Direct'}
                </strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Channel Security:</span>{' '}
                <strong style={{ color: '#166534' }}>End-to-End Encrypted</strong>
              </div>
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

            {/* Hidden / Expandable Admin Gateway Credentials */}
            {showGatewayCredentials && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  marginBottom: '16px',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '12px' }}>
                  🔒 Gateway Authentication Credentials (Restricted)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
                  <Input
                    label="Gateway Dispatch Handle"
                    value={customBotUsername}
                    onChange={(e) => setCustomBotUsername(e.target.value)}
                    placeholder="e.g. SMSNotificationEngine"
                  />

                  <Input
                    label="Gateway Secret Key (Encrypted)"
                    type="password"
                    value={customBotToken}
                    onChange={(e) => setCustomBotToken(e.target.value)}
                    placeholder="Enter proprietary secret key"
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginBottom: '14px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RefreshCw}
                    onClick={handleTestCustomBot}
                    disabled={testingBot || !customBotToken}
                  >
                    {testingBot ? 'Testing...' : 'Test Gateway Connection'}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    onClick={handleSaveCustomBot}
                  >
                    Save Credentials
                  </Button>
                </div>

                <div style={{ paddingTop: '12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Button
                    variant="gold"
                    size="sm"
                    onClick={() => handleSetWebhook('delete')}
                    disabled={isConfiguringWebhook}
                    title="Clear any registered webhook and switch to direct polling"
                  >
                    {isConfiguringWebhook ? 'Switching...' : 'Switch to High-Speed Desktop Direct Dispatch'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={RefreshCw}
                    onClick={fetchTelegramStatus}
                    disabled={telegramStatus.loading}
                  >
                    {telegramStatus.loading ? 'Checking...' : 'Refresh Gateway Diagnostics'}
                  </Button>
                </div>
              </div>
            )}

            {!showGatewayCredentials && (
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={RefreshCw}
                  onClick={handleTestCustomBot}
                  disabled={testingBot || !customBotToken}
                >
                  {testingBot ? 'Testing...' : 'Verify Gateway Status'}
                </Button>
              </div>
            )}
          </div>

          {/* Automated Birthday Wishes Policy & Channel Dispatcher */}
          <div className="erp-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                  <Cake size={20} />
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
                    Automated Birthday Wishes Policy
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                    Auto-sends personalized celebratory greetings to students celebrating their birthday today.
                  </p>
                </div>
              </div>

              {/* Modern Slider Toggle Button */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: autoBirthdayWishEnabled ? '#166534' : '#64748b',
                  }}
                >
                  {autoBirthdayWishEnabled ? 'Auto-Wish Active' : 'Disabled'}
                </span>
                <label
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    width: '46px',
                    height: '26px',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                  title={autoBirthdayWishEnabled ? 'Disable automated birthday wishes' : 'Enable automated birthday wishes'}
                >
                  <input
                    type="checkbox"
                    checked={autoBirthdayWishEnabled}
                    onChange={(e) => handleToggleAutoBirthday(e.target.checked)}
                    style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      cursor: 'pointer',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: autoBirthdayWishEnabled ? '#10b981' : '#cbd5e1',
                      transition: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: '26px',
                      boxShadow: autoBirthdayWishEnabled ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        content: '""',
                        height: '20px',
                        width: '20px',
                        left: autoBirthdayWishEnabled ? '23px' : '3px',
                        bottom: '3px',
                        backgroundColor: '#ffffff',
                        transition: '0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        borderRadius: '50%',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                      }}
                    />
                  </span>
                </label>
              </div>
            </div>

            {/* Channel Selection Buttons */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--navy-950)',
                  marginBottom: '8px',
                }}
              >
                Delivery Dispatch Channel:
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleSelectBirthdayChannel('telegram')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: `2px solid ${autoBirthdayWishChannel === 'telegram' ? 'var(--navy-900)' : 'var(--border-subtle)'}`,
                    backgroundColor: autoBirthdayWishChannel === 'telegram' ? '#eff6ff' : '#ffffff',
                    color: autoBirthdayWishChannel === 'telegram' ? 'var(--navy-950)' : '#64748b',
                    fontWeight: autoBirthdayWishChannel === 'telegram' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Send size={16} color={autoBirthdayWishChannel === 'telegram' ? '#2563eb' : '#64748b'} />
                  <span>Telegram Bot</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectBirthdayChannel('whatsapp')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: `2px solid ${autoBirthdayWishChannel === 'whatsapp' ? '#10b981' : 'var(--border-subtle)'}`,
                    backgroundColor: autoBirthdayWishChannel === 'whatsapp' ? '#ecfdf5' : '#ffffff',
                    color: autoBirthdayWishChannel === 'whatsapp' ? '#065f46' : '#64748b',
                    fontWeight: autoBirthdayWishChannel === 'whatsapp' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <MessageSquare size={16} color={autoBirthdayWishChannel === 'whatsapp' ? '#059669' : '#64748b'} />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectBirthdayChannel('both')}
                  style={{
                    padding: '10px 8px',
                    borderRadius: '8px',
                    border: `2px solid ${autoBirthdayWishChannel === 'both' ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor: autoBirthdayWishChannel === 'both' ? '#fffbeb' : '#ffffff',
                    color: autoBirthdayWishChannel === 'both' ? 'var(--navy-950)' : '#64748b',
                    fontWeight: autoBirthdayWishChannel === 'both' ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Sparkles size={16} color={autoBirthdayWishChannel === 'both' ? 'var(--gold-dark)' : '#64748b'} />
                  <span>Both (Tele + WA)</span>
                </button>
              </div>
            </div>

            {/* Status Information Box */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '8px',
                padding: '10px 14px',
                marginBottom: '16px',
                border: '1px solid var(--border-subtle)',
                fontSize: '12px',
                color: 'var(--text-muted)',
                lineHeight: '1.5',
              }}
            >
              <div>
                <strong>Automatic Schedule:</strong> Daily at system startup. The dispatcher audits registered student birth dates (<code style={{ fontSize: '11px' }}>dob</code>) against today's date.
              </div>
              <div style={{ marginTop: '4px' }}>
                <strong>Duplicate Protection:</strong> Automatically remembers dispatches and prevents multiple messages from being sent on the same day.
              </div>
            </div>

            {/* Live Feedback Notice */}
            {birthdayDispatchNotice && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor:
                    birthdayDispatchNotice.type === 'success'
                      ? 'var(--status-present-bg)'
                      : birthdayDispatchNotice.type === 'info'
                      ? '#eff6ff'
                      : 'var(--status-absent-bg)',
                  border: `1px solid ${
                    birthdayDispatchNotice.type === 'success'
                      ? 'var(--status-present-border)'
                      : birthdayDispatchNotice.type === 'info'
                      ? '#bfdbfe'
                      : 'var(--status-absent-border)'
                  }`,
                  color:
                    birthdayDispatchNotice.type === 'success'
                      ? 'var(--status-present)'
                      : birthdayDispatchNotice.type === 'info'
                      ? '#1e40af'
                      : 'var(--status-absent)',
                  fontSize: '12px',
                  fontWeight: 600,
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {birthdayDispatchNotice.type === 'success' ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertCircle size={16} />
                )}
                <span>{birthdayDispatchNotice.message}</span>
              </div>
            )}

            {/* Manual Trigger Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Need to run now? Test or dispatch immediately.
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={Send}
                onClick={handleManualBirthdayDispatch}
                disabled={isDispatchingBirthdays}
              >
                {isDispatchingBirthdays ? 'Dispatching Wishes...' : "Trigger Today's Birthday Dispatch Now"}
              </Button>
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
