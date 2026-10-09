import React, { useState } from 'react';
import { Info, Sparkles, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import { isSupabaseConfigured } from '../../lib/supabase';

/**
 * Main Enterprise App Layout
 */
export default function AppLayout({
  activePage,
  onNavigate,
  onLogout,
  counts,
  user,
  children,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleQuickAction = (action) => {
    if (action === 'goto-attendance') onNavigate('attendance');
    else if (action === 'goto-notifications') onNavigate('notifications');
    else if (action === 'new-student') onNavigate('students');
    else if (action === 'goto-settings') onNavigate('settings');
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
        user={user}
      />

      {/* Main Workspace Area */}
      <div className="erp-main-area">
        {/* Offline Warning Banner — Only displayed if database credentials are not configured */}
        {!isSupabaseConfigured && (
          <div
            style={{
              backgroundColor: 'var(--status-absent-bg)',
              borderBottom: '1px solid var(--status-absent-border)',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '12px',
              color: 'var(--status-absent)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              <span>
                <strong>Production Database Offline:</strong> Missing <code>VITE_SUPABASE_URL</code> or <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in environment variables. Real database records cannot load until configured.
              </span>
            </div>
            <button
              onClick={() => onNavigate('settings')}
              className="btn btn-outline"
              style={{
                padding: '3px 10px',
                fontSize: '11px',
                borderColor: 'var(--status-absent-border)',
                color: 'var(--status-absent)',
              }}
            >
              Configure in Settings
            </button>
          </div>
        )}

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
