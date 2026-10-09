import React from 'react';
import { Menu, Calendar, Shield, Bell, Plus, CheckSquare, Database } from 'lucide-react';
import Button from '../common/Button';
import { isSupabaseConfigured } from '../../lib/supabase';

/**
 * Enterprise Top Navigation Bar
 */
export default function TopNav({
  activePage,
  onOpenMobileMenu,
  onQuickAction,
  unreadCount = 2,
}) {
  const getPageTitle = (page) => {
    switch (page) {
      case 'dashboard':
        return 'Executive Dashboard';
      case 'students':
        return 'Student Directory';
      case 'batches':
        return 'Courses & Batches';
      case 'attendance':
        return 'Daily Attendance Register';
      case 'parents':
        return 'Parent Communication Directory';
      case 'notifications':
        return 'Notification Broadcasts';
      case 'settings':
        return 'System & Institution Settings';
      default:
        return 'Tuition ERP';
    }
  };

  return (
    <header className="erp-topbar">
      <div className="topbar-left">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="menu-toggle-btn"
          aria-label="Toggle navigation menu"
        >
          <Menu size={20} />
        </button>

        <div className="breadcrumbs">
          <span>Academy</span>
          <span>/</span>
          <span className="breadcrumb-active">{getPageTitle(activePage)}</span>
        </div>
      </div>

      <div className="topbar-right">
        {/* Database Connection Chip */}
        <div
          onClick={() => onQuickAction && onQuickAction('goto-settings')}
          className="topbar-chip"
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          title={isSupabaseConfigured ? 'Supabase Database Connected' : 'Supabase Not Configured'}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isSupabaseConfigured ? 'var(--status-present)' : 'var(--status-absent)',
              display: 'inline-block',
            }}
          />
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy-900)' }}>
            {isSupabaseConfigured ? 'DB: Live' : 'DB: Offline'}
          </span>
        </div>

        {/* Campus & Term Chip */}
        <div className="topbar-chip" style={{ display: 'none', md: 'flex' }}>
          <Calendar size={13} color="var(--gold-dark)" />
          <span>Friday, 09 Oct 2026</span>
        </div>

        {/* Quick Action Button */}
        {activePage !== 'attendance' && (
          <Button
            variant="outline"
            size="sm"
            icon={CheckSquare}
            onClick={() => onQuickAction && onQuickAction('goto-attendance')}
          >
            Roll Call
          </Button>
        )}

        {activePage !== 'students' && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => onQuickAction && onQuickAction('new-student')}
          >
            New Admission
          </Button>
        )}

        {/* Notification Bell */}
        <button
          type="button"
          onClick={() => onQuickAction && onQuickAction('goto-notifications')}
          className="btn btn-outline"
          style={{
            position: 'relative',
            padding: '7px 9px',
            borderRadius: '4px',
          }}
          title="Alerts & Telegram Queue"
        >
          <Bell size={16} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                backgroundColor: 'var(--status-absent)',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '50%',
                width: '16px',
                height: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
