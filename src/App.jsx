import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AttendancePage from './pages/AttendancePage';
import TeacherAttendancePage from './pages/TeacherAttendancePage';

// Code-split secondary pages to optimize initial bundle size for Desktop EXE and Android APK
const StudentsPage = lazy(() => import('./pages/StudentsPage'));
const BatchesPage = lazy(() => import('./pages/BatchesPage'));
const ParentsPage = lazy(() => import('./pages/ParentsPage'));
const FeesPage = lazy(() => import('./pages/FeesPage'));
const ExamsPage = lazy(() => import('./pages/ExamsPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BulkImportPage = lazy(() => import('./pages/BulkImportPage'));
const MasterAdminPortalPage = lazy(() => import('./pages/MasterAdminPortalPage'));
const ParentPortalPage = lazy(() => import('./pages/ParentPortalPage'));

import { supabase, isSupabaseConfigured, reinitializeSupabaseClient } from './lib/supabase';
import { fetchUserProfile, hasPermission, getFallbackOwnerProfile, getFallbackStaffProfile, OWNER_EMAIL } from './lib/authService';
import { validateLicense, isTauriDesktop, getStoredLicense } from './lib/licenseService';
import SchoolActivationModal from './components/license/SchoolActivationModal';
import DraggableTrialCapsule from './components/license/DraggableTrialCapsule';
import TrialExpiredLockout from './components/license/TrialExpiredLockout';
import { RefreshCw, GraduationCap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useSchoolDatabaseSync } from './lib/useSchoolDatabaseSync';
import { checkAndDispatchBirthdayWishes } from './lib/birthdayAutoDispatcher';


/**
 * SMS — Student Management System Root Application Component
 * 100% Real Database Connected — Zero Mock Data Dependencies
 * Integrates RBAC (Owner, Admin, Moderator), Phase 5 Exams & Fees,
 * Desktop Packaging, and Multi-School Licensing with 30-Day Server Trial.
 */
export default function App() {
  // Continuous Two-Way Wi-Fi Database Synchronization for Desktop PC
  // (On mobile Capacitor, the hook safely bypasses desktop background polling)
  useSchoolDatabaseSync();

  // Supabase Auth Session State
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // School Licensing & 30-Day Trial State
  const [licenseStatus, setLicenseStatus] = useState(null);
  const [isActivationModalOpen, setIsActivationModalOpen] = useState(false);

  // Active View / Navigation State
  // Desktop EXE: Pure School Client (dashboard)
  // Android Native APK: Pure Teacher Mobile Roll Call (teacher-portal)
  // Vercel Web Cloud: Strictly Super Admin SaaS Console (master-portal)
  const [activePage, setActivePage] = useState(() => {
    if (Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.location.search.includes('portal=teacher'))) {
      return 'teacher-portal';
    }
    if (!isTauriDesktop()) {
      return 'master-portal';
    }
    return 'dashboard';
  });

  // Live Counts for Sidebar (Derived from Supabase)
  const [counts, setCounts] = useState({
    students: 0,
    batches: 0,
    notifications: 0,
  });

  // Outbox broadcast log state
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem('erp_broadcast_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Validate license on app startup and whenever reactivation occurs
  const checkLicense = useCallback(async () => {
    try {
      const res = await validateLicense();
      setLicenseStatus(res);
      // In desktop app, if unlicensed, prompt for activation
      if (isTauriDesktop() && res.status === 'unlicensed') {
        setIsActivationModalOpen(true);
      }
      return res;
    } catch (err) {
      console.warn('License verification error:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    checkLicense();
    // Periodic license heartbeat check every 15s to immediately enforce remote SaaS lock or timer expiry
    const timer = setInterval(() => {
      checkLicense();
    }, 15000);
    return () => clearInterval(timer);
  }, [checkLicense]);

  // Function to refresh database counts for the navigation badges
  const refreshCounts = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) return;

    try {
      // 1. Live Student Count directly from public.students
      const { count: studentCount, data: sData, error: sErr } = await supabase
        .from('students')
        .select('id', { count: 'exact' });

      // 2. Live Batches Count directly from public.batches
      const { count: batchCount, data: bData, error: bErr } = await supabase
        .from('batches')
        .select('id, is_active', { count: 'exact' });

      const finalStudents = !sErr && studentCount !== null && studentCount !== undefined
        ? studentCount
        : (sData ? sData.length : 0);

      const finalBatches = !bErr && batchCount !== null && batchCount !== undefined
        ? batchCount
        : (bData ? bData.length : 0);

      // 3. Live Notifications / Telegram Dispatches Count from public.attendance
      let notifyCount = 0;
      if (activePage === 'notifications') {
        notifyCount = 0;
        try {
          localStorage.setItem('sms_last_viewed_notifications', new Date().toISOString());
        } catch {}
      } else {
        try {
          const lastViewed = localStorage.getItem('sms_last_viewed_notifications');
          const { data, error: nErr } = await supabase
            .from('attendance')
            .select('id, telegram_notified_at, created_at')
            .eq('telegram_notified', true);

          if (!nErr && data) {
            if (!lastViewed) {
              notifyCount = data.length;
            } else {
              const lastViewedTime = new Date(lastViewed).getTime();
              notifyCount = data.filter((item) => {
                const itemTime = new Date(item.telegram_notified_at || item.created_at || 0).getTime();
                return itemTime > lastViewedTime;
              }).length;
            }
          }
        } catch {
          notifyCount = 0;
        }
      }

      setCounts({
        students: finalStudents,
        batches: finalBatches,
        notifications: notifyCount,
      });
    } catch (err) {
      console.warn('Count refresh encountered issue:', err);
    }
  }, [activePage, notifications.length]);

  // Load User Profile & Permissions
  const loadProfile = useCallback(async (authUser) => {
    if (!authUser) {
      setCurrentUserProfile(null);
      return;
    }
    try {
      const profile = await fetchUserProfile(authUser);
      setCurrentUserProfile(profile);
    } catch (err) {
      const cleanEmail = (authUser.email || '').toLowerCase();
      const isOwnerAccount = cleanEmail === OWNER_EMAIL ||
        cleanEmail.startsWith('owner') ||
        cleanEmail.startsWith('admin') ||
        cleanEmail.includes('admin') ||
        isTauriDesktop() ||
        authUser.role === 'owner' ||
        authUser.app_metadata?.role === 'owner';
      setCurrentUserProfile(isOwnerAccount ? getFallbackOwnerProfile(authUser) : getFallbackStaffProfile(authUser, 'owner'));
    }
  }, []);

  // Initialize and subscribe to Supabase Auth State
  useEffect(() => {
    // Failsafe timer: guarantee loading state terminates within 3 seconds regardless of network
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 3000);

    try {
      if (!supabase || !isSupabaseConfigured || !supabase.auth) {
        clearTimeout(safetyTimer);
        setAuthLoading(false);
        return;
      }

      // 1. Get initial session
      supabase.auth
        .getSession()
        .then(({ data: { session: initialSession } = {} }) => {
          clearTimeout(safetyTimer);
          let sessionToUse = initialSession || null;
          let currentUser = sessionToUse?.user ?? null;

          // In standalone desktop app, guarantee an authorized administrator session on launch
          if (isTauriDesktop() && !currentUser) {
            currentUser = {
              id: 'desktop-admin-session',
              email: 'admin@institution.edu',
              role: 'owner',
              aud: 'authenticated',
              user_metadata: { full_name: 'Institution Administrator', role: 'owner' },
              app_metadata: { role: 'owner', provider: 'email' },
            };
            sessionToUse = { user: currentUser, access_token: 'offline-token' };
          }

          setSession(sessionToUse);
          setUser(currentUser);
          if (currentUser) {
            loadProfile(currentUser);
          }
          setAuthLoading(false);
        })
        .catch((err) => {
          clearTimeout(safetyTimer);
          console.error('Session retrieval error:', err);
          if (isTauriDesktop()) {
            const fallbackAdmin = {
              id: 'desktop-admin-session',
              email: 'admin@institution.edu',
              role: 'owner',
              aud: 'authenticated',
              user_metadata: { full_name: 'Institution Administrator', role: 'owner' },
              app_metadata: { role: 'owner', provider: 'email' },
            };
            setSession({ user: fallbackAdmin, access_token: 'offline-token' });
            setUser(fallbackAdmin);
            loadProfile(fallbackAdmin);
          }
          setAuthLoading(false);
        });

      // 2. Listen for auth state changes
      const {
        data: { subscription } = {},
      } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        clearTimeout(safetyTimer);
        setSession(currentSession || null);
        const currentUser = currentSession?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          loadProfile(currentUser);
        } else {
          setCurrentUserProfile(null);
        }
        setAuthLoading(false);
      });

      return () => {
        clearTimeout(safetyTimer);
        subscription?.unsubscribe?.();
      };
    } catch (err) {
      clearTimeout(safetyTimer);
      console.error('Auth initialization error:', err);
      setAuthLoading(false);
    }
  }, [loadProfile]);

  // Refresh counts when user is authenticated or active page changes
  useEffect(() => {
    if (user) {
      refreshCounts();
    }
  }, [user, activePage, refreshCounts]);

  // Automated Daily Birthday Greetings Dispatch (runs once daily upon application startup)
  useEffect(() => {
    if (user && !Capacitor.isNativePlatform()) {
      checkAndDispatchBirthdayWishes().catch((err) => {
        console.warn('Automated birthday greeting startup check note:', err);
      });
    }
  }, [user]);

  // Secret Developer Portal Shortcut: Ctrl + Shift + D
  useEffect(() => {
    const handleDevKeyDown = (e) => {
      // In Desktop EXE, shortcut is disabled to keep EXE 100% focused on school management
      if (isTauriDesktop()) return;
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        try {
          sessionStorage.setItem('sms_dev_console_unlocked', 'true');
        } catch {}
        setActivePage('master-portal');
      }
    };
    window.addEventListener('keydown', handleDevKeyDown);
    return () => window.removeEventListener('keydown', handleDevKeyDown);
  }, []);

  // Authentication Handlers
  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    loadProfile(authenticatedUser);
    setActivePage(!isTauriDesktop() ? 'master-portal' : 'dashboard');
  };

  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setSession(null);
      setUser(null);
      setCurrentUserProfile(null);
      setActivePage(!isTauriDesktop() ? 'master-portal' : 'dashboard');
    }
  };

  // Navigation Handler with Notification Read Tracking
  const handleNavigate = (page) => {
    // Strictly forbid navigating to master-portal inside Desktop EXE
    if (isTauriDesktop() && page === 'master-portal') {
      setActivePage('dashboard');
      return;
    }
    if (page === 'notifications') {
      try {
        localStorage.setItem('sms_last_viewed_notifications', new Date().toISOString());
      } catch {}
      setCounts((prev) => ({ ...prev, notifications: 0 }));
    }
    setActivePage(page);
  };

  // Broadcast Notification Log Handler
  const handleBroadcast = (newNotice) => {
    setNotifications((prev) => {
      const updated = [newNotice, ...prev];
      try {
        localStorage.setItem('erp_broadcast_logs', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save notification logs:', err);
      }
      return updated;
    });
  };

  // 0. Dedicated Native Mobile Mode / Teacher Attendance Portal
  // If running inside Capacitor APK on mobile, or query ?portal=teacher, render teacher view immediately
  const isTeacherApp =
    Capacitor.isNativePlatform() ||
    (typeof window !== 'undefined' &&
      (window.location.search.includes('portal=teacher') || activePage === 'teacher-portal'));

  if (isTeacherApp) {
    return <TeacherAttendancePage />;
  }

  // 0.5. Parent Portal PWA Standalone Mode
  const isParentPortal =
    typeof window !== 'undefined' &&
    (window.location.search.includes('portal=parent') || activePage === 'parent-portal');

  if (isParentPortal) {
    return <ParentPortalPage />;
  }

  // 1. Loading Splash Screen
  if (authLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--navy-950)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          color: '#ffffff',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            backgroundColor: 'var(--navy-800)',
            border: '1px solid var(--gold-border)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--gold-primary)',
          }}
        >
          <GraduationCap size={30} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#cbd5e1' }}>
          <RefreshCw size={16} className="animate-spin" />
          <span>Verifying Administrative Session...</span>
        </div>
      </div>
    );
  }

  // 2. Lockout screen if trial has expired, license is suspended/locked/revoked, or system clock was tampered
  const isLockedOut =
    licenseStatus?.isTrialExpired ||
    licenseStatus?.isLocked ||
    licenseStatus?.status === 'trial_expired' ||
    licenseStatus?.status === 'suspended' ||
    licenseStatus?.status === 'revoked' ||
    licenseStatus?.status === 'locked' ||
    licenseStatus?.status === 'clock_tampered' ||
    (licenseStatus?.status === 'trial_active' && licenseStatus?.daysRemaining <= 0);

  if (isLockedOut) {
    return (
      <TrialExpiredLockout
        licenseStatus={licenseStatus}
        onReactivated={() => {
          checkLicense();
          refreshCounts();
        }}
      />
    );
  }

  // 3. Forced activation modal for desktop app if completely unlicensed
  if (isTauriDesktop() && licenseStatus?.status === 'unlicensed') {
    return (
      <SchoolActivationModal
        isOpen={true}
        isForced={true}
        onActivated={() => {
          reinitializeSupabaseClient();
          checkLicense();
          refreshCounts();
        }}
      />
    );
  }

  // 4. Route Protection: If unauthenticated, render Login Page
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
        {licenseStatus?.status === 'trial_active' && (
          <DraggableTrialCapsule
            daysRemaining={licenseStatus?.daysRemaining}
            onOpenActivation={() => setIsActivationModalOpen(true)}
          />
        )}
        <LoginPage onLoginSuccess={handleLoginSuccess} />
        <SchoolActivationModal
          isOpen={isActivationModalOpen}
          onClose={() => setIsActivationModalOpen(false)}
          onActivated={() => {
            reinitializeSupabaseClient();
            checkLicense();
            refreshCounts();
          }}
        />
      </div>
    );
  }

  const storedLic = getStoredLicense();
  const showTrialCapsule =
    licenseStatus?.status === 'trial_active' ||
    licenseStatus?.status === 'trial' ||
    storedLic?.status === 'trial_active' ||
    (storedLic?.daysRemaining !== undefined && storedLic?.daysRemaining <= 30);

  // 5. Render Protected Administrative ERP Console
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      {showTrialCapsule && (
        <DraggableTrialCapsule
          daysRemaining={licenseStatus?.daysRemaining || storedLic?.daysRemaining}
          onOpenActivation={() => setIsActivationModalOpen(true)}
        />
      )}

      <AppLayout
        activePage={activePage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        user={user}
        currentUserProfile={currentUserProfile}
        counts={counts}
      >
        <Suspense
          fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: '#f59e0b' }} />
                <span style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '0.02em', color: '#cbd5e1' }}>
                  Loading Workspace...
                </span>
              </div>
            </div>
          }
        >
          {activePage === 'dashboard' && (
            <DashboardPage
              onNavigate={handleNavigate}
              onAlertParent={() => handleNavigate('notifications')}
            />
          )}

          {activePage === 'students' && (
            <StudentsPage onRefreshCounts={refreshCounts} />
          )}

          {activePage === 'batches' && (
            <BatchesPage onRefreshCounts={refreshCounts} />
          )}

          {activePage === 'attendance' && (
            <AttendancePage onRefreshCounts={refreshCounts} />
          )}

          {activePage === 'parents' && (
            <ParentsPage
              onSendNotice={() => handleNavigate('notifications')}
              onRefreshCounts={refreshCounts}
            />
          )}

          {activePage === 'fees' && (
            <FeesPage onRefreshCounts={refreshCounts} />
          )}

          {activePage === 'exams' && (
            <ExamsPage />
          )}

          {activePage === 'notifications' && (
            <NotificationsPage
              notifications={notifications}
              onBroadcast={handleBroadcast}
              onRefreshCounts={refreshCounts}
            />
          )}

          {activePage === 'reports' && (
            <ReportsPage />
          )}

          {activePage === 'import' && (
            <BulkImportPage onNavigate={handleNavigate} onRefreshCounts={refreshCounts} />
          )}

          {activePage === 'settings' && (
            <SettingsPage
              currentUserProfile={currentUserProfile}
              onOpenLicenseModal={() => setIsActivationModalOpen(true)}
              onNavigate={handleNavigate}
            />
          )}

          {activePage === 'master-portal' && !isTauriDesktop() && (
            <MasterAdminPortalPage
              onNavigate={handleNavigate}
              user={user}
            />
          )}

          {activePage === 'parent-portal' && (
            <ParentPortalPage />
          )}
        </Suspense>
      </AppLayout>

      {/* Activation / License Management Modal */}
      <SchoolActivationModal
        isOpen={isActivationModalOpen}
        onClose={() => setIsActivationModalOpen(false)}
        onActivated={() => {
          reinitializeSupabaseClient();
          checkLicense();
          refreshCounts();
        }}
      />
    </div>
  );
}
