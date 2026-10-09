import React, { useState } from 'react';
import { Info, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import { DEMO_NOTICE } from '../../data/demoData';
import { isSupabaseConfigured } from '../../lib/supabase';

/**
 * Main Enterprise App Layout
 */
export default function AppLayout({
  activePage,
  onNavigate,
  onLogout,
  counts,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleQuickAction = (action) => {
    if (action === 'goto-attendance') onNavigate('attendance');
    else if (action === 'goto-notifications') onNavigate('notifications');
    else if (action === 'new-student') onNavigate('students');
  };

  return (
    <div className="erp-container">
      {/* Fixed Sidebar */}
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onLogout={onLogout}
        counts={counts}
      />

      {/* Main Workspace Area */}
      <div className="erp-main-area">
        {/* Top Sandbox Notice */}
        <div className="demo-banner">
          <div className="demo-banner-left">
            <span className="demo-pill">Sandbox Preview</span>
            <span>{DEMO_NOTICE.disclaimer}</span>
          </div>
          <div
            onClick={() => onNavigate('settings')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            title="Click to view Supabase connection details in Settings"
          >
            {isSupabaseConfigured ? (
              <>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--status-present)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                  Supabase: Connected
                </span>
              </>
            ) : (
              <>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--gold-dark)',
                    display: 'inline-block',
                  }}
                />
                <span style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                  Supabase: Setup .env.local
                </span>
              </>
            )}
          </div>
        </div>

        {/* Top Navigation */}
        <TopNav
          activePage={activePage}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onQuickAction={handleQuickAction}
        />

        {/* Content Body */}
        <main className="erp-content">{children}</main>
      </div>
    </div>
  );
}
