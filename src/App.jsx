import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import BatchesPage from './pages/BatchesPage';
import AttendancePage from './pages/AttendancePage';
import ParentsPage from './pages/ParentsPage';
import FeesPage from './pages/FeesPage';
import ExamsPage from './pages/ExamsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import BulkImportPage from './pages/BulkImportPage';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { fetchUserProfile, hasPermission, getFallbackOwnerProfile } from './lib/authService';
import { RefreshCw, GraduationCap } from 'lucide-react';

/**
 * Ruparel Attendance ERP Root Application Component
 * 100% Real Database Connected — Zero Mock Data Dependencies
 * Integrates RBAC (Owner, Admin, Moderator) and Phase 5 Exams & Fees
 */
export default function App() {
  // Supabase Auth Session State
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active View / Navigation State
  const [activePage, setActivePage] = useState('dashboard');

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

      setCounts({
        students: finalStudents,
        batches: finalBatches,
        notifications: notifications.length,
      });
    } catch (err) {
      console.warn('Count refresh encountered issue:', err);
    }
  }, [notifications.length]);

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
      console.warn('Error loading user profile, falling back to owner session:', err);
      setCurrentUserProfile(getFallbackOwnerProfile(authUser));
    }
  }, []);

  // Initialize and subscribe to Supabase Auth State
  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    // 1. Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        setSession(initialSession);
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        if (currentUser) {
          loadProfile(currentUser);
        }
        setAuthLoading(false);
      })
      .catch((err) => {
        console.error('Session retrieval error:', err);
        setAuthLoading(false);
      });

    // 2. Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
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
      subscription?.unsubscribe();
    };
  }, [loadProfile]);

  // Refresh counts when user is authenticated or active page changes
  useEffect(() => {
    if (user) {
      refreshCounts();
    }
  }, [user, activePage, refreshCounts]);

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
      setSession(null);
      setUser(null);
      setCurrentUserProfile(null);
      setActivePage('dashboard');
    }
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
          <span>Verifying Administrative Session with Supabase...</span>
        </div>
      </div>
    );
  }

  // 2. Route Protection: If unauthenticated, render Login Page
  if (!user) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // 3. Render Protected Administrative ERP Console
  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
      user={user}
      currentUserProfile={currentUserProfile}
      counts={counts}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          onNavigate={setActivePage}
          onAlertParent={() => setActivePage('notifications')}
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
          onSendNotice={() => setActivePage('notifications')}
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
        />
      )}

      {activePage === 'import' && (
        <BulkImportPage onNavigate={setActivePage} onRefreshCounts={refreshCounts} />
      )}

      {activePage === 'settings' && (
        <SettingsPage currentUserProfile={currentUserProfile} />
      )}
    </AppLayout>
  );
}
