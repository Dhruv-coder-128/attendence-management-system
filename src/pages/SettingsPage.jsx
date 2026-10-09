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
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { isSupabaseConfigured, checkSupabaseConnection, supabaseConfig } from '../lib/supabase';
import {
  getTelegramBotStatus,
  setupTelegramWebhook,
  TELEGRAM_BOT_USERNAME,
} from '../lib/telegramClient';

/**
 * System Settings & Cloud Integration Status Page
 */
export default function SettingsPage() {
  const [instituteName, setInstituteName] = useState(() => {
    return localStorage.getItem('erp_institute_name') || 'Ruparel Attendance ERP Academy';
  });
  const [campusName, setCampusName] = useState(() => {
    return localStorage.getItem('erp_campus_name') || 'Central Campus — Main Wing';
  });
  const [academicYear, setAcademicYear] = useState(() => {
    return localStorage.getItem('erp_academic_year') || 'AY 2026-27 (Term 1)';
  });
  const [minAttendanceThreshold, setMinAttendanceThreshold] = useState(() => {
    return localStorage.getItem('erp_min_attendance') || '75';
  });
  const [lateGracePeriod, setLateGracePeriod] = useState(() => {
    return localStorage.getItem('erp_late_grace') || '15';
  });
  const [savedNotice, setSavedNotice] = useState(false);

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
      if (res.ok) {
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
  }, []);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('erp_institute_name', instituteName);
      localStorage.setItem('erp_campus_name', campusName);
      localStorage.setItem('erp_academic_year', academicYear);
      localStorage.setItem('erp_min_attendance', minAttendanceThreshold);
      localStorage.setItem('erp_late_grace', lateGracePeriod);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
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
            />

            <Input
              label="Campus &amp; Building Block"
              value={campusName}
              onChange={(e) => setCampusName(e.target.value)}
            />

            <Input
              label="Active Academic Year / Term"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
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

        {/* Right Column: Cloud Backend & Supabase Diagnostic Integration */}
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
                  Supabase &amp; PostgreSQL Database
                </h2>
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={runConnectionTest}
                disabled={connectionState.loading}
              >
                {connectionState.loading ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Backend PostgreSQL connectivity via <code>.env.local</code> publishable credentials
            </p>

            {/* Live Connection Status Banner */}
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
            </div>
          </div>

          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={18} color="var(--gold-dark)" />
                <h2
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontSize: '15px',
                    fontWeight: 700,
                    color: 'var(--navy-950)',
                  }}
                >
                  Telegram Bot API Gateway &amp; Webhook
                </h2>
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={fetchTelegramStatus}
                disabled={telegramStatus.loading}
              >
                {telegramStatus.loading ? 'Checking...' : 'Check Status'}
              </Button>
            </div>

            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Official Bot: <strong>@{TELEGRAM_BOT_USERNAME}</strong> &bull; Serverless webhook routing via <code>/api/telegram-webhook</code>
            </p>

            {/* Webhook Operation Notice */}
            {webhookNotice && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '10px 14px',
                  backgroundColor: webhookNotice.type === 'success' ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                  border: `1px solid ${webhookNotice.type === 'success' ? 'var(--status-present-border)' : 'var(--status-absent-border)'}`,
                  borderRadius: '6px',
                  color: webhookNotice.type === 'success' ? 'var(--status-present)' : 'var(--status-absent)',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {webhookNotice.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{webhookNotice.message}</span>
              </div>
            )}

            {/* Live Gateway Diagnostics Banner */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: telegramStatus.data?.ok
                  ? 'var(--status-present-bg)'
                  : telegramStatus.checked
                  ? 'var(--status-absent-bg)'
                  : '#f8fafc',
                border: `1px solid ${
                  telegramStatus.data?.ok
                    ? 'var(--status-present-border)'
                    : telegramStatus.checked
                    ? 'var(--status-absent-border)'
                    : 'var(--border-subtle)'
                }`,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              {telegramStatus.data?.ok ? (
                <CheckCircle2 size={18} color="var(--status-present)" style={{ marginTop: '2px', flexShrink: 0 }} />
              ) : (
                <AlertCircle size={18} color="var(--status-absent)" style={{ marginTop: '2px', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0, fontSize: '12px' }}>
                <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                  {telegramStatus.data?.ok
                    ? `Bot Active: @${telegramStatus.data.bot?.username || TELEGRAM_BOT_USERNAME} (${telegramStatus.data.bot?.first_name || 'ERP Bot'})`
                    : telegramStatus.error || 'Telegram Bot Token not configured on server'}
                </div>
                {telegramStatus.data?.webhook && (
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                    <span>Registered Webhook: </span>
                    <code>{telegramStatus.data.webhook.url || 'None (Polling / Inactive)'}</code>
                    {telegramStatus.data.webhook.pending_update_count > 0 && (
                      <span style={{ marginLeft: '8px', color: 'var(--gold-dark)', fontWeight: 600 }}>
                        ({telegramStatus.data.webhook.pending_update_count} pending updates)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Webhook Registration Tool */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                marginBottom: '14px',
              }}
            >
              <label className="form-label" style={{ marginBottom: '6px' }}>
                Production Webhook URL (HTTPS Required)
              </label>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Telegram requires an active HTTPS URL to forward <code>/start tk_...</code> linking events. Enter your deployed Vercel domain URL below.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="url"
                  placeholder="https://your-domain.vercel.app/api/telegram-webhook"
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  className="form-input"
                  style={{ flex: '1 1 240px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  icon={Link}
                  onClick={() => handleSetWebhook('set')}
                  disabled={isConfiguringWebhook}
                >
                  {isConfiguringWebhook ? 'Registering...' : 'Register Webhook'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Trash2}
                  onClick={() => handleSetWebhook('delete')}
                  disabled={isConfiguringWebhook}
                  title="Remove webhook to switch to polling or reset"
                >
                  Clear Webhook
                </Button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <Shield size={13} color="var(--status-present)" />
              <span>Zero client exposure: <code>TELEGRAM_BOT_TOKEN</code> resides securely on the server</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
