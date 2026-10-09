import React, { useState } from 'react';
import { GraduationCap, Shield, Lock, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Select from '../components/common/Select';

/**
 * Enterprise ERP Login Screen
 * Styled in rich corporate navy with subtle muted gold accents
 */
export default function LoginPage({ onLoginSuccess }) {
  const [role, setRole] = useState('Academic Director');
  const [email, setEmail] = useState('director@vanguard.edu');
  const [password, setPassword] = useState('director2026');
  const [isLoading, setIsLoading] = useState(false);

  const handleFillDemo = (demoRole) => {
    if (demoRole === 'Director') {
      setRole('Academic Director');
      setEmail('director@vanguard.edu');
      setPassword('director2026');
    } else if (demoRole === 'Faculty') {
      setRole('Senior Faculty');
      setEmail('prof.ramanathan@vanguard.edu');
      setPassword('faculty2026');
    } else {
      setRole('Centre Manager');
      setEmail('manager@vanguard.edu');
      setPassword('manager2026');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Instant smooth transition into ERP dashboard
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        email,
        role,
        name: role === 'Academic Director' ? 'Dr. S. Nair' : 'Faculty Admin',
      });
    }, 400);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--navy-950)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--bg-surface)',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
        }}
      >
        {/* Institutional Crest & Navy Top Banner */}
        <div
          style={{
            backgroundColor: 'var(--navy-900)',
            padding: '28px 24px 24px',
            textAlign: 'center',
            borderBottom: '2px solid var(--gold-primary)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              backgroundColor: 'var(--navy-800)',
              border: '1px solid var(--gold-border)',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--gold-primary)',
              marginBottom: '12px',
            }}
          >
            <GraduationCap size={28} />
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '18px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            Ruparel Attendence ERP
          </h1>
          <p style={{ fontSize: '12px', color: 'var(--gold-light)', marginTop: '4px' }}>
            Tuition &amp; Academy Management System
          </p>
          <div
            style={{
              display: 'inline-block',
              marginTop: '10px',
              padding: '3px 10px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              fontSize: '11px',
              color: '#cbd5e1',
            }}
          >
            AY 2026-27 • 400–500 Enrolled Students Edition
          </div>
        </div>

        {/* Login Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          <Select
            label="Administrative Role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={[
              'Academic Director',
              'Centre Manager',
              'Senior Faculty',
              'Admissions Officer',
            ]}
          />

          <Input
            label="Institutional Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@vanguard.edu"
            required
          />

          <Input
            label="Security Passkey"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={isLoading}
            className="w-full"
            style={{ width: '100%', marginTop: '8px' }}
            icon={ArrowRight}
            iconPosition="right"
          >
            {isLoading ? 'Authenticating...' : 'Sign In to Console'}
          </Button>

          {/* Quick Demo Credentials Autofill */}
          <div
            style={{
              marginTop: '20px',
              padding: '12px',
              backgroundColor: 'var(--bg-subtle)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Demo Preview One-Click Sign In:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleFillDemo('Director')}
                className="btn btn-sm btn-outline"
                style={{ flex: 1, fontSize: '11px' }}
              >
                Director
              </button>
              <button
                type="button"
                onClick={() => handleFillDemo('Manager')}
                className="btn btn-sm btn-outline"
                style={{ flex: 1, fontSize: '11px' }}
              >
                Manager
              </button>
              <button
                type="button"
                onClick={() => handleFillDemo('Faculty')}
                className="btn btn-sm btn-outline"
                style={{ flex: 1, fontSize: '11px' }}
              >
                Faculty
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Shield size={12} color="var(--gold-dark)" />
            <span>Authorized Faculty &amp; Staff Access Only</span>
          </div>
        </form>
      </div>
    </div>
  );
}
