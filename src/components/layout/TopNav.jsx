import React from 'react';
import { Menu, Calendar, Bell } from 'lucide-react';

/**
 * Clean Professional Top Navigation Bar
 */
export default function TopNav({
  activePage,
  onOpenMobileMenu,
  onQuickAction,
  unreadCount = 0,
}) {
  const getPageTitle = (page) => {
    switch (page) {
      case 'dashboard':
        return 'Dashboard';
      case 'students':
        return 'Students';
      case 'batches':
        return 'Batches';
      case 'attendance':
        return 'Attendance';
      case 'parents':
        return 'Parents';
      case 'fees':
        return 'Fees';
      case 'exams':
        return 'Exams';
      case 'notifications':
        return 'Notifications';
      case 'settings':
        return 'Settings';
      case 'import':
        return 'Bulk Import';
      default:
        return 'ERP';
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
        {/* Date Indicator */}
        <div className="topbar-chip" style={{ display: 'none', md: 'flex' }}>
          <Calendar size={13} color="var(--gold-dark)" />
          <span>
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

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
          title="Notifications & Alerts"
          aria-label="Notifications"
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
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
