import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Users,
  Building,
  Plus,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
  RefreshCw,
  Send,
  Database,
  Bot,
  Lock,
  Unlock,
  Calendar,
  Sparkles,
  Phone,
  Mail,
  Edit,
  Server,
  HardDrive,
  Wifi,
  Smartphone,
  Download,
  Upload,
  Check,
  AlertTriangle,
  Layers,
  ArrowRight,
  UserCheck,
  UserX,
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl, isTauriDesktop, getStoredLicense, activateSchoolLicense } from '../lib/licenseService';
import { resolveHubInfo } from '../lib/useSchoolDatabaseSync';
import { CANONICAL_COURSES, CANONICAL_BATCHES, CANONICAL_STUDENTS } from '../data/canonicalSchoolData';

const MASTER_DEV_PIN = '8866';
const DEVELOPER_EMAIL = 'dushah2007@gmail.com';
const STORAGE_REGISTRY_KEY = 'sms_saas_clients_registry';

const DEFAULT_SAMPLE_CLIENTS = [
  {
    id: 'SMS-SCH-001',
    schoolName: 'Noble Academy',
    contactPerson: 'Principal Sharma',
    email: 'principal@nobleschool.org',
    phone: '+91 9876543210',
    licenseKey: 'SMS-NOBLE-30D-89XK7',
    status: 'trial_active',
    storageMode: 'offline',
    daysRemaining: 28,
    trialStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    totalStudents: 100,
    botUsername: 'NobleAcademyBot',
    notes: 'Primary Client Cohort (100 Students)',
  },
  {
    id: 'SMS-SCH-002',
    schoolName: 'Saraswati Vidhyalay',
    contactPerson: 'Director Patel',
    email: 'info@saraswati.edu',
    phone: '+91 9823456789',
    licenseKey: 'SMS-SARASWATI-1Y-3M4N9',
    status: 'licensed',
    storageMode: 'offline',
    daysRemaining: 340,
    trialStartedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 340 * 24 * 60 * 60 * 1000).toISOString(),
    totalStudents: 100,
    botUsername: 'SaraswatiVidhyalayBot',
    notes: 'Licensed Client Cohort',
  },
  {
    id: 'SMS-SCH-003',
    schoolName: 'Green Valley International',
    contactPerson: 'Admin Mehta',
    email: 'admin@greenvalley.com',
    phone: '+91 9811223344',
    licenseKey: 'SMS-GREENVALLEY-TRIAL-01',
    status: 'trial_expired',
    storageMode: 'cloud',
    daysRemaining: 0,
    trialStartedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    totalStudents: 100,
    botUsername: '',
    notes: 'Awaiting renewal fee payment',
  },
];

export default function MasterAdminPortalPage({ onNavigate, user }) {
  // Navigation tabs in Admin Control Center: 'licenses' | 'database' | 'attendance' | 'telegram' | 'diagnostics'
  const [activeTab, setActiveTab] = useState('licenses');

  // Security Access State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedAuth = sessionStorage.getItem('sms_master_portal_auth');
      if (savedAuth === 'true') return true;
      if (user?.email?.toLowerCase() === DEVELOPER_EMAIL) return true;
    }
    return false;
  });

  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState('');
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  }, []);

  // Action Loading spinner
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Clients Registry State
  const [clients, setClients] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_REGISTRY_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_SAMPLE_CLIENTS;
    } catch {
      return DEFAULT_SAMPLE_CLIENTS;
    }
  });

  // Modal / Key Generator Form State
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDuration, setNewDuration] = useState('30');
  const [newCustomDays, setNewCustomDays] = useState('45');
  const [newStorageMode, setNewStorageMode] = useState('offline');
  const [newBotUsername, setNewBotUsername] = useState('');

  // Edit Days Modal State
  const [editingClient, setEditingClient] = useState(null);
  const [manualDaysInput, setManualDaysInput] = useState('30');

  // Full Client Edit Modal State
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [editingClientData, setEditingClientData] = useState(null);

  // Live Database Inspector Stats
  const [dbStats, setDbStats] = useState({
    totalStudents: 0,
    totalBatches: 0,
    totalCourses: 0,
    todayAttendanceRecords: 0,
    presentCount: 0,
    absentCount: 0,
    pendingCount: 0,
    storageEngine: 'IndexedDB & SQLite (Offline Zero-Cloud)',
  });

  // Wi-Fi Hub Diagnostics State
  const [hubDiagnostics, setHubDiagnostics] = useState({
    url: 'http://127.0.0.1:5173',
    localIp: '127.0.0.1',
    port: 5173,
    otp: '---',
    registeredDevicesCount: 0,
    running: false,
  });

  // Telegram Config State
  const [telegramConfig, setTelegramConfig] = useState({
    botToken: localStorage.getItem('sms_admin_telegram_bot_token') || '',
    chatId: localStorage.getItem('sms_admin_telegram_chat_id') || '',
    broadcastPrefix: '🏫 Noble Academy Alerts:',
  });

  // Save clients to localStorage whenever updated
  const saveClients = (updatedList) => {
    setClients(updatedList);
    try {
      localStorage.setItem(STORAGE_REGISTRY_KEY, JSON.stringify(updatedList));
    } catch (e) {
      console.warn('Failed to save clients:', e);
    }
  };

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput.trim() === MASTER_DEV_PIN || pinInput.trim() === '8866') {
      setIsAuthenticated(true);
      sessionStorage.setItem('sms_master_portal_auth', 'true');
      setPinError('');
    } else {
      setPinError('Invalid Master Developer Security PIN. (Default is 8866)');
    }
  };

  // Fetch Live Database Metrics
  const fetchLiveStats = useCallback(async () => {
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const { count: sCount } = await supabase.from('students').select('id', { count: 'exact', head: true });
      const { count: bCount } = await supabase.from('batches').select('id', { count: 'exact', head: true });
      const { count: cCount } = await supabase.from('courses').select('id', { count: 'exact', head: true });
      const { data: attData } = await supabase.from('attendance').select('id, status').eq('date', todayIso);

      const records = attData || [];
      const present = records.filter((r) => r.status === 'Present').length;
      const absent = records.filter((r) => r.status === 'Absent' || r.status === 'Late').length;
      const enrolled = sCount || 100;
      const pending = Math.max(0, enrolled - (present + absent));

      setDbStats({
        totalStudents: enrolled,
        totalBatches: bCount || 5,
        totalCourses: cCount || 5,
        todayAttendanceRecords: records.length,
        presentCount: present,
        absentCount: absent,
        pendingCount: pending,
        storageEngine: isTauriDesktop() ? 'Offline SQLite / IndexedDB Local Storage' : 'Supabase Cloud PostgreSQL',
      });
    } catch (err) {
      console.warn('Failed to query DB inspector stats:', err);
    }
  }, []);

  // Fetch Hub Diagnostics
  const fetchHubDiagnostics = useCallback(async () => {
    try {
      const info = await resolveHubInfo(true);
      if (info) {
        setHubDiagnostics({
          url: info.url || 'http://127.0.0.1:5173',
          localIp: info.localIp || '127.0.0.1',
          port: info.port || 5173,
          otp: info.otp || '---',
          registeredDevicesCount: info.registeredDevicesCount || 0,
          running: info.running ?? true,
        });
      }
    } catch (err) {
      console.warn('Could not query hub info:', err);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchLiveStats();
      fetchHubDiagnostics();
    }
  }, [isAuthenticated, fetchLiveStats, fetchHubDiagnostics]);

  // Generates cryptographic license key (e.g. SMS-NOBLE-30D-89XK)
  const generateCryptographicKey = (schoolName, durationDays) => {
    const slug = schoolName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SCH';
    const durCode = durationDays === 9999 ? 'LIFE' : `${durationDays}D`;
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SMS-${slug}-${durCode}-${randomChars}`;
  };

  const handleCreateNewClient = () => {
    if (!newSchoolName.trim()) {
      alert('School / Client Name is required.');
      return;
    }

    const durationDays =
      newDuration === 'lifetime'
        ? 9999
        : newDuration === 'custom'
        ? parseInt(newCustomDays, 10) || 30
        : parseInt(newDuration, 10);

    const generatedKey = generateCryptographicKey(newSchoolName, durationDays);
    const now = new Date();
    const trialEnds = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    const newClientObj = {
      id: `SMS-SCH-${String(clients.length + 1).padStart(3, '0')}`,
      schoolName: newSchoolName.trim(),
      contactPerson: newContactPerson.trim() || 'Principal / Administrator',
      email: newEmail.trim(),
      phone: newPhone.trim(),
      licenseKey: generatedKey,
      status: durationDays === 9999 ? 'licensed' : 'trial_active',
      storageMode: newStorageMode,
      daysRemaining: durationDays,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      totalStudents: 100,
      botUsername: newBotUsername.trim().replace(/^@/, ''),
      notes: `Generated on ${now.toLocaleDateString()}`,
    };

    const updated = [newClientObj, ...clients];
    saveClients(updated);

    // Reset Form
    setNewSchoolName('');
    setNewContactPerson('');
    setNewEmail('');
    setNewPhone('');
    setNewDuration('30');
    setNewBotUsername('');
    setIsNewClientModalOpen(false);

    showToast(`✓ Generated license key for ${newClientObj.schoolName}: ${generatedKey}`);
  };

  const handleExtendTrial = (clientId, extraDays) => {
    const target = clients.find((c) => c.id === clientId);
    const updated = clients.map((c) => {
      if (c.id === clientId) {
        const curRemaining = Math.max(0, c.daysRemaining || 0);
        const newRemaining = extraDays === 9999 ? 9999 : curRemaining + extraDays;
        const newEndsAt = new Date(Date.now() + newRemaining * 24 * 60 * 60 * 1000).toISOString();
        return {
          ...c,
          daysRemaining: newRemaining,
          trialEndsAt: newEndsAt,
          status: extraDays === 9999 ? 'licensed' : 'trial_active',
        };
      }
      return c;
    });
    saveClients(updated);
    showToast(
      `✓ Extended ${target?.schoolName || 'school'} license by ${
        extraDays === 9999 ? 'Lifetime' : `+${extraDays} days`
      }`
    );
  };

  const handleToggleSuspend = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;

    const willSuspend = target.status !== 'suspended';
    const updated = clients.map((c) => {
      if (c.id === clientId) {
        return {
          ...c,
          status: willSuspend
            ? 'suspended'
            : (c.daysRemaining > 0 ? 'trial_active' : 'trial_expired'),
        };
      }
      return c;
    });
    saveClients(updated);

    // Instant Remote Kill-Switch Sync to Cloud Supabase
    if (supabase) {
      try {
        const licCode = 'LIC:' + (target.licenseKey || target.id);
        await supabase.from('courses').upsert({
          id: 'lic_' + target.id.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
          code: licCode,
          name: target.schoolName,
          level: 'License',
          description: JSON.stringify({
            status: willSuspend ? 'suspended' : 'licensed',
            isLocked: willSuspend,
            schoolId: target.id,
            schoolName: target.schoolName,
            licenseKey: target.licenseKey,
            daysRemaining: willSuspend ? 0 : (target.daysRemaining || 30),
            lockedAt: willSuspend ? new Date().toISOString() : null,
          }),
          is_active: !willSuspend,
        });
      } catch (err) {
        console.warn('Supabase remote lock sync error:', err);
      }
    }

    // Also notify local hub if reachable
    try {
      fetch('http://127.0.0.1:5173/api/local-hub?action=set_lock_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_locked: willSuspend }),
      }).catch(() => {});
    } catch {}

    showToast(
      willSuspend
        ? `🔒 ${target.schoolName} is now LOCKED remotely! (EXE & App will lock immediately)`
        : `✓ ${target.schoolName} UNLOCKED and restored successfully.`
    );
  };

  const handleDeleteClient = (clientId) => {
    if (!confirm('Are you sure you want to permanently remove this school from registry?')) return;
    const updated = clients.filter((c) => c.id !== clientId);
    saveClients(updated);
    showToast('✓ Client removed from registry.');
  };

  const handleApplyToThisPC = async (licenseKey) => {
    await activateSchoolLicense(licenseKey);
    showToast(`✓ Applied license ${licenseKey} directly to this workstation!`);
  };

  // Full Client Edit Save
  const handleSaveEditClient = () => {
    if (!editingClientData) return;
    const updated = clients.map((c) => (c.id === editingClientData.id ? editingClientData : c));
    saveClients(updated);
    setIsEditClientModalOpen(false);
    setEditingClientData(null);
    showToast('✓ Client settings updated successfully.');
  };

  // =========================================================================
  // CONTROL CENTER ACTIONS
  // =========================================================================

  // 1. Reseed 100 Canonical Students & 5 Batches
  const handleReseedCanonical100 = async () => {
    if (!confirm('Reseed database with 100 Canonical Students across 5 Batches (20 per batch)? This restores original school data.')) return;
    setIsActionLoading(true);
    try {
      await supabase.from('courses').upsert(CANONICAL_COURSES);
      await supabase.from('batches').upsert(CANONICAL_BATCHES);
      await supabase.from('students').upsert(CANONICAL_STUDENTS);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sms-db-mutation', { detail: { tableName: 'students', count: 100 } })
        );
      }
      showToast('✓ 100 Canonical Students & 5 Batches successfully reseeded into local database!');
      await fetchLiveStats();
    } catch (e) {
      showToast('⚠️ Reseed error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // 2. Force Hub Synchronization
  const handleForceHubSync = async () => {
    setIsActionLoading(true);
    try {
      const hub = await resolveHubInfo(true);
      const { data: batches } = await supabase.from('batches').select('*');
      const { data: students } = await supabase.from('students').select('*');
      const { data: courses } = await supabase.from('courses').select('*');
      const todayIso = new Date().toISOString().split('T')[0];
      const { data: attendance } = await supabase.from('attendance').select('*').eq('date', todayIso);

      const headers = { 'Content-Type': 'application/json' };
      if (hub.token) headers['X-Hub-Token'] = hub.token;

      const res = await fetch(`${hub.url}/api/local-hub?action=sync_school_data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          batches: batches || [],
          students: students || [],
          courses: courses || [],
          attendance: attendance || [],
          lastModified: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        showToast(`✓ Wi-Fi Hub Synced! (${students?.length || 0} students, ${attendance?.length || 0} attendance records)`);
      } else {
        showToast('⚠️ Hub sync responded with status: ' + res.status);
      }
      await fetchHubDiagnostics();
    } catch (e) {
      showToast('⚠️ Hub sync error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // 3. Mark All 100 Students Present Today
  const handleMasterMarkAllPresent = async () => {
    if (!confirm('Mark all 100 students across all 5 batches as PRESENT today?')) return;
    setIsActionLoading(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const records = (CANONICAL_STUDENTS || []).map((s) => ({
        student_id: s.id,
        admission_no: s.admission_no || s.id,
        roll_no: s.roll_no || null,
        batch_id: s.batch_id,
        date: todayIso,
        session_name: 'Regular',
        status: 'Present',
        time_in: '09:00',
        remarks: 'Admin Master Override (Present)',
        updated_at: new Date().toISOString(),
      }));

      await supabase.from('attendance').upsert(records, { onConflict: 'student_id,batch_id,date,session_name' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sms-db-mutation', { detail: { tableName: 'attendance', count: records.length } })
        );
      }
      showToast('✓ All 100 students marked Present today!');
      await fetchLiveStats();
    } catch (e) {
      showToast('⚠️ Attendance override error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // 4. Mark All 100 Students Absent Today
  const handleMasterMarkAllAbsent = async () => {
    if (!confirm('Mark all 100 students across all 5 batches as ABSENT today?')) return;
    setIsActionLoading(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      const records = (CANONICAL_STUDENTS || []).map((s) => ({
        student_id: s.id,
        admission_no: s.admission_no || s.id,
        roll_no: s.roll_no || null,
        batch_id: s.batch_id,
        date: todayIso,
        session_name: 'Regular',
        status: 'Absent',
        time_in: '09:00',
        remarks: 'Admin Master Override (Absent)',
        updated_at: new Date().toISOString(),
      }));

      await supabase.from('attendance').upsert(records, { onConflict: 'student_id,batch_id,date,session_name' });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sms-db-mutation', { detail: { tableName: 'attendance', count: records.length } })
        );
      }
      showToast('✓ All 100 students marked Absent today!');
      await fetchLiveStats();
    } catch (e) {
      showToast('⚠️ Attendance override error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // 5. Reset All 100 to Pending (Unmarked)
  const handleMasterResetToPending = async () => {
    if (!confirm("Reset today's roll call to PENDING for all 100 students? (Clears today's marked attendance)")) return;
    setIsActionLoading(true);
    try {
      const todayIso = new Date().toISOString().split('T')[0];
      await supabase.from('attendance').delete().eq('date', todayIso);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sms-db-mutation', { detail: { tableName: 'attendance', count: 0 } })
        );
      }
      showToast("✓ Today's attendance reset! All 100 students are now Pending.");
      await fetchLiveStats();
    } catch (e) {
      showToast('⚠️ Reset error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // 6. Export Full Database Backup (.smsdb)
  const handleExportFullBackup = async () => {
    try {
      const { data: batches } = await supabase.from('batches').select('*');
      const { data: students } = await supabase.from('students').select('*');
      const { data: courses } = await supabase.from('courses').select('*');
      const { data: attendance } = await supabase.from('attendance').select('*');

      const backupObj = {
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        institution: 'SMS Student Management System',
        data: {
          batches: batches || [],
          students: students || [],
          courses: courses || [],
          attendance: attendance || [],
        },
      };

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SMS-School-Backup-${new Date().toISOString().split('T')[0]}.smsdb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('✓ Complete database backup (.smsdb) downloaded successfully!');
    } catch (e) {
      showToast('⚠️ Backup error: ' + e.message);
    }
  };

  // 7. Restore Database from File
  const handleRestoreFromFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsActionLoading(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = parsed.data || parsed;

      if (Array.isArray(data.courses) && data.courses.length > 0) {
        await supabase.from('courses').upsert(data.courses);
      }
      if (Array.isArray(data.batches) && data.batches.length > 0) {
        await supabase.from('batches').upsert(data.batches);
      }
      if (Array.isArray(data.students) && data.students.length > 0) {
        await supabase.from('students').upsert(data.students);
      }
      if (Array.isArray(data.attendance) && data.attendance.length > 0) {
        await supabase.from('attendance').upsert(data.attendance);
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('sms-db-mutation', { detail: { tableName: 'all', count: 1 } })
        );
      }
      showToast('✓ Database restored successfully from backup file!');
      await fetchLiveStats();
    } catch (e) {
      showToast('⚠️ Restore failed: ' + e.message);
    } finally {
      setIsActionLoading(false);
      event.target.value = '';
    }
  };

  // 8. Regenerate Pairing OTP
  const handleRegenerateOtp = async () => {
    try {
      const hub = await resolveHubInfo();
      const res = await fetch(`${hub.url}/api/local-hub?action=regenerate_otp`);
      if (res.ok) {
        const data = await res.json();
        setHubDiagnostics((prev) => ({ ...prev, otp: data.otp || '---' }));
        showToast('✓ New 6-Digit Teacher Pairing Code generated: ' + data.otp);
      }
    } catch (e) {
      showToast('⚠️ OTP regeneration error: ' + e.message);
    }
  };

  // 9. Save Telegram Config
  const handleSaveTelegram = () => {
    try {
      localStorage.setItem('sms_admin_telegram_bot_token', telegramConfig.botToken.trim());
      localStorage.setItem('sms_admin_telegram_chat_id', telegramConfig.chatId.trim());
      showToast('✓ Telegram bot credentials saved to workstation storage!');
    } catch {}
  };

  // 10. Send Test Broadcast
  const handleSendTestBroadcast = async () => {
    if (!telegramConfig.botToken || !telegramConfig.chatId) {
      alert('Please configure both Telegram Bot Token and Chat ID first.');
      return;
    }
    setIsActionLoading(true);
    try {
      const res = await fetch(`https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramConfig.chatId,
          text: `🔔 SMS School Hub Live Test\nAcademic Session: ${new Date().toLocaleDateString()}\nStatus: Admin Control Center Active\nWorkstation: Connected & Verified.`,
        }),
      });
      if (res.ok) {
        showToast('✓ Test Telegram notification dispatched successfully!');
      } else {
        const errData = await res.json();
        showToast('⚠️ Telegram rejected message: ' + (errData.description || 'Check Bot Token/Chat ID'));
      }
    } catch (e) {
      showToast('⚠️ Telegram dispatch error: ' + e.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  // If Not Authenticated: Show Master Developer Security Gate
  if (!isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '75vh',
          padding: '20px',
        }}
      >
        <div
          className="erp-card"
          style={{
            maxWidth: '440px',
            width: '100%',
            padding: '36px 30px',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.12)',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '16px',
              backgroundColor: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
            }}
          >
            <ShieldCheck size={32} color="#2563eb" />
          </div>

          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--navy-950)', margin: '0 0 8px 0' }}>
            Admin Control Center
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px 0', lineHeight: 1.5 }}>
            Comprehensive administrative controls for <strong>School Management System</strong>. Enter your Master Developer Security PIN to unlock.
          </p>

          <form onSubmit={handlePinSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <Input
                label="Master Developer Security PIN"
                type="password"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN (Default: 8866)"
                autoFocus
              />
            </div>

            {pinError && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--status-absent-bg)',
                  border: '1px solid var(--status-absent-border)',
                  color: 'var(--status-absent)',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  textAlign: 'left',
                }}
              >
                <AlertCircle size={16} />
                <span>{pinError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={Unlock}
              onClick={handlePinSubmit}
              style={{ width: '100%', padding: '12px', fontSize: '14px', fontWeight: 700 }}
            >
              Unlock Admin Control Center
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Dashboard Overview Counts
  const totalSchools = clients.length;
  const activeSchools = clients.filter((c) => c.status === 'licensed' || c.status === 'trial_active').length;
  const trialSchools = clients.filter((c) => c.status === 'trial_active').length;
  const expiredSchools = clients.filter((c) => c.status === 'trial_expired' || c.status === 'suspended').length;

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '14px 22px',
            backgroundColor: '#0f172a',
            border: '1px solid #38bdf8',
            color: '#ffffff',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={18} color="#38bdf8" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-title">Admin Control Center</h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '12px',
                backgroundColor: 'var(--navy-900)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            >
              Super Admin Mode
            </span>
          </div>
          <p className="page-description">
            Complete institutional administration: Client Licenses, Storage Engine, 100-Student Reseed, Hub Sync, and Master Attendance Overrides.
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              fetchLiveStats();
              fetchHubDiagnostics();
              showToast('✓ Admin Control Center refreshed!');
            }}
            disabled={isActionLoading}
          >
            Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsNewClientModalOpen(true)}
          >
            + Generate License
          </Button>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          padding: '6px',
          backgroundColor: '#f1f5f9',
          borderRadius: '12px',
          marginBottom: '20px',
          overflowX: 'auto',
          border: '1px solid #e2e8f0',
        }}
      >
        {[
          { id: 'licenses', label: 'Client Licenses', icon: KeyRound },
          { id: 'database', label: 'Database & Storage', icon: Database },
          { id: 'attendance', label: 'Attendance Override', icon: Calendar },
          { id: 'telegram', label: 'Telegram & Alerts', icon: Bot },
          { id: 'diagnostics', label: 'Diagnostics & Wi-Fi Hub', icon: Server },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 600,
                color: isActive ? '#ffffff' : '#64748b',
                backgroundColor: isActive ? 'var(--navy-900)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CLIENT LICENSES & SAAS MANAGEMENT                                */}
      {/* ========================================================================= */}
      {activeTab === 'licenses' && (
        <div>
          {/* Overview Cards */}
          <div className="stats-grid" style={{ marginBottom: '20px' }}>
            <div className="erp-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Schools
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--navy-950)', marginTop: '4px' }}>
                {totalSchools}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Configured client registries
              </div>
            </div>

            <div className="erp-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Active / Licensed
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--status-present)', marginTop: '4px' }}>
                {activeSchools}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Full institute access active
              </div>
            </div>

            <div className="erp-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Free Evaluation
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
                {trialSchools}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Evaluation period running
              </div>
            </div>

            <div className="erp-card" style={{ padding: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Expired / Suspended
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: expiredSchools > 0 ? 'var(--status-absent)' : 'var(--navy-700)', marginTop: '4px' }}>
                {expiredSchools}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Locked out / fee due
              </div>
            </div>
          </div>

          {/* Client Registry Table */}
          <div className="erp-card" style={{ padding: '0', overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--bg-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Building size={18} color="var(--navy-900)" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  School Licenses ({clients.length})
                </h3>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Direct activation &amp; control
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-subtle)' }}>
                  <tr>
                    <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>School &amp; Contact</th>
                    <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>License Key</th>
                    <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Days Left</th>
                    <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700, textAlign: 'right' }}>Controls</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => {
                    const isExpired = client.status === 'trial_expired' || client.daysRemaining <= 0;
                    const isSuspended = client.status === 'suspended';

                    return (
                      <tr key={client.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--navy-950)' }}>{client.schoolName}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            <span>{client.contactPerson}</span>
                            {client.phone && <span>&bull; {client.phone}</span>}
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <code style={{ padding: '2px 6px', backgroundColor: '#f1f5f9', borderRadius: '4px', fontSize: '11px', fontWeight: 700 }}>
                              {client.licenseKey}
                            </code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(client.licenseKey);
                                showToast(`✓ Copied ${client.licenseKey} to clipboard`);
                              }}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px' }}
                              title="Copy License Key"
                            >
                              <Copy size={13} color="#64748b" />
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px' }}>
                          {isSuspended ? (
                            <Badge variant="absent">Suspended</Badge>
                          ) : client.status === 'licensed' ? (
                            <Badge variant="present">Full License</Badge>
                          ) : isExpired ? (
                            <Badge variant="absent">Expired</Badge>
                          ) : (
                            <Badge variant="late">Trial ({client.daysRemaining}d)</Badge>
                          )}
                        </td>

                        <td style={{ padding: '12px 16px', fontWeight: 700, color: isExpired ? 'var(--status-absent)' : 'var(--navy-950)' }}>
                          {client.daysRemaining >= 9000 ? 'Lifetime' : `${client.daysRemaining} days`}
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleExtendTrial(client.id, 7)}
                              title="Extend +7 Days"
                            >
                              +7d
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleExtendTrial(client.id, 30)}
                              title="Extend +30 Days"
                            >
                              +30d
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => handleExtendTrial(client.id, 365)}
                              title="Extend +1 Year"
                            >
                              +1yr
                            </Button>
                            <Button
                              variant="primary"
                              size="xs"
                              onClick={() => handleExtendTrial(client.id, 9999)}
                              title="Make Lifetime License"
                            >
                              Lifetime
                            </Button>
                            <Button
                              variant={isSuspended ? 'success' : 'danger'}
                              size="xs"
                              onClick={() => handleToggleSuspend(client.id)}
                            >
                              {isSuspended ? 'Unlock' : 'Lock'}
                            </Button>
                            <Button
                              variant="outline"
                              size="xs"
                              icon={Sparkles}
                              onClick={() => handleApplyToThisPC(client.licenseKey)}
                              title="Apply this license to current PC"
                            >
                              Use
                            </Button>
                            <button
                              onClick={() => handleDeleteClient(client.id)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#94a3b8' }}
                              title="Delete Client"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DATABASE & STORAGE CONTROLS                                       */}
      {/* ========================================================================= */}
      {activeTab === 'database' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Live Database Inspector */}
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HardDrive size={20} color="var(--navy-900)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)' }}>
                  Workstation Database Status
                </h3>
              </div>
              <Badge variant="present">{dbStats.storageEngine}</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Total Enrolled</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{dbStats.totalStudents}</div>
                <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>Canonical Roster (100)</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Active Batches</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{dbStats.totalBatches}</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>5 Standard Cohorts</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Today Present</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{dbStats.presentCount}</div>
                <div style={{ fontSize: '11px', color: '#059669', marginTop: '2px' }}>Marked present today</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Today Absent</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>{dbStats.absentCount}</div>
                <div style={{ fontSize: '11px', color: '#dc2626', marginTop: '2px' }}>Marked absent or late</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Pending Roll Call</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>{dbStats.pendingCount}</div>
                <div style={{ fontSize: '11px', color: '#d97706', marginTop: '2px' }}>Unmarked students</div>
              </div>
            </div>

            {/* Powerful Action Buttons Grid */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '12px' }}>
                One-Click Administrative Actions
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                {/* 1. Reseed 100 Students */}
                <div style={{ padding: '14px', border: '1px solid #cbd5e1', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>1-Click 100-Student Reseed</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                      Restores all 100 canonical students and 5 standard cohorts into local database.
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Sparkles}
                    onClick={handleReseedCanonical100}
                    disabled={isActionLoading}
                    style={{ marginTop: '12px' }}
                  >
                    Reseed 100 Students
                  </Button>
                </div>

                {/* 2. Force Hub Sync */}
                <div style={{ padding: '14px', border: '1px solid #cbd5e1', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>Force Local Wi-Fi Hub Sync</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                      Pushes latest students, cohorts, and today's attendance to the teacher mobile hub.
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Wifi}
                    onClick={handleForceHubSync}
                    disabled={isActionLoading}
                    style={{ marginTop: '12px' }}
                  >
                    Force Push to Hub
                  </Button>
                </div>

                {/* 3. Export Database Backup */}
                <div style={{ padding: '14px', border: '1px solid #cbd5e1', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>Full Database Backup (.smsdb)</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                      Downloads complete school snapshot including students, batches, and attendance.
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Download}
                    onClick={handleExportFullBackup}
                    style={{ marginTop: '12px' }}
                  >
                    Export .smsdb Backup
                  </Button>
                </div>

                {/* 4. Restore Database */}
                <div style={{ padding: '14px', border: '1px solid #cbd5e1', borderRadius: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>Restore Database from Backup</div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
                      Select a previously downloaded .smsdb or JSON file to restore institute data.
                    </div>
                  </div>
                  <label
                    style={{
                      marginTop: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      backgroundColor: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      color: '#0f172a',
                    }}
                  >
                    <Upload size={14} />
                    <span>Select Backup File</span>
                    <input type="file" accept=".smsdb,.json" onChange={handleRestoreFromFile} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ATTENDANCE MASTER OVERRIDE                                        */}
      {/* ========================================================================= */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={20} color="var(--navy-900)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)' }}>
                  Master Attendance Controls &amp; Overrides
                </h3>
              </div>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                Instant school-wide roll call control
              </span>
            </div>

            <div style={{ padding: '14px', borderRadius: '12px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '18px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e40af', marginBottom: '4px' }}>
                Active Session Invariant
              </div>
              <div style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.5 }}>
                Total Enrolled (<strong>{dbStats.totalStudents}</strong>) = Present (<strong>{dbStats.presentCount}</strong>) + Absent (<strong>{dbStats.absentCount}</strong>) + Pending (<strong>{dbStats.pendingCount}</strong>).
                Using these controls updates the database and immediately pushes to all connected teacher phones.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
              {/* Mark All Present */}
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#166534', fontWeight: 800, fontSize: '14px' }}>
                    <UserCheck size={18} />
                    <span>Mark All 100 Students Present</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#14532d', marginTop: '6px', lineHeight: 1.4 }}>
                    Instantly sets status to Present for all 5 cohorts (11-COM, 12-COM, FY, SY, TY). Pending becomes 0.
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleMasterMarkAllPresent}
                  disabled={isActionLoading}
                  style={{ marginTop: '14px', backgroundColor: '#15803d', borderColor: '#166534' }}
                >
                  ✓ Force Mark All 100 Present
                </Button>
              </div>

              {/* Mark All Absent */}
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b', fontWeight: 800, fontSize: '14px' }}>
                    <UserX size={18} />
                    <span>Mark All 100 Students Absent</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '6px', lineHeight: 1.4 }}>
                    Instantly sets status to Absent for all 5 cohorts (e.g. for unplanned institute closure or holiday).
                  </div>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleMasterMarkAllAbsent}
                  disabled={isActionLoading}
                  style={{ marginTop: '14px' }}
                >
                  ✗ Force Mark All 100 Absent
                </Button>
              </div>

              {/* Reset All to Pending */}
              <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: '#fffbeb', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400e', fontWeight: 800, fontSize: '14px' }}>
                    <Clock size={18} />
                    <span>Reset All to Pending (Unmarked)</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350f', marginTop: '6px', lineHeight: 1.4 }}>
                    Wipes today's attendance records so teacher phones show fresh 20 Pending for each batch.
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMasterResetToPending}
                  disabled={isActionLoading}
                  style={{ marginTop: '14px', borderColor: '#d97706', color: '#92400e' }}
                >
                  ↺ Reset All to Pending
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TELEGRAM & BROADCAST CONFIG                                       */}
      {/* ========================================================================= */}
      {activeTab === 'telegram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Bot size={20} color="var(--navy-900)" />
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)' }}>
                Telegram Bot &amp; Broadcast Setup
              </h3>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <Input
                label="Telegram Bot API Token"
                type="password"
                value={telegramConfig.botToken}
                onChange={(e) => setTelegramConfig({ ...telegramConfig, botToken: e.target.value })}
                placeholder="e.g. 7123456789:AAH..."
              />
              <Input
                label="Admin Telegram Chat / Channel ID"
                value={telegramConfig.chatId}
                onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                placeholder="e.g. -100123456789 or @NobleSchoolAlerts"
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                onClick={handleSaveTelegram}
              >
                Save Bot Credentials
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Send}
                onClick={handleSendTestBroadcast}
                disabled={isActionLoading}
              >
                Send Test Broadcast
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SYSTEM DIAGNOSTICS & LOCAL WI-FI HUB                              */}
      {/* ========================================================================= */}
      {activeTab === 'diagnostics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="erp-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={20} color="var(--navy-900)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--navy-950)' }}>
                  Local Wi-Fi Attendance Hub Diagnostics
                </h3>
              </div>
              <Badge variant={hubDiagnostics.running ? 'present' : 'absent'}>
                {hubDiagnostics.running ? 'Hub Active' : 'Offline'}
              </Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Local IP &amp; Port</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '4px', fontFamily: 'monospace' }}>
                  {hubDiagnostics.localIp}:{hubDiagnostics.port}
                </div>
                <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>School Wi-Fi Server</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Connected Phones</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                  {hubDiagnostics.registeredDevicesCount}
                </div>
                <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>Authorized Teacher Devices</div>
              </div>

              <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>6-Digit Pairing OTP</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '4px', letterSpacing: '2px' }}>
                  {hubDiagnostics.otp}
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>One-time setup code</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={handleRegenerateOtp}
              >
                Regenerate Pairing OTP
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Wifi}
                onClick={handleForceHubSync}
                disabled={isActionLoading}
              >
                Re-announce Hub on Subnet
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: GENERATE NEW CLIENT LICENSE                                       */}
      {/* ========================================================================= */}
      {isNewClientModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="erp-card"
            style={{
              maxWidth: '520px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--navy-900)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="#38bdf8" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>
                  Generate School License Key
                </h3>
              </div>
              <button
                onClick={() => setIsNewClientModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <Input
                label="School / Institution Name *"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="e.g. Modern High School"
                required
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input
                  label="Contact Person"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                  placeholder="e.g. Principal Sharma"
                />
                <Input
                  label="Phone / WhatsApp"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+91 9876543210"
                />
              </div>

              <Input
                label="Administrator Email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@school.org"
              />

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                  License Validity Duration
                </label>
                <select
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                  }}
                >
                  <option value="15">15 Days Free Trial</option>
                  <option value="30">30 Days Standard Evaluation</option>
                  <option value="60">60 Days Extended Pilot</option>
                  <option value="365">1 Year Full Commercial License</option>
                  <option value="lifetime">Lifetime Perpetual Access</option>
                </select>
              </div>
            </div>

            <div
              style={{
                padding: '14px 20px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <Button variant="outline" size="sm" onClick={() => setIsNewClientModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" icon={KeyRound} onClick={handleCreateNewClient}>
                Create License Key
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
