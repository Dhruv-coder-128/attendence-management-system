import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  UserCheck,
  Bell,
  Settings,
  LogOut,
  GraduationCap,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';

/**
 * Enterprise Fixed Sidebar Component
 * Styled in rich deep navy with subtle muted gold accents
 */
export default function Sidebar({
  activePage,
  onNavigate,
  isOpen,
  onClose,
  onLogout,
  counts = {},
  user,
}) {
  const adminName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Administrator';
  const adminRole = user?.user_metadata?.role || (user ? 'Admin Staff' : 'Director');
  const userInitials = (adminName || 'AD')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  const navItems = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
    {
      id: 'students',
      label: 'Students Directory',
      icon: Users,
      badge: counts.students !== undefined ? String(counts.students) : '0',
    },
    {
      id: 'batches',
      label: 'Courses & Batches',
      icon: BookOpen,
      badge: counts.batches !== undefined ? String(counts.batches) : '0',
    },
    { id: 'attendance', label: 'Attendance Register', icon: CalendarCheck, badge: 'Live' },
    { id: 'parents', label: 'Parent Directory', icon: UserCheck },
    {
      id: 'import',
      label: 'Bulk Data Import',
      icon: FileSpreadsheet,
      badge: 'XLS/CSV',
    },
    {
      id: 'notifications',
      label: 'Telegram & Alerts',
      icon: Bell,
      badge: counts.notifications !== undefined ? String(counts.notifications) : '0',
    },
    { id: 'settings', label: 'ERP Settings', icon: Settings },
  ];

  const handleNavClick = (id) => {
    onNavigate(id);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose} />}

      <aside className={`erp-sidebar ${isOpen ? 'open' : ''}`}>
        {/* Brand Header */}
        <div className="sidebar-header">
          <div className="brand-wrapper">
            <div className="brand-crest">
              <GraduationCap size={22} />
            </div>
            <div>
              <div className="brand-title">Ruparel Attendence ERP</div>
              <div className="brand-subtitle">Tuition &amp; Academy System</div>
            </div>
          </div>

          <div className="sidebar-badge-strip">
            <span>AY 2026-27 &bull; Term 1</span>
            <span style={{ fontWeight: 600 }}>
              {counts.students !== undefined ? `${counts.students} Students` : 'PostgreSQL'}
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Academic Modules</div>
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}

          <div className="nav-section-title" style={{ marginTop: '12px' }}>
            Communications &amp; Config
          </div>
          {navItems.slice(4).map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" />
                <span>{item.label}</span>
                {item.badge && <span className="nav-badge">{item.badge}</span>}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with Logged In User Profile */}
        <div className="sidebar-footer">
          <div className="user-snippet">
            <div className="user-avatar" title={user?.email || 'Admin Profile'}>
              {userInitials}
            </div>
            <div className="user-info">
              <div className="user-name" title={adminName}>{adminName}</div>
              <div className="user-role">{adminRole}</div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="btn btn-sm btn-outline"
              style={{
                padding: '6px',
                borderColor: 'var(--border-navy)',
                background: 'transparent',
                color: '#94a3b8',
              }}
              title="Sign Out to Login Screen"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
