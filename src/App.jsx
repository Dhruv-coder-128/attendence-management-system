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
const ParentPortalPage = lazy(() => import('./pages/ParentPortalPage'));

import { supabase, isSupabaseConfigured, reinitializeSupabaseClient, setStoredAuthUser } from './lib/supabase';
import { fetchUserProfile, hasPermission, getFallbackStaffProfile } from './lib/authService';
import { validateLicense, isTauriDesktop, getStoredLicense } from './lib/licenseService';
import SchoolActivationModal from './components/license/SchoolActivationModal';
import DraggableTrialCapsule from './components/license/DraggableTrialCapsule';
import TrialExpiredLockout from './components/license/TrialExpiredLockout';
import { RefreshCw, GraduationCap } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useSchoolDatabaseSync, resolveHubInfo } from './lib/useSchoolDatabaseSync';
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
  const [activePage, setActivePage] = useState(() => {
    if (Capacitor.isNativePlatform() || (typeof window !== 'undefined' && window.location.search.includes('portal=teacher'))) {
      return 'teacher-portal';
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
    // Periodic license heartbeat check every 10s to immediately enforce remote SaaS lock or timer expiry
    const timer = setInterval(() => {
      checkLicense();
    }, 10000);
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
    } catch {
      const role = authUser.app_metadata?.role || authUser.role || 'moderator';
      setCurrentUserProfile(getFallbackStaffProfile(authUser, role, authUser.app_metadata?.permissions));
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
          const sessionToUse = initialSession || null;
          const currentUser = sessionToUse?.user ?? null;

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
          setAuthLoading(false);
        });

      // 2. Listen for auth state changes
      const {
        data: { subscription } = {},
      } = supabase.auth.onAuthStateChange((_event, currentSession) => {
        clearTimeout(safetyTimer);
        const currentUser = currentSession?.user ?? null;

        setSession(currentSession || null);
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

  // Authentication Handlers
  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
    loadProfile(authenticatedUser);
    setActivePage('dashboard');
  };

  const handleLogout = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setStoredAuthUser(null);
      setSession(null);
      setUser(null);
      setCurrentUserProfile(null);
      setActivePage('dashboard');
    }
  };

  // Navigation Handler with Notification Read Tracking
  const handleNavigate = (page) => {
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

  // While the licence is missing/expired, the Wi-Fi hub also refuses roll call from teacher phones.
  const hubLocked = licenseStatus ? isTauriDesktop() && licenseStatus.ok === false : null;
  useEffect(() => {
    if (hubLocked === null || !isTauriDesktop()) return;
    resolveHubInfo(true)
      .then((hub) => fetch(`${hub.url}/api/local-hub?action=set_lock_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(hub.token ? { 'X-Hub-Token': hub.token } : {}) },
        body: JSON.stringify({ is_locked: hubLocked }),
      }))
      .catch(() => {});
  }, [hubLocked]);

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
          <span>Verifying Administrative Session &amp; License...</span>
        </div>
      </div>
    );
  }

  // 0. Dedicated Native Mobile Mode / Teacher Attendance Portal
  // Teachers use mobile APK strictly for attendance roll-call over local Wi-Fi.
  // Mobile APK NEVER shows licensing lockouts, trial expired screens, or floating timer capsules!
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

  const isDesktopExe = isTauriDesktop();

  // 1. Lockout screen if trial has expired, subscription validity ended, suspended/revoked, or hardware mismatch
  // Exclusively enforced on School PC (Desktop Windows EXE)
  const isLifetime = (licenseStatus?.daysRemaining >= 9000);
  const isExpiredByDays = !isLifetime && (licenseStatus?.daysRemaining !== undefined && licenseStatus.daysRemaining <= 0);
  const isExpiredByDate = !isLifetime && Boolean(licenseStatus?.trialEndsAt && new Date(licenseStatus.trialEndsAt).getTime() <= Date.now());

  // A fresh install ('unlicensed') gets the activation screen below, not the "expired" lock screen.
  const isLockedOut =
    isDesktopExe && licenseStatus?.status !== 'unlicensed' && (
      licenseStatus?.isTrialExpired ||
      licenseStatus?.isLocked ||
      licenseStatus?.status === 'trial_expired' ||
      licenseStatus?.status === 'suspended' ||
      licenseStatus?.status === 'revoked' ||
      licenseStatus?.status === 'locked' ||
      licenseStatus?.status === 'clock_tampered' ||
      licenseStatus?.status === 'cloned_copy_detected' ||
      licenseStatus?.status === 'hardware_mismatch' ||
      isExpiredByDays ||
      isExpiredByDate
    );

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

  // 2. Mandatory Non-Dismissible Activation Screen for Desktop EXE
  // If the PC app is unlicensed, absolutely NO access to Dashboard is permitted.
  if (isDesktopExe && licenseStatus?.status === 'unlicensed') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--navy-950)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SchoolActivationModal
          isOpen={true}
          isForced={true}
          onActivated={() => {
            reinitializeSupabaseClient();
            checkLicense();
            refreshCounts();
          }}
        />
      </div>
    );
  }

  // 3. Route Protection: If unauthenticated in School ERP mode, render Login Page
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
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
  
  // Floating timer capsule: ONLY shown on Desktop EXE during the initial 30-day evaluation trial.
  // Once licensed/paid, or when trial ends, the floating pill completely disappears from the screen.
  // Movable countdown: shown on the school PC for every time-limited key (10/30/180/365 days).
  const showTrialCapsule =
    isDesktopExe &&
    !isLockedOut &&
    Boolean(storedLic?.trialEndsAt) &&
    (licenseStatus?.daysRemaining || storedLic?.daysRemaining || 0) > 0 &&
    (licenseStatus?.daysRemaining || storedLic?.daysRemaining || 0) < 9000;

  // 5. Render Protected Administrative ERP Console (For Desktop EXE or School Preview)
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
