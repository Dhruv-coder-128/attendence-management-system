import React, { useState, useEffect } from 'react';
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

import {
  instituteSummary as initialSummary,
  initialBatches,
  initialStudents,
  initialTodayAttendance,
  initialParents,
  initialNotifications,
} from './data/demoData';
import { RefreshCw, GraduationCap } from 'lucide-react';

/**
 * Ruparel Attendance ERP Root Application Component
 */
export default function App() {
  // Supabase Auth Session State
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active View / Route State
  const [activePage, setActivePage] = useState('dashboard');

  // Academic Modules State (Preserved for Dashboard, Batches & Roll Call)
  const [summary, setSummary] = useState(initialSummary);
  const [batches, setBatches] = useState(initialBatches);
  const [students, setStudents] = useState(initialStudents);
  const [attendanceList, setAttendanceList] = useState(initialTodayAttendance);
  const [parents, setParents] = useState(initialParents);
  const [notifications, setNotifications] = useState(initialNotifications);

  // Initialize and subscribe to Supabase Auth State
  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setUser(initialSession?.user ?? null);
      setAuthLoading(false);
    }).catch((err) => {
      console.error('Session retrieval error:', err);
      setAuthLoading(false);
    });

    // 2. Listen for auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

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

  // Batch Actions
  const handleAddBatch = (newBatch) => {
    setBatches((prev) => [...prev, newBatch]);
    setSummary((prev) => ({
      ...prev,
      totalBatches: prev.totalBatches + 1,
    }));
  };

  // Attendance Live Interactions
  const handleUpdateStatus = (recordId, newStatus) => {
    setAttendanceList((prev) =>
      prev.map((rec) => {
        if (rec.id === recordId) {
          return {
            ...rec,
            status: newStatus,
            timeIn: newStatus === 'Present' || newStatus === 'Late' ? '06:30 AM' : '',
          };
        }
        return rec;
      })
    );
  };

  const handleMarkAllPresent = (batchId) => {
    setAttendanceList((prev) =>
      prev.map((rec) => {
        if (rec.batchId === batchId) {
          return {
            ...rec,
            status: 'Present',
            timeIn: '06:25 AM',
            remarks: 'Bulk roll call marked Present',
          };
        }
        return rec;
      })
    );
  };

  const handleSendAlerts = (batchId) => {
    setAttendanceList((prev) =>
      prev.map((rec) => {
        if (rec.batchId === batchId && (rec.status === 'Absent' || rec.status === 'Late')) {
          return { ...rec, guardianNotified: true };
        }
        return rec;
      })
    );

    const newBroadcast = {
      id: `notif-${Date.now()}`,
      title: 'Roll Call Absentee Alert Dispatch',
      message: `Automated Telegram alert sent to guardians for batch session on 09-Oct-2026.`,
      category: 'Attendance',
      channel: 'Telegram Bot',
      recipientsCount: attendanceList.filter((r) => r.batchId === batchId && r.status === 'Absent').length || 1,
      sentAt: 'Just now',
      status: 'Delivered',
      sender: 'Attendance Bot Gateway',
    };

    setNotifications((prev) => [newBroadcast, ...prev]);
  };

  // Notifications Broadcast Action
  const handleBroadcast = (newNotice) => {
    setNotifications((prev) => [newNotice, ...prev]);
  };

  // Reset demo dataset
  const handleResetDemo = () => {
    setSummary(initialSummary);
    setBatches(initialBatches);
    setStudents(initialStudents);
    setAttendanceList(initialTodayAttendance);
    setParents(initialParents);
    setNotifications(initialNotifications);
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

  // Current logged in admin profile
  const adminDisplayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Administrator';

  // 3. Render Protected Administrative ERP Console
  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
      user={user}
      counts={{
        students: students.length,
        batches: batches.length,
        notifications: notifications.length,
      }}
    >
      {activePage === 'dashboard' && (
        <DashboardPage
          summary={summary}
          attendanceList={attendanceList}
          batches={batches}
          students={students}
          onNavigate={setActivePage}
          onAlertParent={(rec) => {
            handleSendAlerts(rec.batchId);
            setActivePage('notifications');
          }}
        />
      )}

      {/* Real Supabase-connected Students Directory */}
      {activePage === 'students' && (
        <StudentsPage />
      )}

      {activePage === 'batches' && (
        <BatchesPage
          batches={batches}
          onAddBatch={handleAddBatch}
        />
      )}

      {activePage === 'attendance' && (
        <AttendancePage
          batches={batches}
          attendanceList={attendanceList}
          onUpdateStatus={handleUpdateStatus}
          onMarkAllPresent={handleMarkAllPresent}
          onSendAlerts={handleSendAlerts}
        />
      )}

      {activePage === 'parents' && (
        <ParentsPage
          parents={parents}
          onSendNotice={(parent) => setActivePage('notifications')}
        />
      )}

      {activePage === 'notifications' && (
        <NotificationsPage
          notifications={notifications}
          onBroadcast={handleBroadcast}
        />
      )}

      {activePage === 'settings' && (
        <SettingsPage onResetDemo={handleResetDemo} />
      )}
    </AppLayout>
  );
}
