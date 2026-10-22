import React, { useRef } from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarCheck,
  UserCheck,
  CreditCard,
  Award,
  Bell,
  Settings,
  LogOut,
  GraduationCap,
  ShieldCheck,
  Shield,
  ShieldAlert,
  FileSpreadsheet,
} from 'lucide-react';
import { hasPermission } from '../../lib/authService';
import { useAcademySettings } from '../../lib/academySettings';
import { isTauriDesktop } from '../../lib/licenseService';

/**
 * Simplified Enterprise Navigation Sidebar
 * Exact labels: Dashboard, Students, Batches, Attendance, Parents, Fees, Exams, Notifications, Settings
 */
export default function Sidebar({
  activePage,
  onNavigate,
  isOpen,
  onClose,
  onLogout,
  counts = {},
  user,
  currentUserProfile,
}) {
  const branding = useAcademySettings();
  const logoClicksRef = useRef({ count: 0, lastTime: 0 });

  const rawStaffName =
    currentUserProfile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    branding.owner_name ||
    'Institution Administrator';

  const isPersonalDev =
    rawStaffName.toLowerCase().includes('dhruv') ||
    rawStaffName.toLowerCase().includes('dushah') ||
    (user?.email || '').toLowerCase().includes('dushah');

  const staffName = isPersonalDev
    ? (branding.owner_name || 'Institution Administrator')
    : rawStaffName;

  const userRole = (currentUserProfile?.role || user?.role || 'owner').toLowerCase();
  const roleDisplay =
    userRole === 'owner' ? 'Owner' : userRole === 'admin' ? 'Admin' : 'Moderator';

  const userInitials = (staffName || 'IA')
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Secret 5-click unlock for Developer SaaS Portal
  const handleBrandClick = () => {
    const now = Date.now();
    if (now - logoClicksRef.current.lastTime < 1000) {
      logoClicksRef.current.count += 1;
    } else {
      logoClicksRef.current.count = 1;
    }
    logoClicksRef.current.lastTime = now;

    if (logoClicksRef.current.count >= 5) {
      logoClicksRef.current.count = 0;
      if (isTauriDesktop()) return;
      try {
        sessionStorage.setItem('sms_dev_console_unlocked', 'true');
      } catch {}
      onNavigate('master-portal');
    }
  };

  // Exact 9 primary navigation modules
  const allNavItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      permission: null, // Always accessible
    },
    {
      id: 'students',
      label: 'Students',
      icon: Users,
      badge: counts.students !== undefined ? String(counts.students) : '0',
      permission: 'view_students',
    },
    {
      id: 'batches',
      label: 'Batches',
      icon: BookOpen,
      badge: counts.batches !== undefined ? String(counts.batches) : '0',
      permission: 'manage_batches',
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: CalendarCheck,
      badge: 'Live',
      permission: 'view_attendance',
    },
    {
      id: 'parents',
      label: 'Parents',
      icon: UserCheck,
      permission: 'manage_parents',
    },
    {
      id: 'fees',
      label: 'Fees',
      icon: CreditCard,
      permission: 'manage_fees',
    },
    {
      id: 'exams',
      label: 'Exams',
      icon: Award,
      permission: 'manage_exams',
    },
    {
      id: 'notifications',
      label: 'Notifications',
      icon: Bell,
      badge: counts.notifications > 0 ? String(counts.notifications) : null,
      permission: 'send_notifications',
    },
    {
      id: 'import',
      label: 'Import Data',
      icon: FileSpreadsheet,
      badge: 'Hub',
      permission: null,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      permission: 'manage_settings',
    },
    {
      id: 'master-portal',
      label: 'Admin Control Center',
      icon: ShieldCheck,
      badge: 'Admin',
      permission: null,
    },
  ];

  // Strictly filter out Admin Control Center on Desktop EXE
  const visibleNavItems = allNavItems.filter((item) => {
    if (item.id === 'master-portal' && isTauriDesktop()) {
      return false;
    }
    return true;
  });

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
          <div className="brand-wrapper" onClick={handleBrandClick} style={{ cursor: 'pointer' }}>
            <div className="brand-crest">
              {branding.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt="Logo"
                  style={{ width: '26px', height: '26px', objectFit: 'contain' }}
                />
              ) : (
                <GraduationCap size={22} />
              )}
            </div>
            <div>
              <div className="brand-title">SMS</div>
              <div className="brand-subtitle">Student Management System</div>
            </div>
          </div>

          <div className="sidebar-badge-strip">
            <span>Academic Portal</span>
            <span style={{ fontWeight: 600 }}>
              {counts.students ? `${counts.students} Students` : 'SMS Portal'}
            </span>
          </div>
        </div>


        {/* Navigation Section */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>
          {visibleNavItems.map((item) => {
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
            <div className="user-avatar" title={user?.email || 'Profile'}>
              {userInitials}
            </div>
            <div className="user-info">
              <div className="user-name" title={staffName}>
                {staffName}
              </div>
              <div
                className="user-role"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: userRole === 'owner' ? 'var(--gold-primary)' : '#94a3b8',
                }}
              >
                {userRole === 'owner' ? <ShieldCheck size={12} /> : <Shield size={12} />}
                <span>{roleDisplay}</span>
              </div>
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
              title="Sign Out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
