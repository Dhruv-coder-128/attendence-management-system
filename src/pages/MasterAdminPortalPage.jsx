import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import { supabase } from '../lib/supabase';
import { getApiBaseUrl } from '../lib/licenseService';

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
    totalStudents: 145,
    botUsername: 'NobleAcademyBot',
    notes: 'CBSE Secondary School in Ahmedabad',
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
    totalStudents: 320,
    botUsername: 'SaraswatiVidhyalayBot',
    notes: 'High School & Higher Secondary',
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
    totalStudents: 88,
    botUsername: '',
    notes: 'Awaiting renewal fee payment',
  },
];

export default function MasterAdminPortalPage({ onNavigate, user }) {
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
  const [newDuration, setNewDuration] = useState('30'); // '15', '30', '60', '365', 'lifetime', 'custom'
  const [newCustomDays, setNewCustomDays] = useState('45');
  const [newStorageMode, setNewStorageMode] = useState('offline'); // 'offline' or 'cloud'
  const [newSupabaseUrl, setNewSupabaseUrl] = useState('');
  const [newSupabaseAnonKey, setNewSupabaseAnonKey] = useState('');
  const [newBotUsername, setNewBotUsername] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  // Edit Days Modal State
  const [editingClient, setEditingClient] = useState(null);
  const [manualDaysInput, setManualDaysInput] = useState('30');

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
      setPinError('Invalid Master Developer Security PIN.');
    }
  };

  // Remote API Sync Helper
  const syncWithServer = async (action, payload = {}) => {
    try {
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/license-manage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-developer-pin': '8866',
        },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (err) {
      console.warn('Licensing server sync notice:', err.message);
    }
    return null;
  };

  // Sync latest cloud licenses on portal load
  useEffect(() => {
    const fetchCloudLicenses = async () => {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/license-manage`, {
          headers: { 'x-developer-pin': '8866' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.licenses) && data.licenses.length > 0) {
            // Map remote PostgreSQL licenses into client format
            const remoteMapped = data.licenses.map((lic) => {
              const trialEnds = lic.trial_ends_at ? new Date(lic.trial_ends_at) : null;
              const daysRemaining = trialEnds
                ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                : 9999;
              return {
                id: lic.id,
                schoolName: lic.school_name,
                licenseKey: lic.license_key,
                status: lic.status,
                daysRemaining,
                trialStartedAt: lic.trial_started_at,
                trialEndsAt: lic.trial_ends_at,
                botUsername: '',
                contactPerson: 'School Administrator',
                email: lic.contact_developer?.email || '',
                phone: lic.contact_developer?.phone || '',
                notes: lic.notes || '',
              };
            });

            // Merge with local list (remote takes precedence by licenseKey)
            setClients((prev) => {
              const map = new Map(prev.map((c) => [c.licenseKey, c]));
              remoteMapped.forEach((r) => map.set(r.licenseKey, { ...(map.get(r.licenseKey) || {}), ...r }));
              const merged = Array.from(map.values());
              try {
                localStorage.setItem(STORAGE_REGISTRY_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Could not load remote licenses:', err);
      }
    };

    if (isAuthenticated) {
      fetchCloudLicenses();
    }
  }, [isAuthenticated]);

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

    const durationDays = newDuration === 'lifetime'
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
      totalStudents: 0,
      botUsername: newBotUsername.trim().replace(/^@/, ''),
      databaseConfig: newStorageMode === 'cloud' && newSupabaseUrl ? {
        supabaseUrl: newSupabaseUrl.trim(),
        supabaseAnonKey: newSupabaseAnonKey.trim(),
      } : null,
      notes: `Generated on ${now.toLocaleDateString()}`,
    };

    const updated = [newClientObj, ...clients];
    saveClients(updated);

    // Sync to Cloud Server
    syncWithServer('upsert', {
      license: newClientObj,
    });

    // Reset Form
    setNewSchoolName('');
    setNewContactPerson('');
    setNewEmail('');
    setNewPhone('');
    setNewDuration('30');
    setNewBotUsername('');
    setIsNewClientModalOpen(false);

    showToast(`Successfully created license key for ${newClientObj.schoolName}: ${generatedKey}`);
  };

  const handleExtendTrial = (clientId, extraDays) => {
    const target = clients.find((c) => c.id === clientId);
    const updated = clients.map((c) => {
      if (c.id === clientId) {
        const currentDays = c.daysRemaining > 0 ? c.daysRemaining : 0;
        const newDays = currentDays + extraDays;
        return {
          ...c,
          daysRemaining: newDays,
          status: 'trial_active',
          trialEndsAt: new Date(Date.now() + newDays * 24 * 60 * 60 * 1000).toISOString(),
        };
      }
      return c;
    });
    saveClients(updated);

    if (target) {
      const newDays = (target.daysRemaining > 0 ? target.daysRemaining : 0) + extraDays;
      syncWithServer('set_days', {
        licenseKey: target.licenseKey,
        durationDays: newDays,
      });
    }

    showToast(`Added +${extraDays} days to school's trial period!`);
  };

  const handleSetManualDays = () => {
    if (!editingClient) return;
    const days = parseInt(manualDaysInput, 10) || 0;
    const updated = clients.map((c) => {
      if (c.id === editingClient.id) {
        return {
          ...c,
          daysRemaining: days,
          status: days > 0 ? (days >= 365 ? 'licensed' : 'trial_active') : 'trial_expired',
          trialEndsAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        };
      }
      return c;
    });
    saveClients(updated);

    syncWithServer('set_days', {
      licenseKey: editingClient.licenseKey,
      durationDays: days,
    });

    setEditingClient(null);
    showToast(`Updated remaining days to ${days} days for ${editingClient.schoolName}!`);
  };

  const handleToggleSuspend = async (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (!target) return;

    const newStatus = target.status === 'suspended' ? (target.daysRemaining > 0 ? 'trial_active' : 'trial_expired') : 'suspended';
    const updated = clients.map((c) => (c.id === clientId ? { ...c, status: newStatus } : c));
    saveClients(updated);

    // Sync to Cloud Server so the school's exe immediately locks!
    await syncWithServer(newStatus === 'suspended' ? 'suspend' : 'unlock', {
      licenseKey: target.licenseKey,
      newStatus,
    });

    showToast(
      newStatus === 'suspended'
        ? `🔒 School "${target.schoolName}" LOCKED remotely! Client EXE will now be blocked.`
        : `🔓 School "${target.schoolName}" unlocked successfully!`
    );
  };

  const handleDeleteClient = (clientId) => {
    const target = clients.find((c) => c.id === clientId);
    if (confirm('Are you sure you want to delete this school client from the SaaS registry?')) {
      const updated = clients.filter((c) => c.id !== clientId);
      saveClients(updated);

      if (target?.licenseKey) {
        syncWithServer('delete', { licenseKey: target.licenseKey });
      }

      showToast('Client deleted from registry.');
    }
  };

  const handleCopyKey = (key) => {
    navigator.clipboard.writeText(key);
    showToast(`Copied license key: ${key}`);
  };

  const handleSendWhatsApp = (client) => {
    const phone = (client.phone || '').replace(/[^0-9]/g, '');
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;
    const msg = encodeURIComponent(
      `Hello ${client.contactPerson || 'School Administrator'},\n\nHere is your official activation license key for *SMS — Student Management System*:\n\n🔑 *License Key:* ${client.licenseKey}\n📅 *Valid Duration:* ${client.daysRemaining} Days\n🏫 *School:* ${client.schoolName}\n\nDownload & Open SMS Desktop App, paste this key in License Activation, and your school database will activate immediately!\n\nRegards,\n*Dhruv Shah (Developer)*\n+91 8866039007`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${msg}`, '_blank');
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 5000);
  };

  // Master Developer PIN Gate Screen
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
            maxWidth: '420px',
            width: '100%',
            padding: '32px 28px',
            borderRadius: '12px',
            boxShadow: 'var(--shadow-xl)',
            textAlign: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: 'var(--gold-subtle-bg)',
              border: '1px solid var(--gold-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
            }}
          >
            <ShieldAlert size={28} color="var(--gold-dark)" />
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
            Developer SaaS Master Console
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px 0' }}>
            Exclusive platform management portal for <strong>Dhruv Shah</strong>. Enter your Master Developer Security PIN to unlock.
          </p>

          <form onSubmit={handlePinSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <Input
                label="Master Developer PIN"
                type="password"
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Enter PIN (e.g. 8866)"
                autoFocus
              />
            </div>

            {pinError && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--status-absent-bg)',
                  border: '1px solid var(--status-absent-border)',
                  color: 'var(--status-absent)',
                  fontSize: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertCircle size={14} />
                <span>{pinError}</span>
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="md"
              icon={Unlock}
              onClick={handlePinSubmit}
              style={{ width: '100%' }}
            >
              Unlock Master Portal
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
    <div>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '12px 20px',
            backgroundColor: 'var(--navy-900)',
            border: '1px solid var(--gold-primary)',
            color: '#ffffff',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={18} color="var(--gold-primary)" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">SaaS Developer Master Control Center</h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--gold-primary)',
                color: 'var(--navy-950)',
              }}
            >
              Dhruv Shah Console
            </span>
          </div>
          <p className="page-description">
            Manage all 10+ client schools, generate cryptographic activation keys, configure free trial durations, and control platform access.
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setIsNewClientModalOpen(true)}
          >
            + Generate New School License Key
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="erp-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Total Client Schools
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--navy-950)', marginTop: '4px' }}>
            {totalSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Configured institutions
          </div>
        </div>

        <div className="erp-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Active / Paying Schools
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--status-present)', marginTop: '4px' }}>
            {activeSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Full access running
          </div>
        </div>

        <div className="erp-card" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Free Trial Schools
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--gold-dark)', marginTop: '4px' }}>
            {trialSchools}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Active evaluation periods
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
            Trial over or locked out
          </div>
        </div>
      </div>

      {/* Main Client Schools Table */}
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
              Client Schools Registry ({clients.length})
            </h3>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Real-time multi-tenant control
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead style={{ backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-subtle)' }}>
              <tr>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>School &amp; Contact</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Storage Mode</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>License Key</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Free Trial Time</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700 }}>Custom Bot</th>
                <th style={{ padding: '12px 16px', color: 'var(--navy-900)', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const isExpired = client.status === 'trial_expired' || client.daysRemaining <= 0;
                const isSuspended = client.status === 'suspended';

                return (
                  <tr
                    key={client.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      backgroundColor: isSuspended ? '#fef2f2' : '#ffffff',
                    }}
                  >
                    {/* School & Contact */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--navy-950)' }}>{client.schoolName}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {client.contactPerson} &bull; {client.phone || client.email || 'No contact'}
                      </div>
                    </td>

                    {/* Storage Mode */}
                    <td style={{ padding: '12px 16px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor: client.storageMode === 'offline' ? '#f0fdf4' : '#eff6ff',
                          color: client.storageMode === 'offline' ? '#166534' : '#1e40af',
                          border: `1px solid ${client.storageMode === 'offline' ? '#bbf7d0' : '#bfdbfe'}`,
                        }}
                      >
                        {client.storageMode === 'offline' ? 'Offline Local DB' : 'Cloud Supabase'}
                      </span>
                    </td>

                    {/* License Key */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <code
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 700,
                            backgroundColor: 'var(--bg-subtle)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {client.licenseKey}
                        </code>
                        <button
                          onClick={() => handleCopyKey(client.licenseKey)}
                          title="Copy Key"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--navy-700)', padding: '2px' }}
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <Badge
                        variant={
                          client.status === 'licensed'
                            ? 'success'
                            : client.status === 'trial_active'
                            ? 'gold'
                            : 'danger'
                        }
                      >
                        {client.status === 'licensed'
                          ? 'Licensed'
                          : client.status === 'trial_active'
                          ? 'Active Trial'
                          : client.status === 'suspended'
                          ? 'Suspended'
                          : 'Expired'}
                      </Badge>
                    </td>

                    {/* Free Trial Time */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} color={client.daysRemaining > 5 ? 'var(--status-present)' : 'var(--status-absent)'} />
                        <span style={{ fontWeight: 700, color: client.daysRemaining > 5 ? 'var(--navy-900)' : 'var(--status-absent)' }}>
                          {client.daysRemaining > 365 ? 'Lifetime Access' : `${client.daysRemaining} Days Left`}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                        <button
                          onClick={() => handleExtendTrial(client.id, 15)}
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}
                        >
                          +15d
                        </button>
                        <button
                          onClick={() => handleExtendTrial(client.id, 30)}
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', cursor: 'pointer', fontWeight: 600 }}
                        >
                          +30d
                        </button>
                        <button
                          onClick={() => {
                            setEditingClient(client);
                            setManualDaysInput(String(client.daysRemaining));
                          }}
                          style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', border: '1px solid var(--gold-border)', backgroundColor: 'var(--gold-subtle-bg)', cursor: 'pointer', fontWeight: 600, color: 'var(--gold-dark)' }}
                        >
                          Custom
                        </button>
                      </div>
                    </td>

                    {/* Custom Telegram Bot */}
                    <td style={{ padding: '12px 16px' }}>
                      {client.botUsername ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0284c7', fontSize: '12px', fontWeight: 600 }}>
                          <Bot size={14} />
                          <span>@{client.botUsername}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Default Bot</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        {client.phone && (
                          <button
                            onClick={() => handleSendWhatsApp(client)}
                            title="Send Key via WhatsApp"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              border: '1px solid #86efac',
                              backgroundColor: '#f0fdf4',
                              color: '#15803d',
                              cursor: 'pointer',
                            }}
                          >
                            <Send size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleSuspend(client.id)}
                          title={client.status === 'suspended' ? 'Unlock / Reactivate' : 'Lockout / Suspend'}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: `1px solid ${client.status === 'suspended' ? '#86efac' : '#fca5a5'}`,
                            backgroundColor: client.status === 'suspended' ? '#f0fdf4' : '#fef2f2',
                            color: client.status === 'suspended' ? '#15803d' : '#b91c1c',
                            cursor: 'pointer',
                          }}
                        >
                          {client.status === 'suspended' ? <Unlock size={14} /> : <Lock size={14} />}
                        </button>
                        <button
                          onClick={() => handleDeleteClient(client.id)}
                          title="Delete Client"
                          style={{
                            padding: '5px 8px',
                            borderRadius: '4px',
                            border: '1px solid #e2e8f0',
                            backgroundColor: '#ffffff',
                            color: '#94a3b8',
                            cursor: 'pointer',
                          }}
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

      {/* MODAL: Generate New School License Key */}
      {isNewClientModalOpen && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 9999,
            backgroundColor: 'rgba(7, 14, 25, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              width: '100%',
              maxWidth: '540px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            }}
          >
            <div
              style={{
                backgroundColor: 'var(--navy-900)',
                padding: '16px 20px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <KeyRound size={20} color="var(--gold-primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                  Generate New School License Key
                </h3>
              </div>
              <button
                onClick={() => setIsNewClientModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto' }}>
              <Input
                label="School / Institution Name *"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="e.g. Noble High School"
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Input
                  label="Contact Person"
                  value={newContactPerson}
                  onChange={(e) => setNewContactPerson(e.target.value)}
                  placeholder="e.g. Principal Pandya"
                />
                <Input
                  label="Contact Phone / WhatsApp"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+91 8866039007"
                />
              </div>

              <Input
                label="Contact Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="principal@school.com"
              />

              {/* Free Trial Time Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                  Free Trial Time / License Duration
                </label>
                <select
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-navy)',
                    fontSize: '13px',
                    backgroundColor: '#ffffff',
                  }}
                >
                  <option value="15">15 Days Free Trial</option>
                  <option value="30">30 Days Standard Trial</option>
                  <option value="60">60 Days Extended Trial</option>
                  <option value="365">1 Year Full License</option>
                  <option value="lifetime">Lifetime Master License</option>
                  <option value="custom">Custom Days...</option>
                </select>
              </div>

              {newDuration === 'custom' && (
                <Input
                  label="Enter Custom Free Days"
                  type="number"
                  value={newCustomDays}
                  onChange={(e) => setNewCustomDays(e.target.value)}
                  placeholder="e.g. 45"
                />
              )}

              {/* Storage Mode */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                  Database Storage Engine
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setNewStorageMode('offline')}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: `2px solid ${newStorageMode === 'offline' ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: newStorageMode === 'offline' ? 'var(--gold-subtle-bg)' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)' }}>Offline Local DB</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>On-device IndexedDB</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewStorageMode('cloud')}
                    style={{
                      padding: '10px',
                      borderRadius: '6px',
                      border: `2px solid ${newStorageMode === 'cloud' ? 'var(--gold-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: newStorageMode === 'cloud' ? 'var(--gold-subtle-bg)' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--navy-950)' }}>Cloud Database</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Dedicated Supabase</div>
                  </button>
                </div>
              </div>

              {/* Custom Telegram Bot Username */}
              <Input
                label="Per-School Telegram Bot Username (Optional)"
                value={newBotUsername}
                onChange={(e) => setNewBotUsername(e.target.value)}
                placeholder="e.g. NobleSchoolBot (without @)"
              />
            </div>

            <div
              style={{
                padding: '14px 20px',
                backgroundColor: 'var(--bg-subtle)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <Button variant="outline" size="sm" onClick={() => setIsNewClientModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" icon={KeyRound} onClick={handleCreateNewClient}>
                Generate &amp; Save License
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Custom Days Adjustment */}
      {editingClient && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 9999,
            backgroundColor: 'rgba(7, 14, 25, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="modal-dialog"
            style={{
              width: '100%',
              maxWidth: '380px',
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              padding: '20px',
            }}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
              Set Trial Days Remaining
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Adjust remaining free trial time for <strong>{editingClient.schoolName}</strong>:
            </p>

            <Input
              label="Remaining Days"
              type="number"
              value={manualDaysInput}
              onChange={(e) => setManualDaysInput(e.target.value)}
              placeholder="e.g. 45"
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <Button variant="outline" size="sm" onClick={() => setEditingClient(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSetManualDays}>
                Update Days
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
