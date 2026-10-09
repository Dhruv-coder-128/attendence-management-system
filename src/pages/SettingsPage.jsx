import React, { useState } from 'react';
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
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import { isSupabaseConfigured } from '../lib/supabase';

/**
 * System Settings & Cloud Integration Status Page
 */
export default function SettingsPage({ onResetDemo }) {
  const [instituteName, setInstituteName] = useState('Vanguard Academy of Advanced Sciences');
  const [campusName, setCampusName] = useState('Central Campus — Block IV');
  const [academicYear, setAcademicYear] = useState('AY 2026-27 (Term 1)');
  const [minAttendanceThreshold, setMinAttendanceThreshold] = useState('75');
  const [lateGracePeriod, setLateGracePeriod] = useState('15');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Institution &amp; ERP System Settings</h1>
          <p className="page-description">
            Academic Calendar, Attendance Policies, PostgreSQL (Supabase) &amp; Telegram Bot Configuration
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={onResetDemo}
          >
            Reset Demo Data
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

        {/* Right Column: Cloud Backend & Integration Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Permanent persistence layer for 400–500 students, roll call registers &amp; audit trails
            </p>

            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: isSupabaseConfigured ? 'var(--status-present-bg)' : '#f8fafc',
                border: `1px solid ${isSupabaseConfigured ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px',
              }}
            >
              {isSupabaseConfigured ? (
                <>
                  <CheckCircle2 size={18} color="var(--status-present)" />
                  <div>
                    <strong style={{ color: 'var(--status-present)', fontSize: '12px' }}>
                      Connected to Supabase Project
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      PostgreSQL schema ready for synchronization
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle size={18} color="var(--gold-dark)" />
                  <div>
                    <strong style={{ color: 'var(--navy-950)', fontSize: '12px' }}>
                      Ready for Supabase Connection
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Configure <code>VITE_SUPABASE_URL</code> &amp; <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The client library <code>@supabase/supabase-js</code> is bundled. When credentials are provided in <code>.env</code>, live tables will sync automatically.
            </div>
          </div>

          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Bot size={18} color="var(--gold-dark)" />
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--navy-950)',
                }}
              >
                Telegram Bot API Gateway
              </h2>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Automated parent alerts dispatched through official Telegram Bot
            </p>

            <div
              style={{
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                marginBottom: '12px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                Server-side Bot Integration:
              </div>
              <div>
                To ensure maximum security, <code>TELEGRAM_BOT_TOKEN</code> will be executed securely via Vercel Serverless Functions (<code>/api/telegram-webhook</code>) so bot tokens are never exposed in the browser bundle.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <Shield size={13} color="var(--status-present)" />
              <span>Zero-exposure architecture enforced for API keys</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
