import React from 'react';
import { Clock, ShieldAlert, Sparkles } from 'lucide-react';
import { getStoredLicense } from '../../lib/licenseService';

export default function TrialBanner({ daysRemaining, onOpenActivation }) {
  const license = getStoredLicense();
  const schoolName = license?.schoolName || 'Institution';
  const days = daysRemaining !== undefined ? daysRemaining : license?.daysRemaining ?? 30;

  const isLow = days <= 5;

  return (
    <div
      style={{
        backgroundColor: isLow ? '#7f1d1d' : 'var(--navy-900)',
        borderBottom: `1px solid ${isLow ? '#b91c1c' : 'var(--gold-border)'}`,
        color: '#ffffff',
        padding: '6px 16px',
        fontSize: '12.5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {isLow ? (
          <ShieldAlert size={15} color="#fca5a5" />
        ) : (
          <Clock size={15} color="var(--gold-light)" />
        )}
        <span>
          <strong style={{ color: isLow ? '#fef2f2' : 'var(--gold-light)', fontWeight: 600 }}>
            {schoolName}:
          </strong>{' '}
          30-Day Evaluation Trial —{' '}
          <strong style={{ color: isLow ? '#fecaca' : '#ffffff', textDecoration: isLow ? 'underline' : 'none' }}>
            {days} {days === 1 ? 'day' : 'days'} remaining
          </strong>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          type="button"
          onClick={onOpenActivation}
          style={{
            background: isLow ? '#ef4444' : 'var(--gold-subtle-bg)',
            border: `1px solid ${isLow ? '#f87171' : 'var(--gold-border)'}`,
            color: isLow ? '#ffffff' : 'var(--gold-light)',
            padding: '3px 10px',
            borderRadius: '4px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          {isLow ? 'Renew / Activate' : 'License Details'}
        </button>
      </div>
    </div>
  );
}
