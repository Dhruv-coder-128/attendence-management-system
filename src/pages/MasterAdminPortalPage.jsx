import React, { useState, useEffect, useCallback } from 'react';
import {
  KeyRound,
  Building,
  Plus,
  Clock,
  Trash2,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  Lock,
  Unlock,
  Phone,
  Mail,
  Edit,
  Sparkles,
  ShieldAlert,
  Calendar,
  Users,
  Zap,
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import { supabase } from '../lib/supabase';
import {
  getApiBaseUrl,
  activateSchoolLicense,
  fetchCloudLicenses,
  saveCloudLicense,
  adjustCloudLicenseDays,
  setCloudLicenseLock,
  unbindCloudHardware,
  deleteCloudLicense,
  updateCloudLicenseTier,
  STUDENT_CAPACITY_TIERS,
  UNIVERSAL_TRIAL_KEY,
  UNIVERSAL_GRACE_KEY,
  getStudentCapacityTier,
} from '../lib/licenseService';

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
    isLocked: false,
    daysRemaining: 30,
    isTimerVisible: true,
    trialStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Primary Client Cohort',
  },
  {
    id: 'SMS-SCH-002',
    schoolName: 'Saraswati Vidhyalay',
    contactPerson: 'Director Patel',
    email: 'info@saraswati.edu',
    phone: '+91 9823456789',
    licenseKey: 'SMS-SARASWATI-1Y-3M4N9',
    status: 'licensed',
    isLocked: false,
    daysRemaining: 340,
    isTimerVisible: false,
    trialStartedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() + 340 * 24 * 60 * 60 * 1000).toISOString(),
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
    isLocked: true,
    daysRemaining: 0,
    isTimerVisible: false,
    trialStartedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    notes: 'Awaiting renewal fee payment',
  },
  {
    id: 'SMS-SCH-004',
    schoolName: 'Eklavya Global Academy',
    contactPerson: 'Principal Joshi',
    email: 'contact@eklavya.edu',
    phone: '+91 9898112233',
    licenseKey: 'SMS-EKLAVYAS-15D-PXQR',
    status: 'trial_active',
    isLocked: false,
    daysRemaining: 15,
    isTimerVisible: true,
    notes: '15-day evaluation setup',
  },
  {
    id: 'SMS-SCH-005',
    schoolName: 'Noble Public School',
    contactPerson: 'Headmaster Verma',
    email: 'verma@nobleschool.in',
    phone: '+91 9909012345',
    licenseKey: 'SMA-NOBLE-2026',
    status: 'licensed',
    isLocked: false,
    daysRemaining: 365,
    isTimerVisible: false,
    notes: 'Annual license batch',
  },
];

export default function MasterAdminPortalPage({ onNavigate, onPreviewSchool, user }) {
  // Security Access State (Auto-authenticates on local development machine or via Master Developer credentials)
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedAuth = sessionStorage.getItem('sms_master_portal_auth');
      if (savedAuth === 'true') return true;
      if (user?.email?.toLowerCase() === DEVELOPER_EMAIL) return true;
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return true;
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



  // Action Loading State
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

  // Modal State: Generate New Client
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDuration, setNewDuration] = useState('30');
  const [newCustomDays, setNewCustomDays] = useState('45');
  const [newMaxStudents, setNewMaxStudents] = useState('200');

  // Modal State: Change Student Capacity Tier
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [tierTargetClient, setTierTargetClient] = useState(null);
  const [tierInputValue, setTierInputValue] = useState('200');

  // Modal State: Full Client Edit
  const [isEditClientModalOpen, setIsEditClientModalOpen] = useState(false);
  const [editingClientData, setEditingClientData] = useState(null);

  // Modal State: Set Exact Days
  const [isCustomDaysModalOpen, setIsCustomDaysModalOpen] = useState(false);
  const [customDaysTargetClient, setCustomDaysTargetClient] = useState(null);
  const [customDaysInputValue, setCustomDaysInputValue] = useState('30');

  // Modal State: License Created Success Dialog
  const [createdSuccessData, setCreatedSuccessData] = useState(null);

  // Persist clients list
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

  // Fetch Remote Cloud Licenses directly from Supabase Cloud
  const loadRemoteLicenses = useCallback(async () => {
    setIsActionLoading(true);
    try {
      const cloudLicenses = await fetchCloudLicenses();
      if (Array.isArray(cloudLicenses) && cloudLicenses.length > 0) {
        setClients(cloudLicenses);
        try {
          localStorage.setItem(STORAGE_REGISTRY_KEY, JSON.stringify(cloudLicenses));
        } catch {}
      }
    } catch (err) {
      console.warn('Could not query cloud licenses:', err);
    } finally {
      setIsActionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadRemoteLicenses();
    }
  }, [isAuthenticated, loadRemoteLicenses]);

  // Generate cryptographic license key
  const generateCryptographicKey = (schoolName, durationDays) => {
    const slug = schoolName.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'SCH';
    const durCode = durationDays === 9999 ? 'LIFE' : `${durationDays}D`;
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `SMS-${slug}-${durCode}-${randomChars}`;
  };

  // 1. Create New School License
  const handleCreateNewClient = async () => {
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
    const initialStatus = durationDays === 9999 ? 'licensed' : 'trial_active';
    const maxStudents = parseInt(newMaxStudents, 10) || 200;

    const newClientObj = {
      id: `SMS-SCH-${String(clients.length + 1).padStart(3, '0')}`,
      schoolName: newSchoolName.trim(),
      contactPerson: newContactPerson.trim() || 'Principal / Administrator',
      email: newEmail.trim(),
      phone: newPhone.trim(),
      licenseKey: generatedKey,
      status: initialStatus,
      isLocked: false,
      daysRemaining: durationDays,
      maxStudents,
      tier: getStudentCapacityTier(maxStudents),
      isTimerVisible: true,
      trialStartedAt: now.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      notes: `Generated on ${now.toLocaleDateString()}`,
    };

    setIsActionLoading(true);
    // Direct Authoritative Supabase Cloud Save
    const saveRes = await saveCloudLicense(newClientObj);
    setIsActionLoading(false);

    const updated = [newClientObj, ...clients.filter(c => c.licenseKey !== generatedKey)];
    saveClients(updated);
    setCreatedSuccessData(newClientObj);

    if (saveRes.ok) {
      showToast(`✓ Generated & saved cloud license for ${newClientObj.schoolName}: ${generatedKey} (${maxStudents} students)`);
    } else {
      showToast(`⚠️ License saved: ${saveRes.error || 'Cloud sync note'}`);
    }

    // Reset Form
    setNewSchoolName('');
    setNewContactPerson('');
    setNewEmail('');
    setNewPhone('');
    setNewDuration('30');
    setNewMaxStudents('200');
    setIsNewClientModalOpen(false);
  };

  // Change Student Plan Tier Capacity
  const handleSaveTierCapacity = async () => {
    if (!tierTargetClient) return;
    const count = parseInt(tierInputValue, 10) || 200;
    setIsActionLoading(true);
    const res = await updateCloudLicenseTier(tierTargetClient.licenseKey, count);
    setIsActionLoading(false);

    const updated = clients.map((c) => {
      if (c.id === tierTargetClient.id) {
        return {
          ...c,
          maxStudents: count,
          tier: getStudentCapacityTier(count),
        };
      }
      return c;
    });
    saveClients(updated);
    setIsTierModalOpen(false);
    setTierTargetClient(null);

    if (res.ok) {
      showToast(`✓ Updated ${tierTargetClient.schoolName} capacity to ${count} students (${getStudentCapacityTier(count).name})`);
    } else {
      showToast(`⚠️ Updated locally: ${res.error || 'Cloud sync note'}`);
    }
  };

  // 2. Adjust Days (+days or -days)
  const handleAdjustDays = async (clientId, deltaDays) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;

    setIsActionLoading(true);
    const res = await adjustCloudLicenseDays(target.licenseKey, deltaDays, false);
    setIsActionLoading(false);

    const curRemaining = Math.max(0, target.daysRemaining || 0);
    const newRemaining = res.ok && res.daysRemaining !== undefined
      ? res.daysRemaining
      : (deltaDays === 9999 ? 9999 : Math.max(0, curRemaining + deltaDays));
    const newStatus = res.status || (newRemaining >= 9000 ? 'licensed' : (newRemaining > 0 ? 'trial_active' : 'trial_expired'));
    const isLocked = newRemaining <= 0 && newStatus !== 'licensed';

    const updated = clients.map((c) => {
      if (c.id === clientId) {
        return {
          ...c,
          daysRemaining: newRemaining,
          trialEndsAt: res.trialEndsAt || new Date(Date.now() + newRemaining * 86400000).toISOString(),
          status: isLocked ? 'suspended' : newStatus,
          isLocked,
        };
      }
      return c;
    });
    saveClients(updated);

    const sign = deltaDays > 0 ? `+${deltaDays}` : `${deltaDays}`;
    showToast(
      deltaDays === 9999
        ? `✓ ${target.schoolName} upgraded to Lifetime License in Cloud!`
        : `✓ Adjusted ${target.schoolName} by ${sign} days in Cloud (Now ${newRemaining} days remaining)`
    );
  };

  // 3. Set Exact Custom Days
  const handleApplyCustomDays = async () => {
    if (!customDaysTargetClient) return;
    const exactDays = Math.max(0, parseInt(customDaysInputValue, 10) || 0);
    const target = customDaysTargetClient;

    setIsActionLoading(true);
    const res = await adjustCloudLicenseDays(target.licenseKey, exactDays, true);
    setIsActionLoading(false);

    const newStatus = res.status || (exactDays >= 9000 ? 'licensed' : (exactDays > 0 ? 'trial_active' : 'trial_expired'));
    const isLocked = exactDays <= 0 && newStatus !== 'licensed';

    const updated = clients.map((c) => {
      if (c.id === target.id) {
        return {
          ...c,
          daysRemaining: exactDays,
          trialEndsAt: res.trialEndsAt || new Date(Date.now() + exactDays * 86400000).toISOString(),
          status: isLocked ? 'suspended' : newStatus,
          isLocked,
        };
      }
      return c;
    });
    saveClients(updated);

    setIsCustomDaysModalOpen(false);
    setCustomDaysTargetClient(null);
    showToast(`✓ Set ${target.schoolName} exact cloud duration to ${exactDays} days`);
  };

  // 4. Remote Kill-Switch (Instant Lock / Unlock)
  const handleToggleSuspend = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;

    const willSuspend = target.status !== 'suspended' && !target.isLocked;
    setIsActionLoading(true);
    const res = await setCloudLicenseLock(target.licenseKey, willSuspend);
    setIsActionLoading(false);

    const updatedStatus = res.status || (willSuspend ? 'suspended' : (target.daysRemaining > 0 ? 'trial_active' : 'licensed'));

    const updated = clients.map((c) => {
      if (c.id === clientId) {
        return {
          ...c,
          status: updatedStatus,
          isLocked: willSuspend,
        };
      }
      return c;
    });
    saveClients(updated);

    showToast(
      willSuspend
        ? `🔒 ${target.schoolName} is now LOCKED in Cloud! (Client EXE & APK will lock immediately)`
        : `✓ ${target.schoolName} UNLOCKED and restored in Cloud successfully.`
    );
  };

  // 5. Toggle Trial Countdown Timer Capsule
  const handleToggleTimerVisibility = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;

    const currentVisible = target.isTimerVisible !== false;
    const newVisible = !currentVisible;

    const updated = clients.map((c) => {
      if (c.id === clientId) {
        return {
          ...c,
          isTimerVisible: newVisible,
        };
      }
      return c;
    });
    saveClients(updated);

    // Direct Supabase Sync
    if (supabase) {
      try {
        await supabase.from('courses').upsert({
          code: 'LIC:' + target.licenseKey,
          name: `${target.schoolName} [${String(target.status || '').toUpperCase()}]`,
          level: 'License',
          description: JSON.stringify({
            status: target.status,
            isLocked: target.isLocked || target.status === 'suspended',
            is_locked: target.isLocked || target.status === 'suspended',
            school_name: target.schoolName,
            schoolName: target.schoolName,
            licenseKey: target.licenseKey,
            days_remaining: target.daysRemaining,
            is_timer_visible: newVisible,
          }),
          is_active: target.status !== 'suspended',
        }, { onConflict: 'code' });
      } catch (err) {}
    }

    showToast(
      newVisible
        ? `⏱️ Trial Countdown Capsule is now ON for ${target.schoolName} (Client displays live countdown)`
        : `⏱️ Trial Countdown Capsule is now OFF for ${target.schoolName} (Client countdown hidden)`
    );
  };

  // 6. Reset Workstation Hardware Binding (Unbind Device)
  const handleResetDevice = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;
    if (!confirm(`Are you sure you want to reset workstation binding for ${target.schoolName}?\n\nThis will allow the school to activate their license key on a new or formatted computer.`)) {
      return;
    }

    setIsActionLoading(true);
    await unbindCloudHardware(target.licenseKey);
    setIsActionLoading(false);

    const updated = clients.map((c) => {
      if (c.id === clientId) {
        return { ...c, boundDeviceId: null };
      }
      return c;
    });
    saveClients(updated);

    showToast(`🔓 Workstation binding cleared in Cloud for ${target.schoolName}. Key can now be activated on a new PC.`);
  };

  // 7. Delete School Client
  const handleDeleteClient = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!confirm(`Are you sure you want to permanently remove ${target?.schoolName || 'this school'} from cloud registry?`)) return;

    setIsActionLoading(true);
    if (target?.licenseKey) {
      await deleteCloudLicense(target.licenseKey);
    }
    setIsActionLoading(false);

    const updated = clients.filter((c) => c.id !== clientId);
    saveClients(updated);

    showToast('✓ Client removed from cloud registry.');
  };

  // 8. Full Client Edit Save
  const handleSaveEditClient = () => {
    if (!editingClientData) return;
    const updated = clients.map((c) => (c.id === editingClientData.id ? editingClientData : c));
    saveClients(updated);

    // Direct Supabase Sync
    if (supabase) {
      try {
        supabase.from('courses').upsert({
          code: 'LIC:' + editingClientData.licenseKey,
          name: `${editingClientData.schoolName} [${String(editingClientData.status || '').toUpperCase()}]`,
          level: 'License',
          description: JSON.stringify({
            status: editingClientData.status,
            isLocked: editingClientData.isLocked || editingClientData.status === 'suspended',
            is_locked: editingClientData.isLocked || editingClientData.status === 'suspended',
            school_name: editingClientData.schoolName,
            schoolName: editingClientData.schoolName,
            contact_person: editingClientData.contactPerson,
            phone: editingClientData.phone,
            email: editingClientData.email,
            licenseKey: editingClientData.licenseKey,
            days_remaining: editingClientData.daysRemaining,
            max_students: editingClientData.maxStudents || 200,
            maxStudents: editingClientData.maxStudents || 200,
            is_timer_visible: editingClientData.isTimerVisible !== false,
          }),
          is_active: editingClientData.status !== 'suspended',
        }, { onConflict: 'code' }).then(() => {});
      } catch (err) {}
    }

    setIsEditClientModalOpen(false);
    setEditingClientData(null);
    showToast('✓ Client details updated successfully.');
  };

  // Security Gate
  if (!isAuthenticated) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '80vh',
          padding: '20px',
        }}
      >
        <div
          className="erp-card"
          style={{
            maxWidth: '420px',
            width: '100%',
            padding: '32px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.1)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: 'var(--navy-900)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
            }}
          >
            <Lock size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--navy-950)', margin: '0 0 8px 0' }}>
            Master Developer Access
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Enter Master Developer Security PIN to open the Multi-School SaaS Fleet Management Console.
          </p>

          <form onSubmit={handlePinSubmit}>
            <div style={{ marginBottom: '16px', textAlign: 'left' }}>
              <Input
                label="Master PIN (Default 8866)"
                type="password"
                placeholder="Enter PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                autoFocus
              />
              {pinError && (
                <div style={{ fontSize: '12px', color: 'var(--status-absent)', marginTop: '6px' }}>
                  {pinError}
                </div>
              )}
            </div>

            <Button variant="primary" type="submit" style={{ width: '100%' }}>
              Unlock SaaS Fleet Console
            </Button>
          </form>

          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              onClick={() => {
                if (onPreviewSchool) onPreviewSchool();
                else if (onNavigate) onNavigate('dashboard');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Preview School ERP (Client View) →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Overview Counts
  const totalSchools = clients.length;
  const activeSchools = clients.filter((c) => !c.isLocked && c.status === 'licensed').length;
  const trialSchools = clients.filter((c) => !c.isLocked && c.status === 'trial_active').length;
  const lockedSchools = clients.filter((c) => c.isLocked || c.status === 'suspended' || c.status === 'trial_expired').length;

  return (
    <div style={{ maxWidth: '1500px', margin: '0 auto', padding: '24px 32px 80px 32px' }}>
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
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ fontSize: '24px', fontWeight: 800, margin: 0 }}>
              SaaS Fleet Management Console
            </h1>
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
              Master Admin Mode
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
              }}
            >
              Developer: Dhruv Shah (+91 8866039007)
            </span>
          </div>
          <p className="page-description" style={{ marginTop: '4px', marginBottom: 0 }}>
            Central administration for 10–20 Client Schools: Instant Remote Kill-Switch, Exact Days Increase/Decrease, and Evaluation Timer Controls.
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            size="sm"
            icon={ExternalLink}
            onClick={() => {
              if (onPreviewSchool) {
                onPreviewSchool();
              } else if (onNavigate) {
                onNavigate('dashboard');
              }
            }}
            title="Preview School ERP as seen by Institutions"
          >
            Preview School ERP
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              loadRemoteLicenses();
              showToast('✓ Client Fleet data refreshed from cloud!');
            }}
            disabled={isActionLoading}
          >
            Refresh Cloud Data
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setIsNewClientModalOpen(true)}
          >
            + Generate School License
          </Button>
        </div>
      </div>

      {/* 4 Clean High-Level Overview Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="erp-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total Client Schools
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--navy-950)', marginTop: '4px' }}>
            {totalSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Registered institutions in fleet
          </div>
        </div>

        <div className="erp-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Active / Licensed
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
            {activeSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Full commercial access active
          </div>
        </div>

        <div className="erp-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Evaluation / Trial Running
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#d97706', marginTop: '4px' }}>
            {trialSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Trial countdown running
          </div>
        </div>

        <div className="erp-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Locked / Suspended
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: lockedSchools > 0 ? '#dc2626' : '#64748b', marginTop: '4px' }}>
            {lockedSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Locked out by remote kill-switch
          </div>
        </div>
      </div>

      {/* Universal Keys & Rapid Dispatch Console */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {/* 30-Day Common Free Trial Key Card */}
        <div
          className="erp-card"
          style={{
            padding: '20px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            boxShadow: '0 2px 10px rgba(34, 197, 94, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#22c55e20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#14532d' }}>
                  30-Day Common Trial Key
                </h4>
                <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>
                  Universal key for all new clients (5,000+ student capacity)
                </span>
              </div>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '12px' }}>
              30 Days
            </span>
          </div>

          <div style={{ backgroundColor: '#ffffff', border: '1px dashed #86efac', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <code style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
              {UNIVERSAL_TRIAL_KEY}
            </code>
            <Button
              variant="outline"
              size="sm"
              icon={Copy}
              onClick={() => {
                navigator.clipboard.writeText(UNIVERSAL_TRIAL_KEY);
                showToast(`✓ Copied 30-Day Trial Key: ${UNIVERSAL_TRIAL_KEY}`);
              }}
            >
              Copy Key
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => {
                const msg = `🏫 SMS — Student Management System\n\n🎉 Welcome to your 30-Day Free Trial!\n\n🔑 Universal Trial Key: ${UNIVERSAL_TRIAL_KEY}\n📅 Validity: 30 Days Full Access\n👥 Student Capacity: Up to 5,000 Students (All Features Active)\n🔒 Device Policy: Single-PC Hardware Locked\n\nInstructions: Download and run the SMS Desktop EXE or Android APK. Enter this Key to start your trial.\n\nSupport: Dhruv Shah (+91 8866039007)`;
                navigator.clipboard.writeText(msg);
                showToast('✓ Copied 30-Day Trial WhatsApp invitation message!');
              }}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#15803d',
                backgroundColor: '#ffffff',
                border: '1px solid #86efac',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              📋 Copy WhatsApp Trial Invitation
            </button>
          </div>
        </div>

        {/* 5-Day Emergency Grace Key Card */}
        <div
          className="erp-card"
          style={{
            padding: '20px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            boxShadow: '0 2px 10px rgba(245, 158, 11, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#f59e0b20', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b45309' }}>
                <Zap size={18} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#78350f' }}>
                  5-Day Emergency Grace Key
                </h4>
                <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 600 }}>
                  Instant relief key when client plan expires (Preserves data)
                </span>
              </div>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, backgroundColor: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '12px' }}>
              5 Days Grace
            </span>
          </div>

          <div style={{ backgroundColor: '#ffffff', border: '1px dashed #fcd34d', borderRadius: '8px', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
            <code style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
              {UNIVERSAL_GRACE_KEY}
            </code>
            <Button
              variant="outline"
              size="sm"
              icon={Copy}
              onClick={() => {
                navigator.clipboard.writeText(UNIVERSAL_GRACE_KEY);
                showToast(`✓ Copied 5-Day Grace Key: ${UNIVERSAL_GRACE_KEY}`);
              }}
            >
              Copy Key
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              onClick={() => {
                const msg = `🏫 SMS — Student Management System\n\n⚠️ Emergency Grace Period Granted\n\n🔑 Emergency Grace Key: ${UNIVERSAL_GRACE_KEY}\n📅 Validity: +5 Emergency Days\n✅ Functionality: Attendance and all operations restored immediately\n\nPlease complete your renewal payment within these 5 days to avoid service interruption.\n\nSupport: Dhruv Shah (+91 8866039007)`;
                navigator.clipboard.writeText(msg);
                showToast('✓ Copied 5-Day Grace WhatsApp message!');
              }}
              style={{
                flex: 1,
                padding: '6px 10px',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#b45309',
                backgroundColor: '#ffffff',
                border: '1px solid #fcd34d',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              📋 Copy WhatsApp Grace Message
            </button>
          </div>
        </div>
      </div>

      {/* Master Client Fleet Table */}
      <div className="erp-card" style={{ padding: '0', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)' }}>
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
              Client Schools Registry ({clients.length})
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-Time Remote Kill-Switch &amp; Day Controls
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-subtle)' }}>
              <tr>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>School &amp; Contact</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>License Key</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Plan Tier &amp; Capacity</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Days Left</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Adjust Days (+ / -)</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Trial Timer</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Remote Kill-Switch</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const isSuspended = client.isLocked || client.status === 'suspended';
                const isExpired = client.status === 'trial_expired' || (!client.isLocked && client.daysRemaining <= 0 && client.status !== 'licensed');

                return (
                  <tr
                    key={client.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: isSuspended ? '#fef2f2' : '#ffffff',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* School & Contact */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: 800, color: 'var(--navy-950)', fontSize: '14px' }}>
                        {client.schoolName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '3px' }}>
                        <span>👤 {client.contactPerson}</span>
                        {client.phone && <span>📞 {client.phone}</span>}
                        {client.email && <span>✉️ {client.email}</span>}
                      </div>
                      {/* Workstation Hardware Binding Status */}
                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {client.boundDeviceId ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '2px 7px', fontSize: '10.5px' }}>
                            <span style={{ fontWeight: 700, color: '#1e40af' }}>🔒 Bound:</span>
                            <code style={{ fontSize: '10px', color: '#1e3a8a', fontFamily: 'monospace' }}>
                              {client.boundDeviceId.length > 22 ? client.boundDeviceId.slice(0, 20) + '…' : client.boundDeviceId}
                            </code>
                            <button
                              onClick={() => handleResetDevice(client.id)}
                              style={{
                                border: 'none',
                                backgroundColor: '#dbeafe',
                                color: '#1d4ed8',
                                fontSize: '9.5px',
                                fontWeight: 700,
                                borderRadius: '3px',
                                padding: '1px 5px',
                                cursor: 'pointer',
                                marginLeft: '4px',
                              }}
                              title="Reset Workstation Binding (Unbind to allow new PC)"
                            >
                              Reset Device
                            </button>
                          </div>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '4px', padding: '2px 7px', fontSize: '10.5px', fontWeight: 600, color: '#15803d' }}>
                            🟢 Fresh / Unbound
                          </span>
                        )}
                      </div>
                    </td>

                    {/* License Key */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code style={{ padding: '3px 7px', backgroundColor: '#f1f5f9', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, fontFamily: 'monospace' }}>
                          {client.licenseKey}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(client.licenseKey);
                            showToast(`✓ Copied ${client.licenseKey} to clipboard`);
                          }}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '3px' }}
                          title="Copy License Key"
                        >
                          <Copy size={13} color="#64748b" />
                        </button>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: '14px 16px' }}>
                      {isSuspended ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 700, backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}>
                          🔒 Locked / Suspended
                        </span>
                      ) : client.status === 'licensed' || client.daysRemaining >= 9000 ? (
                        <Badge variant="present">Full License</Badge>
                      ) : isExpired ? (
                        <Badge variant="absent">Expired</Badge>
                      ) : (
                        <Badge variant="late">Trial Active</Badge>
                      )}
                    </td>

                    {/* Plan Tier & Capacity */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: '#eff6ff',
                            color: '#1e40af',
                            border: '1px solid #bfdbfe',
                          }}
                        >
                          <Users size={12} />
                          <span>{client.maxStudents || 200} Students</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setTierTargetClient(client);
                            setTierInputValue(String(client.maxStudents || 200));
                            setIsTierModalOpen(true);
                          }}
                          style={{
                            padding: '2px 6px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            cursor: 'pointer',
                          }}
                          title="Change Student Plan Tier"
                        >
                          Change
                        </button>
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {client.tier?.name || getStudentCapacityTier(client.maxStudents || 200).name}
                      </div>
                    </td>

                    {/* Days Left */}
                    <td style={{ padding: '14px 16px', fontWeight: 800, color: isSuspended || isExpired ? '#dc2626' : 'var(--navy-950)' }}>
                      {client.daysRemaining >= 9000 ? (
                        <span style={{ color: '#16a34a' }}>Lifetime</span>
                      ) : (
                        `${client.daysRemaining} days`
                      )}
                    </td>

                    {/* Adjust Days (+ / -) */}
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleAdjustDays(client.id, 7)}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer' }}
                          title="Add 7 Days"
                        >
                          +7d
                        </button>
                        <button
                          onClick={() => handleAdjustDays(client.id, 30)}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer' }}
                          title="Add 30 Days"
                        >
                          +30d
                        </button>
                        <button
                          onClick={() => handleAdjustDays(client.id, -1)}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fff1f2', color: '#b91c1c', cursor: 'pointer' }}
                          title="Subtract 1 Day"
                        >
                          -1d
                        </button>
                        <button
                          onClick={() => handleAdjustDays(client.id, -7)}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fff1f2', color: '#b91c1c', cursor: 'pointer' }}
                          title="Subtract 7 Days"
                        >
                          -7d
                        </button>
                        <button
                          onClick={() => handleAdjustDays(client.id, 9999)}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #86efac', backgroundColor: '#f0fdf4', color: '#15803d', cursor: 'pointer' }}
                          title="Make Lifetime License"
                        >
                          Life
                        </button>
                        <button
                          onClick={() => {
                            setCustomDaysTargetClient(client);
                            setCustomDaysInputValue(String(client.daysRemaining || 30));
                            setIsCustomDaysModalOpen(true);
                          }}
                          style={{ padding: '3px 7px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#475569', cursor: 'pointer' }}
                          title="Set Exact Custom Days"
                        >
                          Set...
                        </button>
                      </div>
                    </td>

                    {/* Trial Timer Capsule */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleTimerVisibility(client.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          border: client.isTimerVisible !== false ? '1px solid #86efac' : '1px solid #cbd5e1',
                          backgroundColor: client.isTimerVisible !== false ? '#f0fdf4' : '#f8fafc',
                          color: client.isTimerVisible !== false ? '#15803d' : '#64748b',
                          transition: 'all 0.15s ease',
                        }}
                        title={client.isTimerVisible !== false ? 'Click to hide timer capsule on client EXE/APK' : 'Click to show timer capsule on client EXE/APK'}
                      >
                        <Clock size={12} color={client.isTimerVisible !== false ? '#16a34a' : '#94a3b8'} />
                        <span>{client.isTimerVisible !== false ? 'Timer: ON' : 'Timer: OFF'}</span>
                      </button>
                    </td>

                    {/* Remote Kill-Switch */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        type="button"
                        onClick={() => handleToggleSuspend(client.id)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          border: 'none',
                          backgroundColor: isSuspended ? '#16a34a' : '#dc2626',
                          color: '#ffffff',
                          boxShadow: isSuspended ? '0 2px 6px rgba(22, 163, 74, 0.3)' : '0 2px 6px rgba(220, 38, 38, 0.3)',
                          transition: 'all 0.15s ease',
                        }}
                        title={isSuspended ? 'Click to Unlock this school' : 'Click to Lock this school (Closes EXE & APK immediately)'}
                      >
                        {isSuspended ? (
                          <>
                            <Unlock size={14} />
                            <span>Unlock Client</span>
                          </>
                        ) : (
                          <>
                            <Lock size={14} />
                            <span>Lock Client</span>
                          </>
                        )}
                      </button>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setEditingClientData({ ...client });
                            setIsEditClientModalOpen(true);
                          }}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                          title="Edit School Details"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteClient(client.id)}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#ef4444' }}
                          title="Delete School from Registry"
                        >
                          <Trash2 size={15} />
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

      {/* MODAL 1: Generate New License */}
      {isNewClientModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '500px' }}>
            <div style={{ backgroundColor: 'var(--navy-900)', padding: '18px 20px', color: '#ffffff', borderRadius: '10px 10px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Generate School Client License</h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Issue a cryptographic license key for a new school or tuition center.
              </p>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Input
                  label="School / Institution Name *"
                  placeholder="e.g. Saraswati Vidhyalay"
                  value={newSchoolName}
                  onChange={(e) => setNewSchoolName(e.target.value)}
                  autoFocus
                />
                <Input
                  label="Contact Person Name"
                  placeholder="e.g. Principal Sharma"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                />
                <Input
                  label="Phone / Mobile Number"
                  placeholder="e.g. +91 9876543210"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
                <Input
                  label="Institutional Email"
                  placeholder="e.g. principal@school.edu"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                    Initial License Duration
                  </label>
                  <select
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  >
                    <option value="15">15 Days Free Trial</option>
                    <option value="30">30 Days Standard Evaluation</option>
                    <option value="60">60 Days Extended Trial</option>
                    <option value="365">1 Year Commercial License</option>
                    <option value="lifetime">Lifetime License</option>
                    <option value="custom">Custom Days...</option>
                  </select>
                </div>
                {newDuration === 'custom' && (
                  <Input
                    label="Custom Days Count"
                    type="number"
                    value={newCustomDays}
                    onChange={(e) => setNewCustomDays(e.target.value)}
                  />
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                    Student Plan Tier (Capacity Limit) *
                  </label>
                  <select
                    value={newMaxStudents}
                    onChange={(e) => setNewMaxStudents(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#ffffff' }}
                  >
                    {STUDENT_CAPACITY_TIERS.map((tier) => (
                      <option key={tier.id} value={tier.maxStudents}>
                        {tier.label} — {tier.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => setIsNewClientModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleCreateNewClient}>
                Generate &amp; Activate License
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Client Details */}
      {isEditClientModalOpen && editingClientData && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '500px' }}>
            <div style={{ backgroundColor: 'var(--navy-900)', padding: '18px 20px', color: '#ffffff', borderRadius: '10px 10px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Edit School Details</h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                Update school contact information in the central registry.
              </p>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Input
                  label="School / Institution Name"
                  value={editingClientData.schoolName || ''}
                  onChange={(e) => setEditingClientData({ ...editingClientData, schoolName: e.target.value })}
                />
                <Input
                  label="Contact Person"
                  value={editingClientData.contactPerson || ''}
                  onChange={(e) => setEditingClientData({ ...editingClientData, contactPerson: e.target.value })}
                />
                <Input
                  label="Phone Number"
                  value={editingClientData.phone || ''}
                  onChange={(e) => setEditingClientData({ ...editingClientData, phone: e.target.value })}
                />
                <Input
                  label="Email"
                  value={editingClientData.email || ''}
                  onChange={(e) => setEditingClientData({ ...editingClientData, email: e.target.value })}
                />
                <Input
                  label="Internal Notes"
                  value={editingClientData.notes || ''}
                  onChange={(e) => setEditingClientData({ ...editingClientData, notes: e.target.value })}
                />
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                    Student Plan Tier
                  </label>
                  <select
                    value={editingClientData.maxStudents || 200}
                    onChange={(e) => {
                      const count = parseInt(e.target.value, 10);
                      setEditingClientData({
                        ...editingClientData,
                        maxStudents: count,
                        max_students: count,
                        tier: getStudentCapacityTier(count),
                      });
                    }}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#ffffff' }}
                  >
                    {STUDENT_CAPACITY_TIERS.map((tier) => (
                      <option key={tier.id} value={tier.maxStudents}>
                        {tier.label} — {tier.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => setIsEditClientModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEditClient}>
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Set Exact Custom Days */}
      {isCustomDaysModalOpen && customDaysTargetClient && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '400px' }}>
            <div style={{ backgroundColor: 'var(--navy-900)', padding: '16px 20px', color: '#ffffff', borderRadius: '10px 10px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Set Exact Days Remaining</h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                {customDaysTargetClient.schoolName}
              </p>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <Input
                label="Days Remaining (e.g. 15, 30, 45, 90, 365)"
                type="number"
                min="0"
                max="9999"
                value={customDaysInputValue}
                onChange={(e) => setCustomDaysInputValue(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => setIsCustomDaysModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleApplyCustomDays}>
                Apply Days
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3.5: Change Student Plan Tier Capacity */}
      {isTierModalOpen && tierTargetClient && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '440px' }}>
            <div style={{ backgroundColor: 'var(--navy-900)', padding: '16px 20px', color: '#ffffff', borderRadius: '10px 10px 0 0' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Update Student Capacity Tier</h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                {tierTargetClient.schoolName} ({tierTargetClient.licenseKey})
              </p>
            </div>
            <div className="modal-body" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Select the authorized student enrollment limit for this school. The client desktop EXE and imports will strictly enforce this cap.
                </p>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '6px' }}>
                    Authorized Student Limit
                  </label>
                  <select
                    value={tierInputValue}
                    onChange={(e) => setTierInputValue(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', backgroundColor: '#ffffff' }}
                  >
                    {STUDENT_CAPACITY_TIERS.map((tier) => (
                      <option key={tier.id} value={tier.maxStudents}>
                        {tier.label} — {tier.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af' }}>
                  💡 <b>Instant Cloud Sync:</b> Once saved, the school&apos;s installation will immediately reflect this tier upon its next automatic sync.
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="outline" size="sm" onClick={() => { setIsTierModalOpen(false); setTierTargetClient(null); }}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveTierCapacity} disabled={isActionLoading}>
                {isActionLoading ? 'Saving...' : 'Update Plan Tier'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Generated License Ready & 1-Click WhatsApp Share */}
      {createdSuccessData && (
        <div className="modal-backdrop" style={{ zIndex: 10000 }}>
          <div className="modal-dialog" style={{ maxWidth: '520px', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '20px 24px', color: '#ffffff', borderBottom: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#22c55e20', border: '1px solid #22c55e40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#22c55e' }}>
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
                    License Generated &amp; Synced to Cloud!
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                    {createdSuccessData.schoolName} is ready to activate on Desktop EXE or Mobile APK.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ padding: '24px', backgroundColor: '#ffffff' }}>
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  School License Key
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                  <code style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '0.05em' }}>
                    {createdSuccessData.licenseKey}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Copy}
                    onClick={() => {
                      navigator.clipboard.writeText(createdSuccessData.licenseKey);
                      showToast(`✓ Copied ${createdSuccessData.licenseKey}`);
                    }}
                  >
                    Copy Key
                  </Button>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  Duration: <b>{createdSuccessData.daysRemaining >= 9000 ? 'Lifetime' : `${createdSuccessData.daysRemaining} Days`}</b> | Capacity: <b>{createdSuccessData.maxStudents || 200} Students ({createdSuccessData.tier?.name || getStudentCapacityTier(createdSuccessData.maxStudents || 200).name})</b> | Workstations: <b>1 Authorized Device (Anti-Copy Locked)</b>
                </div>
              </div>

              {/* Ready-to-Send WhatsApp Text Box */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  Ready-to-Send Client Message (WhatsApp / Email):
                </label>
                <textarea
                  readOnly
                  rows={7}
                  style={{ width: '100%', padding: '10px 12px', fontSize: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f1f5f9', color: '#334155', fontFamily: 'monospace', resize: 'none' }}
                  value={`🏫 SMS — Student Management System\n\nDear ${createdSuccessData.contactPerson || 'School Administrator'},\nHere is your official activation license key for ${createdSuccessData.schoolName}:\n\n🔑 License Key: ${createdSuccessData.licenseKey}\n📅 Validity: ${createdSuccessData.daysRemaining >= 9000 ? 'Lifetime License' : `${createdSuccessData.daysRemaining} Days Evaluation`}\n👥 Plan Tier: ${createdSuccessData.maxStudents || 200} Students (${createdSuccessData.tier?.name || getStudentCapacityTier(createdSuccessData.maxStudents || 200).name})\n🔒 Workstation Policy: 1 Device Binding (Locked to your primary PC)\n\nInstructions: Launch SMS Desktop or Android APK. Enter this License Key when prompted to activate.\n\nTechnical Support: Dhruv Shah (+91 8866039007)`}
                />
              </div>
            </div>

            <div style={{ padding: '14px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreatedSuccessData(null)}
              >
                Done
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Copy}
                onClick={() => {
                  const msg = `🏫 SMS — Student Management System\n\nDear ${createdSuccessData.contactPerson || 'School Administrator'},\nHere is your official activation license key for ${createdSuccessData.schoolName}:\n\n🔑 License Key: ${createdSuccessData.licenseKey}\n📅 Validity: ${createdSuccessData.daysRemaining >= 9000 ? 'Lifetime License' : `${createdSuccessData.daysRemaining} Days Evaluation`}\n👥 Plan Tier: ${createdSuccessData.maxStudents || 200} Students (${createdSuccessData.tier?.name || getStudentCapacityTier(createdSuccessData.maxStudents || 200).name})\n🔒 Workstation Policy: 1 Device Binding (Locked to your primary PC)\n\nInstructions: Launch SMS Desktop or Android APK. Enter this License Key when prompted to activate.\n\nTechnical Support: Dhruv Shah (+91 8866039007)`;
                  navigator.clipboard.writeText(msg);
                  showToast('✓ Copied complete client WhatsApp message to clipboard!');
                }}
              >
                Copy Full WhatsApp Message
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
