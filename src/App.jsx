import React, { useState } from 'react';
import AppLayout from './components/layout/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StudentsPage from './pages/StudentsPage';
import BatchesPage from './pages/BatchesPage';
import AttendancePage from './pages/AttendancePage';
import ParentsPage from './pages/ParentsPage';
import NotificationsPage from './pages/NotificationsPage';
import SettingsPage from './pages/SettingsPage';

import {
  instituteSummary as initialSummary,
  initialBatches,
  initialStudents,
  initialTodayAttendance,
  initialParents,
  initialNotifications,
} from './data/demoData';

/**
 * Ruparel Attendence ERP Root Application Component
 */
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [currentUser, setCurrentUser] = useState({
    name: 'Dr. S. Nair',
    role: 'Academic Director',
    email: 'director@vanguard.edu',
  });
  const [activePage, setActivePage] = useState('dashboard');

  // Core ERP Reactive State
  const [summary, setSummary] = useState(initialSummary);
  const [batches, setBatches] = useState(initialBatches);
  const [students, setStudents] = useState(initialStudents);
  const [attendanceList, setAttendanceList] = useState(initialTodayAttendance);
  const [parents, setParents] = useState(initialParents);
  const [notifications, setNotifications] = useState(initialNotifications);

  // Authentication Handlers
  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setActivePage('dashboard');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  // Student Actions
  const handleAddStudent = (newStudent) => {
    setStudents((prev) => [newStudent, ...prev]);
    setSummary((prev) => ({
      ...prev,
      totalEnrolled: prev.totalEnrolled + 1,
    }));
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
    // Flag notified guardians and append to notifications queue
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

  // Reset to original demo data
  const handleResetDemo = () => {
    setSummary(initialSummary);
    setBatches(initialBatches);
    setStudents(initialStudents);
    setAttendanceList(initialTodayAttendance);
    setParents(initialParents);
    setNotifications(initialNotifications);
  };

  // If user is logged out, render the Login Screen
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Render the ERP Main Workspace
  return (
    <AppLayout
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
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

      {activePage === 'students' && (
        <StudentsPage
          students={students}
          batches={batches}
          onAddStudent={handleAddStudent}
        />
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
