import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Phone,
  Mail,
  UserCheck,
  Plus,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  CheckCircle2,
  Sparkles,
  Users,
  Upload,
  MessageCircle,
  Copy,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Share2,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  Key,
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import BulkImportModal from '../components/importer/BulkImportModal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  getParentTelegramDeepLink,
  getParentTelegramAppUri,
  getParentTelegramLinks,
  createSecureParentInvitation,
  createBulkParentInvitations,
  linkParentTelegramAccount,
  getWhatsAppShareUrl,
  TELEGRAM_BOT_USERNAME,
} from '../lib/telegramClient';

/**
 * Parent Directory — Connected directly to Supabase public.parents & public.parent_students
 */
export default function ParentsPage({ onRefreshCounts }) {
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parentToEdit, setParentToEdit] = useState(null);
  const [parentToDelete, setParentToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Bulk Parent Invitations State
  const [invitationsMap, setInvitationsMap] = useState({});
  const [isBulkInviteModalOpen, setIsBulkInviteModalOpen] = useState(false);
  const [bulkInviteScope, setBulkInviteScope] = useState('unlinked'); // 'unlinked', 'pending', 'all'
  const [bulkInviteChannel, setBulkInviteChannel] = useState('telegram'); // 'telegram', 'whatsapp'
  const [isDispatchingInvites, setIsDispatchingInvites] = useState(false);
  const [bulkInviteResults, setBulkInviteResults] = useState(null);

  // Telegram Deep Link Modal State (Individual)
  const [telegramModalParent, setTelegramModalParent] = useState(null);
  const [telegramChatIdInput, setTelegramChatIdInput] = useState('');
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  const [telegramLinkMessage, setTelegramLinkMessage] = useState(null);
  const [showManualOverride, setShowManualOverride] = useState(false);

  // Form State
  const initialForm = {
    full_name: '',
    phone: '',
    email: '',
    relationship: 'Father',
    preferred_notification_channel: 'telegram',
    student_id: '', // for junction linking
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Fetch Parents with linked students, and student options
  const fetchData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Students for dropdown
      const { data: studentsData, error: stErr } = await supabase
        .from('students')
        .select('id, full_name, admission_no')
        .order('full_name');
      if (stErr) throw stErr;

      // 2. Fetch Parents with joined parent_students and students
      let parentsData = null;
      let prErr = null;

      const fullSelectRes = await supabase
        .from('parents')
        .select(`
          id,
          full_name,
          phone,
          email,
          relationship,
          preferred_notification_channel,
          telegram_chat_id,
          is_verified,
          linking_token,
          linking_token_expires_at,
          invitation_status,
          invitation_sent_at,
          created_at,
          parent_students:parent_students (
            id,
            relationship,
            is_primary_contact,
            students:student_id ( id, full_name, admission_no )
          )
        `)
        .order('full_name');

      if (fullSelectRes.error && (fullSelectRes.error.message?.includes('invitation_status') || fullSelectRes.error.message?.includes('linking_token'))) {
        // Fallback to core columns existing on production schema
        const coreRes = await supabase
          .from('parents')
          .select(`
            id,
            full_name,
            phone,
            email,
            relationship,
            preferred_notification_channel,
            telegram_chat_id,
            is_verified,
            created_at,
            parent_students:parent_students (
              id,
              relationship,
              is_primary_contact,
              students:student_id ( id, full_name, admission_no )
            )
          `)
          .order('full_name');

        parentsData = coreRes.data;
        prErr = coreRes.error;
      } else {
        parentsData = fullSelectRes.data;
        prErr = fullSelectRes.error;
      }

      if (prErr) throw prErr;

      setStudents(studentsData || []);
      setParents(parentsData || []);

      // 3. Try to fetch invitations from parent_invitations table
      try {
        const { data: invData } = await supabase
          .from('parent_invitations')
          .select('*')
          .order('created_at', { ascending: false });

        if (invData) {
          const map = {};
          invData.forEach((inv) => {
            if (!map[inv.parent_id]) map[inv.parent_id] = inv;
          });
          setInvitationsMap(map);
        }
      } catch (invErr) {
        console.warn('parent_invitations query fallback:', invErr);
      }
    } catch (err) {
      console.error('Error fetching parents:', err);
      setError(err.message || 'Failed to load parents from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Parents
  const filteredParents = useMemo(() => {
    return parents.filter((p) => {
      const search = searchTerm.toLowerCase().trim();
      const wardNames = (p.parent_students || [])
        .map((ps) => ps.students?.full_name?.toLowerCase() || '')
        .join(' ');

      const matchSearch =
        !search ||
        (p.full_name && p.full_name.toLowerCase().includes(search)) ||
        (p.phone && p.phone.includes(search)) ||
        (p.email && p.email.toLowerCase().includes(search)) ||
        wardNames.includes(search);

      const matchChannel =
        channelFilter === 'All' || p.preferred_notification_channel === channelFilter;

      return matchSearch && matchChannel;
    });
  }, [parents, searchTerm, channelFilter]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setModalError('');
    setFormData({
      ...initialForm,
      student_id: students[0]?.id || '',
    });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (parent) => {
    setModalError('');
    setParentToEdit(parent);
    setFormData({
      full_name: parent.full_name || '',
      phone: parent.phone || '',
      email: parent.email || '',
      relationship: parent.relationship || 'Parent',
      preferred_notification_channel: parent.preferred_notification_channel || 'telegram',
      student_id: parent.parent_students?.[0]?.students?.id || '',
    });
  };

  // Save Parent (Add or Edit)
  const handleSaveParent = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.full_name.trim()) {
      setModalError('Parent/Guardian full name is required.');
      return;
    }
    if (!formData.phone.trim()) {
      setModalError('Contact phone number is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const parentPayload = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || null,
        relationship: formData.relationship,
        preferred_notification_channel: formData.preferred_notification_channel,
      };

      if (parentToEdit) {
        // UPDATE parent
        const { error: updateErr } = await supabase
          .from('parents')
          .update(parentPayload)
          .eq('id', parentToEdit.id);

        if (updateErr) throw updateErr;

        showToast(`Guardian details for ${parentPayload.full_name} updated!`);
        setParentToEdit(null);
      } else {
        // INSERT parent
        const { data: newParent, error: insertErr } = await supabase
          .from('parents')
          .insert([parentPayload])
          .select()
          .single();

        if (insertErr) throw insertErr;

        // If a student was selected, link in parent_students junction
        if (formData.student_id && newParent) {
          const junctionPayload = {
            parent_id: newParent.id,
            student_id: formData.student_id,
            relationship: formData.relationship,
            is_primary_contact: true,
          };

          await supabase.from('parent_students').insert([junctionPayload]);
        }

        showToast(`Guardian ${parentPayload.full_name} registered successfully!`);
        setIsAddModalOpen(false);
      }

      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Save parent error:', err);
      setModalError(err.message || 'Failed to save guardian record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Parent
  const handleConfirmDelete = async () => {
    if (!parentToDelete) return;
    setIsSubmitting(true);

    try {
      const { error: delErr } = await supabase
        .from('parents')
        .delete()
        .eq('id', parentToDelete.id);

      if (delErr) throw delErr;

      showToast(`Guardian ${parentToDelete.full_name} deleted.`);
      setParentToDelete(null);
      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Delete parent error:', err);
      alert('Failed to delete parent: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Metric Summaries
  const linkedCount = useMemo(() => {
    return parents.filter((p) => p.is_verified && p.telegram_chat_id).length;
  }, [parents]);

  const pendingCount = useMemo(() => {
    return parents.filter((p) => {
      if (p.is_verified && p.telegram_chat_id) return false;
      const inv = invitationsMap[p.id] || (p.linking_token ? { token: p.linking_token, expires_at: p.linking_token_expires_at } : null);
      if (!inv || !inv.token) return false;
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) return false;
      return true;
    }).length;
  }, [parents, invitationsMap]);

  const uninvitedCount = Math.max(0, parents.length - linkedCount - pendingCount);

  // Telegram Deep Link Handlers
  const handleOpenTelegramLink = async (parent) => {
    setTelegramModalParent(parent);
    setTelegramChatIdInput(parent.telegram_chat_id || '');
    setTelegramLinkMessage(null);
    setShowManualOverride(false);

    // Auto-generate a secure token if neither table has one
    const activeInv = invitationsMap[parent.id] || (parent.linking_token ? { token: parent.linking_token, expires_at: parent.linking_token_expires_at } : null);
    if (!activeInv || !activeInv.token) {
      try {
        const newInv = await createSecureParentInvitation(parent.id, 'telegram');
        setInvitationsMap((prev) => ({
          ...prev,
          [parent.id]: {
            parent_id: parent.id,
            token: newInv.token,
            expires_at: newInv.expiresAt,
            invitation_channel: 'telegram',
            invitation_status: 'sent',
            linking_status: 'unlinked',
          },
        }));
      } catch (err) {
        console.warn('Auto token generation warning:', err);
      }
    }
  };

  const handleRegenerateToken = async () => {
    if (!telegramModalParent) return;
    try {
      const newInv = await createSecureParentInvitation(telegramModalParent.id, 'telegram');
      setInvitationsMap((prev) => ({
        ...prev,
        [telegramModalParent.id]: {
          parent_id: telegramModalParent.id,
          token: newInv.token,
          expires_at: newInv.expiresAt,
          invitation_channel: 'telegram',
          invitation_status: 'sent',
          linking_status: 'unlinked',
        },
      }));
      showToast('Generated fresh 7-day single-use linking token!');
      fetchData();
    } catch (err) {
      alert('Failed to generate token: ' + err.message);
    }
  };

  const handleSaveTelegramChatId = async () => {
    if (!telegramModalParent) return;
    if (!telegramChatIdInput.trim()) {
      setTelegramLinkMessage({ error: 'Please enter a valid numeric Telegram Chat ID.' });
      return;
    }

    setIsLinkingTelegram(true);
    setTelegramLinkMessage(null);

    try {
      const res = await linkParentTelegramAccount(telegramModalParent.id, telegramChatIdInput.trim());
      if (res.success) {
        setTelegramLinkMessage({ success: `Telegram Chat ID ${res.chatId} successfully linked & verified!` });
        showToast(`Guardian ${telegramModalParent.full_name} Telegram verified!`);
        await fetchData();
      } else {
        setTelegramLinkMessage({ error: res.error || 'Failed to update chat ID.' });
      }
    } catch (err) {
      setTelegramLinkMessage({ error: err.message || 'Linking failed.' });
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!telegramModalParent) return;
    if (!window.confirm(`Are you sure you want to unlink Telegram for ${telegramModalParent.full_name}? They will stop receiving attendance alerts until reconnected.`)) return;

    setIsLinkingTelegram(true);
    setTelegramLinkMessage(null);
    try {
      const { error } = await supabase
        .from('parents')
        .update({
          telegram_chat_id: null,
          is_verified: false,
          invitation_status: 'uninvited',
          updated_at: new Date().toISOString(),
        })
        .eq('id', telegramModalParent.id);

      if (error) throw error;

      showToast(`Telegram unlinked for ${telegramModalParent.full_name}.`);
      setTelegramModalParent((prev) => ({
        ...prev,
        telegram_chat_id: null,
        is_verified: false,
        invitation_status: 'uninvited',
      }));
      setTelegramChatIdInput('');
      await fetchData();
    } catch (err) {
      setTelegramLinkMessage({ error: 'Failed to unlink: ' + err.message });
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  // Bulk Invitations Handler
  const handleRunBulkInvitations = async () => {
    let targetList = [];
    if (bulkInviteScope === 'unlinked') {
      targetList = parents.filter((p) => !(p.is_verified && p.telegram_chat_id));
    } else if (bulkInviteScope === 'pending') {
      targetList = parents.filter((p) => {
        const inv = invitationsMap[p.id] || (p.linking_token ? { token: p.linking_token } : null);
        return !(p.is_verified && p.telegram_chat_id) && inv;
      });
    } else {
      targetList = [...parents];
    }

    if (targetList.length === 0) {
      alert('No eligible guardians found for the selected scope.');
      return;
    }

    setIsDispatchingInvites(true);
    try {
      const results = await createBulkParentInvitations(targetList, bulkInviteChannel);
      const successCount = results.filter((r) => r.success).length;
      const failedCount = results.filter((r) => !r.success).length;

      setBulkInviteResults({
        total: targetList.length,
        successCount,
        failedCount,
        channel: bulkInviteChannel,
        items: results,
      });

      showToast(`Generated ${successCount} parent invitations!`);
      await fetchData();
    } catch (err) {
      console.error('Bulk invite generation error:', err);
      alert('Error generating invitations: ' + err.message);
    } finally {
      setIsDispatchingInvites(false);
    }
  };

  const handleRetryFailedInvitations = async () => {
    if (!bulkInviteResults?.items) return;
    const failedItems = bulkInviteResults.items.filter((i) => !i.success);
    const retryParents = parents.filter((p) => failedItems.some((f) => f.parentId === p.id));
    if (retryParents.length === 0) return;

    setIsDispatchingInvites(true);
    try {
      const retryResults = await createBulkParentInvitations(retryParents, bulkInviteResults.channel);
      const newItems = bulkInviteResults.items.map((item) => {
        const retried = retryResults.find((r) => r.parentId === item.parentId);
        return retried || item;
      });
      const successCount = newItems.filter((r) => r.success).length;
      const failedCount = newItems.filter((r) => !r.success).length;

      setBulkInviteResults((prev) => ({
        ...prev,
        successCount,
        failedCount,
        items: newItems,
      }));
      showToast(`Retried ${retryParents.length} invitations.`);
      await fetchData();
    } catch (err) {
      alert('Retry error: ' + err.message);
    } finally {
      setIsDispatchingInvites(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Parent Communications Directory</h1>
          <p className="page-description">
            Registered Guardian Contacts &bull; Connected to Supabase PostgreSQL (<code>public.parents</code>)
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="gold"
            size="md"
            icon={Send}
            onClick={() => {
              setBulkInviteResults(null);
              setIsBulkInviteModalOpen(true);
            }}
          >
            Send Parent Invitations
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="outline"
            size="md"
            icon={Upload}
            onClick={() => setIsImportModalOpen(true)}
          >
            Bulk Import
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleOpenAdd}
          >
            Register Guardian
          </Button>
        </div>
      </div>

      {/* Top Metrics Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--navy-900)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Guardians
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '2px' }}>
            {parents.length}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-present)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Linked with Telegram
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-present)', marginTop: '2px' }}>
            {linkedCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid #0284c7',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Active Invitations (7d)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#0284c7', marginTop: '2px' }}>
            {pendingCount}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '12px 14px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid #d97706',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Uninvited / Action Req.
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#d97706', marginTop: '2px' }}>
            {uninvitedCount}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '6px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            borderRadius: '6px',
            color: 'var(--status-absent)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong>Database Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        className="erp-card"
        style={{
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-light)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search guardians by name, phone, email, or student ward..."
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

        <div style={{ width: '200px' }}>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="form-select"
          >
            <option value="All">All Notification Channels</option>
            <option value="telegram">Telegram</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <strong>{filteredParents.length}</strong> {filteredParents.length === 1 ? 'guardian' : 'guardians'}
        </div>
      </div>

      {/* Parents Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Parent / Guardian</th>
                <th>Relationship</th>
                <th>Linked Student Wards</th>
                <th>Contact Phone</th>
                <th>Channel</th>
                <th>Telegram Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading guardians from Supabase...</div>
                  </td>
                </tr>
              ) : filteredParents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Users size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {parents.length === 0
                        ? 'No Guardian Records in Supabase Database'
                        : 'No matching guardians found'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '420px', margin: '4px auto 16px' }}>
                      {parents.length === 0
                        ? 'Your public.parents table is currently empty. Click below to register guardian details and link student wards.'
                        : 'Try adjusting your search query or clearing the channel filter.'}
                    </div>
                    {parents.length === 0 && (
                      <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenAdd}>
                        Register First Guardian
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredParents.map((parent) => {
                  const linkedWards = (parent.parent_students || [])
                    .map((ps) => ps.students)
                    .filter(Boolean);

                  return (
                    <tr key={parent.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {parent.full_name}
                        </div>
                        {parent.email && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {parent.email}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>
                          {parent.relationship}
                        </span>
                      </td>
                      <td>
                        {linkedWards.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-light)', fontStyle: 'italic' }}>
                            No student linked
                          </span>
                        ) : (
                          linkedWards.map((w) => (
                            <div key={w.id} style={{ fontSize: '12px', color: 'var(--navy-900)' }}>
                              <strong>{w.full_name}</strong>{' '}
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                ({w.admission_no})
                              </span>
                            </div>
                          ))
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                          <Phone size={12} color="var(--navy-700)" />
                          <span>{parent.phone}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              parent.preferred_notification_channel === 'telegram'
                                ? '#e0f2fe'
                                : parent.preferred_notification_channel === 'whatsapp'
                                ? '#dcfce7'
                                : '#f1f5f9',
                            color:
                              parent.preferred_notification_channel === 'telegram'
                                ? '#0369a1'
                                : parent.preferred_notification_channel === 'whatsapp'
                                ? '#15803d'
                                : '#475569',
                            textTransform: 'capitalize',
                          }}
                        >
                          {parent.preferred_notification_channel}
                        </span>
                      </td>
                      <td>
                        {(() => {
                          const isLinked = parent.is_verified && parent.telegram_chat_id;
                          const inv = invitationsMap[parent.id] || (parent.linking_token ? { token: parent.linking_token, expires_at: parent.linking_token_expires_at } : null);
                          const isExpired = inv?.expires_at && new Date(inv.expires_at) < new Date();
                          const activeToken = inv?.token && !isExpired ? inv.token : null;
                          const tokenUrl = activeToken ? getParentTelegramDeepLink(activeToken) : getParentTelegramDeepLink(parent.id);
                          const wardNames = (parent.parent_students || [])
                            .map((ps) => ps.students?.full_name)
                            .filter(Boolean)
                            .join(', ');
                          const waUrl = getWhatsAppShareUrl(parent, wardNames, tokenUrl);

                          if (isLinked) {
                            return (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: 'var(--status-present-bg)',
                                    color: 'var(--status-present)',
                                    border: '1px solid var(--status-present-border)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title={`Connected via Telegram Chat ID: ${parent.telegram_chat_id}`}
                                >
                                  <CheckCircle2 size={12} /> Linked ({parent.telegram_chat_id})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenTelegramLink(parent)}
                                  className="btn btn-outline"
                                  style={{ padding: '2px 6px', fontSize: '10px' }}
                                  title="View Connection Details"
                                >
                                  Manage
                                </button>
                              </div>
                            );
                          }

                          if (activeToken) {
                            return (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: '#e0f2fe',
                                    color: '#0369a1',
                                    border: '1px solid #bae6fd',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                  }}
                                  title={`Token: ${activeToken} (Valid 7 days)`}
                                >
                                  <Clock size={11} /> Invite Active (7d)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(tokenUrl);
                                    showToast(`Deep link for ${parent.full_name} copied!`);
                                  }}
                                  className="btn btn-outline"
                                  style={{ padding: '2px 6px', fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                  title="Copy Telegram Deep Link"
                                >
                                  <Copy size={10} /> Copy
                                </button>
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-outline"
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: '10px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '2px',
                                    color: '#15803d',
                                    borderColor: '#bbf7d0',
                                    textDecoration: 'none',
                                  }}
                                  title="Share Invitation via WhatsApp"
                                >
                                  <Share2 size={10} /> WhatsApp
                                </a>
                              </div>
                            );
                          }

                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  fontWeight: 500,
                                }}
                              >
                                {isExpired ? 'Token Expired' : 'Uninvited'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenTelegramLink(parent)}
                                className="btn btn-outline"
                                style={{
                                  padding: '2px 8px',
                                  fontSize: '11px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                title="Generate One-Time Secure Deep Link"
                              >
                                <MessageCircle size={12} color="var(--gold-dark)" />
                                Invite
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Edit}
                            onClick={() => handleOpenEdit(parent)}
                            title="Edit Guardian"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setParentToDelete(parent)}
                            title="Delete Guardian"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PARENT MODAL */}
      <Modal
        isOpen={isAddModalOpen || Boolean(parentToEdit)}
        onClose={() => {
          setIsAddModalOpen(false);
          setParentToEdit(null);
        }}
        title={parentToEdit ? 'Edit Guardian Details' : 'Register New Parent / Guardian'}
        subtitle="Saved directly to Supabase public.parents"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddModalOpen(false);
                setParentToEdit(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveParent}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : parentToEdit ? 'Save Changes' : 'Confirm Registration'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveParent}>
          {modalError && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                borderRadius: '6px',
                color: 'var(--status-absent)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{modalError}</span>
            </div>
          )}

          <Input
            label="Guardian Full Name"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            placeholder="e.g. Karthikeyan Natarajan"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Primary Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98401 23400"
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="parent@domain.com"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Relationship to Student"
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
              options={['Father', 'Mother', 'Guardian', 'Other']}
            />

            <Select
              label="Preferred Alert Channel"
              value={formData.preferred_notification_channel}
              onChange={(e) => setFormData({ ...formData, preferred_notification_channel: e.target.value })}
              options={[
                { value: 'telegram', label: 'Telegram Bot' },
                { value: 'sms', label: 'SMS' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'email', label: 'Email' },
              ]}
            />
          </div>

          {!parentToEdit && (
            <Select
              label="Link to Student Ward (Optional)"
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              options={students.map((s) => ({
                value: s.id,
                label: `${s.full_name} (${s.admission_no})`,
              }))}
              placeholder="Select student to link..."
            />
          )}
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(parentToDelete)}
        onClose={() => setParentToDelete(null)}
        title="Confirm Guardian Deletion"
        subtitle="Supabase Row Deletion"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setParentToDelete(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Guardian'}
            </Button>
          </>
        }
      >
        {parentToDelete && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete guardian <strong>{parentToDelete.full_name}</strong> ({parentToDelete.phone})?
            </div>
          </div>
        )}
      </Modal>

      {/* TELEGRAM DEEP LINK & VERIFICATION MODAL */}
      {telegramModalParent && (
        <Modal
          isOpen={Boolean(telegramModalParent)}
          onClose={() => {
            setTelegramModalParent(null);
            setTelegramLinkMessage(null);
            setShowManualOverride(false);
          }}
          title={`Telegram Linking — ${telegramModalParent.full_name}`}
          subtitle="Automated 1-click invitation flow — no Chat ID entry required"
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTelegramModalParent(null);
                setTelegramLinkMessage(null);
                setShowManualOverride(false);
              }}
            >
              Close
            </Button>
          }
        >
          {(() => {
            const activeInv = invitationsMap[telegramModalParent.id] || (telegramModalParent.linking_token ? { token: telegramModalParent.linking_token, expires_at: telegramModalParent.linking_token_expires_at } : null);
            const tokenParam = activeInv?.token || telegramModalParent.id;
            const deepLinkUrl = getParentTelegramDeepLink(tokenParam);
            const appUri = getParentTelegramAppUri(tokenParam);
            const wardNames = (telegramModalParent.parent_students || [])
              .map((ps) => ps.students?.full_name)
              .filter(Boolean)
              .join(', ');
            const waUrl = getWhatsAppShareUrl(telegramModalParent, wardNames, deepLinkUrl);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Guardian Summary Card */}
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Guardian:</span>
                    <strong>{telegramModalParent.full_name} ({telegramModalParent.phone})</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Student Ward(s):</span>
                    <strong style={{ color: 'var(--navy-900)' }}>
                      {wardNames || 'No wards linked'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Telegram Status:</span>
                    {telegramModalParent.is_verified && telegramModalParent.telegram_chat_id ? (
                      <span style={{ color: 'var(--status-present)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <CheckCircle2 size={13} /> Linked &amp; Verified (Chat ID: {telegramModalParent.telegram_chat_id})
                      </span>
                    ) : (
                      <span style={{ color: '#d97706', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} /> Awaiting Parent Connection
                      </span>
                    )}
                  </div>
                </div>

                {/* Primary Automated 1-Click Link Card */}
                <div
                  style={{
                    padding: '16px',
                    border: '1px solid var(--gold-border)',
                    borderRadius: '8px',
                    backgroundColor: 'var(--gold-subtle-bg)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-950)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={15} color="var(--gold-dark)" />
                      Automated 1-Click Telegram Invitation
                    </div>
                    <button
                      type="button"
                      onClick={handleRegenerateToken}
                      className="btn btn-outline"
                      style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title="Generate a fresh single-use 7-day token"
                    >
                      <RefreshCw size={11} /> Fresh Token
                    </button>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.4 }}>
                    Share this unique invitation link with <strong>{telegramModalParent.full_name}</strong>. When opened, Telegram presents their child's name (<strong>{wardNames || 'ward'}</strong>) and links their account automatically upon tapping <em>Confirm &amp; Connect</em>. <u>The parent never needs to find or send their Chat ID.</u>
                  </div>

                  {/* Visual 3-step indicator */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '8px',
                      marginBottom: '12px',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <strong>1. Send Link</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Share via WhatsApp or SMS</div>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <strong>2. Tap Start</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Bot detects chat automatically</div>
                    </div>
                    <div style={{ padding: '8px', background: 'rgba(255,255,255,0.7)', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <strong>3. Tap Confirm</strong>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Instant link in Supabase</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      readOnly
                      value={deepLinkUrl}
                      className="form-input"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        backgroundColor: '#ffffff',
                        flex: '1 1 200px',
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Copy}
                      onClick={() => {
                        navigator.clipboard.writeText(deepLinkUrl);
                        showToast('Telegram deep link copied to clipboard!');
                      }}
                    >
                      Copy Link
                    </Button>
                    <a
                      href={appUri}
                      className="btn btn-sm btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                      title="Launch Telegram app directly on phone/desktop without web redirect"
                    >
                      Open in App <ExternalLink size={12} />
                    </a>
                    <a
                      href={deepLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                      title="Open via web landing page (t.me)"
                    >
                      Web Link
                    </a>
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-outline"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#15803d',
                        borderColor: '#bbf7d0',
                        textDecoration: 'none',
                        backgroundColor: '#f0fdf4',
                      }}
                      title="Share directly to parent on WhatsApp"
                    >
                      <Share2 size={12} /> WhatsApp
                    </a>
                  </div>
                </div>

                {/* Collapsible Admin Emergency Override */}
                <div
                  style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowManualOverride(!showManualOverride)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      background: 'none',
                      border: 'none',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Key size={13} />
                      Advanced Administrator Recovery: Manual Chat ID Override
                    </span>
                    {showManualOverride ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showManualOverride && (
                    <div
                      style={{
                        padding: '14px',
                        borderTop: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-subtle)',
                      }}
                    >
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Emergency recovery option only. Use this if the parent is unable to use the automated 1-click link above.
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="text"
                          placeholder="e.g. 987654321"
                          value={telegramChatIdInput}
                          onChange={(e) => setTelegramChatIdInput(e.target.value)}
                          className="form-input"
                          style={{ fontFamily: 'var(--font-mono)', flex: '1 1 180px' }}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          icon={ShieldCheck}
                          onClick={handleSaveTelegramChatId}
                          disabled={isLinkingTelegram}
                        >
                          {isLinkingTelegram ? 'Saving...' : 'Save Chat ID'}
                        </Button>
                        {telegramModalParent.telegram_chat_id && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleUnlinkTelegram}
                            disabled={isLinkingTelegram}
                          >
                            Unlink
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Messages */}
                {telegramLinkMessage?.success && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--status-present-bg)',
                      border: '1px solid var(--status-present-border)',
                      borderRadius: '6px',
                      color: 'var(--status-present)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle2 size={16} />
                    <span>{telegramLinkMessage.success}</span>
                  </div>
                )}
                {telegramLinkMessage?.error && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--status-absent-bg)',
                      border: '1px solid var(--status-absent-border)',
                      borderRadius: '6px',
                      color: 'var(--status-absent)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{telegramLinkMessage.error}</span>
                  </div>
                )}
              </div>
            );
          })()}
        </Modal>
      )}

      {/* BULK PARENT INVITATIONS MODAL */}
      <Modal
        isOpen={isBulkInviteModalOpen}
        onClose={() => setIsBulkInviteModalOpen(false)}
        title="Send Bulk Parent Invitations"
        subtitle="Generate secure single-use Telegram tokens (7-day validity) & WhatsApp invites"
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {bulkInviteResults ? (
                <span>Processed {bulkInviteResults.total} guardians</span>
              ) : (
                <span>Tokens are time-limited to 7 days for strict security</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkInviteModalOpen(false)}
              >
                Close
              </Button>
              {!bulkInviteResults ? (
                <Button
                  variant="gold"
                  size="sm"
                  icon={Send}
                  onClick={handleRunBulkInvitations}
                  disabled={isDispatchingInvites}
                >
                  {isDispatchingInvites ? 'Generating Invitations...' : 'Generate & Prepare Invitations'}
                </Button>
              ) : bulkInviteResults.failedCount > 0 ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={handleRetryFailedInvitations}
                  disabled={isDispatchingInvites}
                >
                  {isDispatchingInvites ? 'Retrying...' : `Retry ${bulkInviteResults.failedCount} Failed`}
                </Button>
              ) : null}
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Configuration Form (when results not yet generated) */}
          {!bulkInviteResults && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                }}
              >
                <div>
                  <label className="form-label" style={{ marginBottom: '6px' }}>Target Scope</label>
                  <select
                    className="form-select"
                    value={bulkInviteScope}
                    onChange={(e) => setBulkInviteScope(e.target.value)}
                  >
                    <option value="unlinked">Unlinked Guardians Only ({parents.length - linkedCount})</option>
                    <option value="pending">Refresh Active / Pending Invites ({pendingCount})</option>
                    <option value="all">All Registered Guardians ({parents.length})</option>
                  </select>
                </div>

                <div>
                  <label className="form-label" style={{ marginBottom: '6px' }}>Invitation Channel</label>
                  <select
                    className="form-select"
                    value={bulkInviteChannel}
                    onChange={(e) => setBulkInviteChannel(e.target.value)}
                  >
                    <option value="telegram">Telegram Bot Deep Link (Recommended)</option>
                    <option value="whatsapp">WhatsApp Direct Invite Link</option>
                  </select>
                </div>
              </div>

              {/* Informational callout regarding WhatsApp & Telegram delivery */}
              <div
                style={{
                  padding: '12px 14px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                  Transparent Multi-Channel Notice:
                </div>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <li>
                    <strong>Telegram:</strong> Secure single-use deep links (<code>https://t.me/RuparelAttendanceBot?start=tk_...</code>) are generated with a 7-day expiration.
                  </li>
                  <li>
                    <strong>WhatsApp:</strong> Cloud API is currently unconfigured. The system provides <strong>1-click manual WhatsApp share links</strong> with prefilled invitation messages and deep links for each parent.
                  </li>
                  <li>
                    A parent must explicitly press <strong>Start</strong> in Telegram to link their account. Accounts are never marked linked until verified.
                  </li>
                </ul>
              </div>
            </>
          )}

          {/* Results View */}
          {bulkInviteResults && (
            <div>
              {/* Counters */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                  gap: '10px',
                  marginBottom: '14px',
                }}
              >
                <div style={{ padding: '8px 10px', backgroundColor: '#f1f5f9', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Targeted</div>
                  <div style={{ fontSize: '16px', fontWeight: 700 }}>{bulkInviteResults.total}</div>
                </div>
                <div style={{ padding: '8px 10px', backgroundColor: 'var(--status-present-bg)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--status-present-border)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--status-present)' }}>Generated</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-present)' }}>{bulkInviteResults.successCount}</div>
                </div>
                {bulkInviteResults.failedCount > 0 && (
                  <div style={{ padding: '8px 10px', backgroundColor: 'var(--status-absent-bg)', borderRadius: '4px', textAlign: 'center', border: '1px solid var(--status-absent-border)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--status-absent)' }}>Failed</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-absent)' }}>{bulkInviteResults.failedCount}</div>
                  </div>
                )}
              </div>

              {/* Action buttons inside result */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
                  Generated Invitation Links &amp; Actions
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBulkInviteResults(null)}
                >
                  Generate New Batch
                </Button>
              </div>

              {/* Scrollable List */}
              <div
                style={{
                  maxHeight: '320px',
                  overflowY: 'auto',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                }}
              >
                <table className="erp-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th>Guardian</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkInviteResults.items.map((item) => {
                      const parentObj = parents.find((p) => p.id === item.parentId) || { full_name: item.parentName, phone: item.phone };
                      const wardNames = (parentObj.parent_students || [])
                        .map((ps) => ps.students?.full_name)
                        .filter(Boolean)
                        .join(', ');
                      const waShareUrl = getWhatsAppShareUrl(parentObj, wardNames, item.deepLink);

                      return (
                        <tr key={item.parentId}>
                          <td>
                            <strong>{item.parentName}</strong>
                            {wardNames && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Ward: {wardNames}</div>}
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{item.phone}</td>
                          <td>
                            {item.success ? (
                              <span style={{ fontSize: '11px', color: 'var(--status-present)', fontWeight: 600 }}>
                                ✓ Ready (7d)
                              </span>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--status-absent)' }}>
                                ✗ {item.error || 'Failed'}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {item.success && (
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  icon={Copy}
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.deepLink);
                                    showToast(`Deep link copied for ${item.parentName}!`);
                                  }}
                                  title="Copy Telegram Link"
                                >
                                  Copy Link
                                </Button>
                                <a
                                  href={waShareUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-outline"
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    color: '#15803d',
                                    borderColor: '#bbf7d0',
                                    textDecoration: 'none',
                                    padding: '4px 8px',
                                    fontSize: '11px',
                                  }}
                                  title="Share invitation via WhatsApp"
                                >
                                  <Share2 size={12} /> WhatsApp
                                </a>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialEntity="parents"
        onImportSuccess={() => {
          fetchData();
          showToast('Parent directory bulk import completed successfully!');
        }}
      />
    </div>
  );
}
