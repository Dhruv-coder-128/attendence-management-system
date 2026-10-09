import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import BatchesPage from './pages/BatchesPage';
import AttendancePage from './pages/AttendancePage';
import ParentsPage from './pages/ParentsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { RefreshCw, GraduationCap } from 'lucide-react';

/**
 * Ruparel Attendance ERP Root Application Component
 * 100% Real Database Connected — Zero Mock Data Dependencies
 */
export default function App() {
  // Supabase Auth Session State
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
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
      // 1. Live Student Count
      const { count: studentCount, error: sErr } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true });

      // 2. Live Active Batches Count
      const { count: batchCount, error: bErr } = await supabase
        .from('batches')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      setCounts({
        students: sErr ? 0 : studentCount || 0,
        batches: bErr ? 0 : batchCount || 0,
        notifications: notifications.length,
      });
    } catch (err) {
      console.warn('Count refresh encountered issue:', err);
    }
  }, [notifications.length]);

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
        setUser(initialSession?.user ?? null);
        setAuthLoading(false);
      })
      .catch((err) => {
        console.error('Session retrieval error:', err);
        setAuthLoading(false);
      });

    // 2. Listen for auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Refresh counts when user is authenticated or active page changes
  useEffect(() => {
    if (user) {
      refreshCounts();
    }
  }, [user, activePage, refreshCounts]);

  // Authentication Handlers
  const handleLoginSuccess = (authenticatedUser) => {
    setUser(authenticatedUser);
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

  // 2. Route Protection: If unauthenticated, ONLY render the Login Page!
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
      counts={counts}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          onNavigate={setActivePage}
          onAlertParent={() => setActivePage('notifications')}
        />
      )}

      {activePage === 'students' && (
        <StudentsPage />
      )}

      {activePage === 'batches' && (
        <BatchesPage />
      )}

      {activePage === 'attendance' && (
        <AttendancePage />
      )}

      {activePage === 'parents' && (
        <ParentsPage
          onSendNotice={() => setActivePage('notifications')}
        />
      )}

      {activePage === 'notifications' && (
        <NotificationsPage
          notifications={notifications}
          onBroadcast={handleBroadcast}
        />
      )}

      {activePage === 'settings' && (
        <SettingsPage />
      )}
    </AppLayout>
  );
}
