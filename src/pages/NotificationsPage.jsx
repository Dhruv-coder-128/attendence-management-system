import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Send,
  Bell,
  Plus,
  Sparkles,
  AlertCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Video,
  Trash2,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { sendBatchBroadcastNotification } from '../lib/telegramClient';

/**
 * Notifications and Telegram Alert Broadcast Manager
 * Features real database-backed Telegram dispatch audit logs + outbox announcements
 */
export default function NotificationsPage({ notifications = [], onBroadcast }) {
  const [activeTab, setActiveTab] = useState('dispatchLogs'); // 'dispatchLogs' | 'broadcast'
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logFilter, setLogFilter] = useState('all'); // 'all' | 'delivered' | 'failed'

  // Composer Modal State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [template, setTemplate] = useState('attendance');
  const [title, setTitle] = useState('Daily Morning Absentee Roll Call Notice');
  const [message, setMessage] = useState(
    'Dear Parent, Your ward was marked absent for the 06:30 AM morning session on 09-Oct-2026. Please contact academy reception to confirm whereabouts.'
  );
  const [channel, setChannel] = useState('Telegram Bot');
  const [audience, setAudience] = useState('Absentee Guardians (Today)');

  // Media Attachment State (Photo, PDF/Document, Video)
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'photo' | 'document' | 'video'
  const [mediaPreview, setMediaPreview] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState(null);
  const [dispatchFeedback, setDispatchFeedback] = useState(null);
  const fileInputRef = useRef(null);

  // Fetch Real Telegram Dispatch Audit Logs from Supabase public.attendance with full guardian hydration
  const fetchDispatchLogs = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setLoadingLogs(false);
      return;
    }
    setLoadingLogs(true);
    try {
      // 1. Fetch raw attendance records
      const { data: rawLogs, error } = await supabase
        .from('attendance')
        .select(`
          id,
          date,
          status,
          time_in,
          telegram_notified,
          telegram_notified_at,
          telegram_delivery_status,
          telegram_error,
          student_id,
          batch_id,
          students:student_id (
            id,
            admission_no,
            full_name,
            roll_no,
            guardian_name,
            guardian_phone,
            parent_students (
              is_primary_contact,
              parents:parent_id (
                id,
                full_name,
                phone,
                telegram_chat_id,
                is_verified
              )
            )
          ),
          batches:batch_id (
            id,
            code,
            name
          )
        `)
        .or('telegram_notified.eq.true,telegram_delivery_status.neq.unnotified')
        .order('telegram_notified_at', { ascending: false, nullsFirst: false })
        .limit(100);

      if (error) throw error;

      // 2. Fetch parents, parent_students, students for resilient hydration
      const [{ data: allParents }, { data: allParentStudents }, { data: allStudents }] = await Promise.all([
        supabase.from('parents').select('id, full_name, phone, telegram_chat_id, is_verified, admission_no, student_id'),
        supabase.from('parent_students').select('id, parent_id, student_id, is_primary_contact'),
        supabase.from('students').select('id, admission_no, full_name, roll_no, guardian_name, guardian_phone, batch_id'),
      ]);

      const parentMap = new Map((allParents || []).map((p) => [p.id, p]));
      const studentMap = new Map((allStudents || []).map((s) => [s.id, s]));

      // Map student_id -> primary parent
      const parentByStudentId = new Map();

      // Priority A: parent_students junction
      (allParentStudents || []).forEach((ps) => {
        const parent = parentMap.get(ps.parent_id);
        if (parent && (!parentByStudentId.has(ps.student_id) || ps.is_primary_contact)) {
          parentByStudentId.set(ps.student_id, parent);
        }
      });

      // Priority B: direct parent.student_id or parent.admission_no matching
      (allParents || []).forEach((p) => {
        if (p.student_id && !parentByStudentId.has(p.student_id)) {
          parentByStudentId.set(p.student_id, p);
        }
        if (p.admission_no) {
          const cleanAdm = String(p.admission_no).trim().toLowerCase();
          const matchedStudent = (allStudents || []).find(
            (s) => String(s.admission_no).trim().toLowerCase() === cleanAdm
          );
          if (matchedStudent && !parentByStudentId.has(matchedStudent.id)) {
            parentByStudentId.set(matchedStudent.id, p);
          }
        }
        if (p.phone) {
          const cleanPhone = String(p.phone).replace(/\D/g, '').slice(-7);
          if (cleanPhone.length >= 7) {
            const matchedStudent = (allStudents || []).find((s) => {
              const sp = String(s.guardian_phone || '').replace(/\D/g, '').slice(-7);
              return sp && sp === cleanPhone;
            });
            if (matchedStudent && !parentByStudentId.has(matchedStudent.id)) {
              parentByStudentId.set(matchedStudent.id, p);
            }
          }
        }
      });

      // Hydrate all logs so linked_guardian is ALWAYS set
      const hydratedLogs = (rawLogs || []).map((log) => {
        const st = log.students || studentMap.get(log.student_id);
        const resolvedParent =
          log.students?.parent_students?.[0]?.parents ||
          log.linked_guardian ||
          parentByStudentId.get(log.student_id) ||
          null;

        return {
          ...log,
          students: st,
          linked_guardian: resolvedParent,
        };
      });

      setDispatchLogs(hydratedLogs);
    } catch (err) {
      console.error('Failed to load dispatch logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchDispatchLogs();
  }, []);

  const handleTemplateChange = (tpl) => {
    setTemplate(tpl);
    if (tpl === 'attendance') {
      setTitle('Daily Morning Absentee Roll Call Notice');
      setMessage(
        'Dear Parent, Your ward was marked absent for the 06:30 AM morning session on 09-Oct-2026. Please contact academy reception to confirm whereabouts.'
      );
      setAudience('Absentee Guardians (Today)');
    } else if (tpl === 'reschedule') {
      setTitle('Batch Schedule Reschedule Notice');
      setMessage(
        'Attention Grade 12 JEE Batch: Mechanics Lecture tomorrow will commence at 07:00 AM instead of 06:30 AM due to laboratory calibration.'
      );
      setAudience('Grade 12 JEE Students & Guardians');
    } else if (tpl === 'fee') {
      setTitle('Term 1 Tuition Installment Reminder');
      setMessage(
        'Dear Guardian, Friendly reminder that Term 1 tuition installment reconciliation date is 15-Oct-2026. Kindly disregard if already cleared.'
      );
      setAudience('Pending Fee Accounts');
    } else {
      setTitle('General Academy Academic Notice');
      setMessage(
        'All Batches: Academy study halls will remain open until 09:30 PM this weekend for exam preparation.'
      );
      setAudience('All Registered Academy Students');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileTypeStr = file.type || '';
    let detectedType = 'document';
    if (fileTypeStr.startsWith('image/')) {
      detectedType = 'photo';
      setMediaPreview(URL.createObjectURL(file));
    } else if (fileTypeStr.startsWith('video/')) {
      detectedType = 'video';
      setMediaPreview(null);
    } else {
      detectedType = 'document';
      setMediaPreview(null);
    }

    setMediaFile(file);
    setMediaType(detectedType);
    setDispatchFeedback(null);
  };

  const handleRemoveFile = () => {
    setMediaFile(null);
    setMediaType(null);
    setMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();

    if (!title.trim() || !message.trim()) {
      alert('Please provide a subject title and message content.');
      return;
    }

    if (channel === 'Telegram Bot') {
      setIsDispatching(true);
      setDispatchFeedback(null);
      setDispatchProgress({ current: 0, total: 1, parentName: 'Initializing Gateway...' });

      try {
        const result = await sendBatchBroadcastNotification({
          title,
          message,
          category: template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic',
          audience,
          mediaFile,
          mediaType,
          mediaName: mediaFile?.name || '',
          onProgress: (p) => setDispatchProgress(p),
        });

        const newLog = {
          id: `notif-${Date.now()}`,
          title,
          message,
          category: template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic',
          channel,
          recipientsCount: result.deliveredCount || 0,
          totalTargeted: result.totalRecipients || 0,
          sentAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          status: result.success ? `Delivered (${result.deliveredCount} guardians)` : 'Failed',
          sender: 'Director Desk',
          mediaType,
          mediaName: mediaFile?.name || null,
        };

        onBroadcast(newLog);

        if (result.success) {
          alert(`✅ Broadcast delivered successfully to ${result.deliveredCount} verified guardian(s) via Telegram Bot API!`);
          setIsComposerOpen(false);
          handleRemoveFile();
        } else {
          setDispatchFeedback({
            success: false,
            message: result.error || 'Failed to dispatch telegram broadcast.',
            errors: result.errors,
          });
        }
      } catch (err) {
        setDispatchFeedback({
          success: false,
          message: err.message || 'Error occurred while sending broadcast.',
        });
      } finally {
        setIsDispatching(false);
      }
    } else {
      // Non-Telegram Outbox
      const newLog = {
        id: `notif-${Date.now()}`,
        title,
        message,
        category: template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic',
        channel,
        recipientsCount: audience.includes('Registered') ? 45 : audience.includes('Absentee') ? 12 : 25,
        sentAt: 'Just now',
        status: 'Queued (Outbox)',
        sender: 'Director Desk',
        mediaType,
        mediaName: mediaFile?.name || null,
      };

      onBroadcast(newLog);
      setIsComposerOpen(false);
      handleRemoveFile();
    }
  };

  const handleResendBroadcast = async (broadcastItem) => {
    if (broadcastItem.channel !== 'Telegram Bot') {
      alert(`Re-dispatch is only available for Telegram Bot gateway.`);
      return;
    }
    if (!confirm(`Re-dispatch broadcast "${broadcastItem.title}" to all verified guardians now?`)) {
      return;
    }

    try {
      const result = await sendBatchBroadcastNotification({
        title: broadcastItem.title,
        message: broadcastItem.message,
        category: broadcastItem.category,
        audience: 'All Registered Academy Students',
      });

      if (result.success) {
        alert(`✅ Broadcast re-dispatched to ${result.deliveredCount} guardians!`);
        // Update item in local list
        const updated = {
          ...broadcastItem,
          status: `Delivered (${result.deliveredCount} guardians)`,
          sentAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          recipientsCount: result.deliveredCount,
        };
        onBroadcast(updated);
      } else {
        alert(`❌ Dispatch failed: ${result.error}`);
      }
    } catch (err) {
      alert(`Error re-dispatching: ${err.message}`);
    }
  };

  // Filtered Dispatch Logs
  const filteredDispatchLogs = useMemo(() => {
    if (logFilter === 'delivered') {
      return dispatchLogs.filter((l) => l.telegram_delivery_status === 'delivered' || l.telegram_notified);
    }
    if (logFilter === 'failed') {
      return dispatchLogs.filter((l) => l.telegram_delivery_status === 'failed' || Boolean(l.telegram_error));
    }
    return dispatchLogs;
  }, [dispatchLogs, logFilter]);

  // Metric counts
  const deliveredCount = dispatchLogs.filter((l) => l.telegram_delivery_status === 'delivered' || l.telegram_notified).length;
  const failedCount = dispatchLogs.filter((l) => l.telegram_delivery_status === 'failed' || Boolean(l.telegram_error)).length;

  const broadcastColumns = [
    {
      header: 'Broadcast Notice Title',
      key: 'title',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {item.title}
            {item.mediaType && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                }}
              >
                {item.mediaType === 'photo' && <ImageIcon size={11} />}
                {item.mediaType === 'document' && <FileText size={11} />}
                {item.mediaType === 'video' && <Video size={11} />}
                {item.mediaType.toUpperCase()}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              maxWidth: '360px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.message}
          </div>
        </div>
      ),
    },
    {
      header: 'Category',
      key: 'category',
      render: (item) => <Badge status={item.category} />,
    },
    {
      header: 'Gateway Channel',
      key: 'channel',
      render: (item) => (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: '4px',
            backgroundColor: item.channel.includes('Telegram') ? '#e0f2fe' : '#f1f5f9',
            color: item.channel.includes('Telegram') ? '#0369a1' : 'var(--text-secondary)',
          }}
        >
          {item.channel}
        </span>
      ),
    },
    {
      header: 'Recipients',
      key: 'recipientsCount',
      render: (item) => <strong>{item.recipientsCount} guardians</strong>,
    },
    {
      header: 'Dispatched At',
      key: 'sentAt',
      render: (item) => <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{item.sentAt}</span>,
    },
    {
      header: 'Status',
      key: 'status',
      render: (item) => {
        const isDelivered = String(item.status || '').toLowerCase().includes('delivered');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: isDelivered ? 'var(--status-present)' : '#d97706',
                backgroundColor: isDelivered ? 'var(--status-present-bg)' : '#fef3c7',
                padding: '2px 8px',
                borderRadius: '4px',
                border: `1px solid ${isDelivered ? 'var(--status-present-border)' : '#fde68a'}`,
              }}
            >
              {isDelivered ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {item.status}
            </span>
            {!isDelivered && item.channel === 'Telegram Bot' && (
              <button
                type="button"
                onClick={() => handleResendBroadcast(item)}
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#0284c7',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                }}
              >
                Send Now
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const dispatchColumns = [
    {
      header: 'Student Ward',
      key: 'student',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
            {item.students?.full_name || 'Unknown Student'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Adm: {item.students?.admission_no || '—'} &bull; Roll: {item.students?.roll_no || '—'}
          </div>
        </div>
      ),
    },
    {
      header: 'Cohort Batch',
      key: 'batch',
      render: (item) => (
        <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
          {item.batches?.code || item.batches?.name || '—'}
        </span>
      ),
    },
    {
      header: 'Session & Roll Call Status',
      key: 'status',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Badge status={item.status}>{item.status}</Badge>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.date}</span>
        </div>
      ),
    },
    {
      header: 'Linked Guardian',
      key: 'guardian',
      render: (item) => {
        const parent = item.linked_guardian || item.students?.parent_students?.[0]?.parents;
        const guardianName = parent?.full_name || item.students?.guardian_name || 'Guardian Unassigned';
        const guardianPhone = parent?.phone || item.students?.guardian_phone || 'No phone';
        return (
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
              {guardianName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {guardianPhone}
            </div>
          </div>
        );
      },
    },
    {
      header: 'Chat ID Target',
      key: 'chatId',
      render: (item) => {
        const parent = item.linked_guardian || item.students?.parent_students?.[0]?.parents;
        const chatId = parent?.telegram_chat_id;
        return chatId ? (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              padding: '2px 6px',
              backgroundColor: '#f1f5f9',
              borderRadius: '4px',
              color: '#334155',
            }}
          >
            {chatId}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unlinked</span>
        );
      },
    },
    {
      header: 'Delivery Status',
      key: 'delivery',
      render: (item) => {
        const isDelivered = item.telegram_delivery_status === 'delivered' || item.telegram_notified;
        const isFailed = item.telegram_delivery_status === 'failed' || Boolean(item.telegram_error);

        if (isDelivered) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--status-present)',
                backgroundColor: 'var(--status-present-bg)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid var(--status-present-border)',
              }}
            >
              <CheckCircle2 size={12} /> Delivered
            </span>
          );
        }

        if (isFailed) {
          return (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--status-absent)',
                backgroundColor: 'var(--status-absent-bg)',
                padding: '2px 8px',
                borderRadius: '4px',
                border: '1px solid var(--status-absent-border)',
              }}
              title={item.telegram_error || 'Dispatch error'}
            >
              <XCircle size={12} /> Failed
            </span>
          );
        }

        return (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              backgroundColor: '#f8fafc',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            Pending
          </span>
        );
      },
    },
    {
      header: 'Dispatched Timestamp',
      key: 'timestamp',
      render: (item) => (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {item.telegram_notified_at
            ? new Date(item.telegram_notified_at).toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-description">
            Review parent alert delivery status, audit Telegram dispatch logs, and send broadcasts
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px' }}>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchDispatchLogs}
            disabled={loadingLogs}
          >
            {loadingLogs ? 'Refreshing...' : 'Refresh Logs'}
          </Button>

          <Button
            variant="gold"
            size="sm"
            icon={Plus}
            onClick={() => setIsComposerOpen(true)}
          >
            Compose Broadcast
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 18px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid #0369a1',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Total Telegram Dispatches
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#0369a1', marginTop: '4px' }}>
            {dispatchLogs.length} Records
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Audited from public.attendance
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 18px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--status-present)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Successfully Delivered
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-present)', marginTop: '4px' }}>
            {deliveredCount} Alerts
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Confirmed by Telegram Bot API
          </div>
        </div>

        <div
          style={{
            backgroundColor: failedCount > 0 ? 'var(--status-absent-bg)' : '#ffffff',
            padding: '14px 18px',
            borderRadius: '6px',
            border: `1px solid ${failedCount > 0 ? 'var(--status-absent-border)' : 'var(--border-subtle)'}`,
            borderLeft: '3px solid var(--status-absent)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--status-absent)', textTransform: 'uppercase', fontWeight: 600 }}>
            Delivery Exceptions
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-absent)', marginTop: '4px' }}>
            {failedCount} Alerts
          </div>
          <div style={{ fontSize: '11px', color: 'var(--status-absent)', marginTop: '2px' }}>
            Chat not found or unverified
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 18px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderLeft: '3px solid var(--gold-primary)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Broadcast Outbox
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold-dark)', marginTop: '4px' }}>
            {notifications.length} Announcements
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Administrative broadcasts
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('dispatchLogs')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'dispatchLogs' ? '2px solid var(--navy-900)' : '2px solid transparent',
            color: activeTab === 'dispatchLogs' ? 'var(--navy-950)' : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Bell size={16} color={activeTab === 'dispatchLogs' ? 'var(--navy-900)' : 'var(--text-muted)'} />
          <span>Live Telegram Roll Call Dispatches</span>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '10px',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              fontWeight: 700,
            }}
          >
            {dispatchLogs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('broadcast')}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'broadcast' ? '2px solid var(--navy-900)' : '2px solid transparent',
            color: activeTab === 'broadcast' ? 'var(--navy-950)' : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Send size={16} color={activeTab === 'broadcast' ? 'var(--gold-dark)' : 'var(--text-muted)'} />
          <span>Outbox Broadcast Notices</span>
          <span
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: '10px',
              backgroundColor: 'var(--gold-subtle-bg)',
              color: 'var(--gold-dark)',
              fontWeight: 700,
            }}
          >
            {notifications.length}
          </span>
        </button>
      </div>

      {activeTab === 'dispatchLogs' ? (
        <div>
          {/* Sub-toolbar with filter buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'inline-flex', borderRadius: '5px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setLogFilter('all')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: logFilter === 'all' ? 'var(--navy-900)' : '#ffffff',
                  color: logFilter === 'all' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                All Dispatches ({dispatchLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('delivered')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderLeft: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  backgroundColor: logFilter === 'delivered' ? 'var(--status-present)' : '#ffffff',
                  color: logFilter === 'delivered' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                Delivered Only ({deliveredCount})
              </button>
              <button
                type="button"
                onClick={() => setLogFilter('failed')}
                style={{
                  padding: '5px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  border: 'none',
                  borderLeft: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  backgroundColor: logFilter === 'failed' ? 'var(--status-absent)' : '#ffffff',
                  color: logFilter === 'failed' ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                Exceptions / Failed ({failedCount})
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Showing {filteredDispatchLogs.length} audit records
            </div>
          </div>

          <DataTable
            columns={dispatchColumns}
            data={filteredDispatchLogs}
            searchPlaceholder="Search by student, admission no, or guardian..."
          />
        </div>
      ) : (
        <div>
          <div
            style={{
              marginBottom: '18px',
              padding: '12px 16px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #bae6fd',
              borderRadius: '6px',
              color: '#0369a1',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>
              <strong>Administrative Outbox Mode:</strong> Broadcast messages and announcements are queued and logged in the ERP communication history.
            </span>
          </div>

          <DataTable
            columns={broadcastColumns}
            data={notifications}
            searchPlaceholder="Search past broadcast dispatches..."
          />
        </div>
      )}

      {/* Composer Modal */}
      <Modal
        isOpen={isComposerOpen}
        onClose={() => {
          if (!isDispatching) {
            setIsComposerOpen(false);
          }
        }}
        title="Compose Telegram &amp; Parent Alert"
        subtitle="Format announcement and dispatch directly via Telegram Bot API with media attachments"
        footer={
          <>
            <Button variant="outline" size="sm" disabled={isDispatching} onClick={() => setIsComposerOpen(false)}>
              Discard
            </Button>
            <Button
              variant="gold"
              size="sm"
              icon={isDispatching ? Loader2 : Send}
              disabled={isDispatching}
              onClick={handleSend}
            >
              {isDispatching ? 'Dispatching...' : 'Dispatch Broadcast'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSend}>
          {/* Dispatching Progress Banner */}
          {isDispatching && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 16px',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#1e40af',
              }}
            >
              <Loader2 size={20} className="spin" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>
                  Broadcasting live via Telegram Bot...
                </div>
                {dispatchProgress && (
                  <div style={{ fontSize: '12px', color: '#3b82f6' }}>
                    Sent {dispatchProgress.current} of {dispatchProgress.total} &bull; Targeting: {dispatchProgress.parentName}
                  </div>
                )}
              </div>
            </div>
          )}

          {dispatchFeedback && !dispatchFeedback.success && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                color: '#991b1b',
                fontSize: '12px',
              }}
            >
              <strong>Dispatch Issue:</strong> {dispatchFeedback.message}
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label className="form-label">Template Preset</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              <button
                type="button"
                className={`btn btn-sm ${template === 'attendance' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleTemplateChange('attendance')}
              >
                Absentee Roll Call
              </button>
              <button
                type="button"
                className={`btn btn-sm ${template === 'reschedule' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleTemplateChange('reschedule')}
              >
                Batch Reschedule
              </button>
              <button
                type="button"
                className={`btn btn-sm ${template === 'fee' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleTemplateChange('fee')}
              >
                Fee Reminder
              </button>
              <button
                type="button"
                className={`btn btn-sm ${template === 'general' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => handleTemplateChange('general')}
              >
                General Notice
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <Select
              label="Gateway Channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
              options={['Telegram Bot', 'SMS Broadcast', 'WhatsApp Gateway']}
            />
            <Select
              label="Target Recipient Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              options={[
                'All Registered Academy Students',
                'Absentee Guardians (Today)',
                'Active Batches & Guardians',
                'Pending Fee Accounts',
              ]}
            />
          </div>

          <Input
            label="Notice Subject / Headline"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label className="form-label">Message Content</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports formatting: *bold*, _italic_, and line breaks
            </span>
          </div>

          {/* Media Attachment Selector (Photo, PDF, Video) */}
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Paperclip size={14} /> Attach Media (Photo / PDF Document / Video)
            </label>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*,video/*,.pdf,.doc,.docx"
              style={{ display: 'none' }}
              id="broadcast-media-input"
            />

            {!mediaFile ? (
              <label
                htmlFor="broadcast-media-input"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '6px',
                  backgroundColor: '#f8fafc',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                }}
              >
                <UploadCloud size={16} /> Choose Photo (JPG/PNG), PDF Document, or Video (MP4)
              </label>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {mediaType === 'photo' && <ImageIcon size={20} color="#16a34a" />}
                  {mediaType === 'document' && <FileText size={20} color="#2563eb" />}
                  {mediaType === 'video' && <Video size={20} color="#9333ea" />}
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {mediaFile.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {(mediaFile.size / 1024).toFixed(1)} KB &bull; Type: {mediaType.toUpperCase()}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRemoveFile}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Remove attachment"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            )}

            {mediaPreview && (
              <div style={{ marginTop: '8px', textAlign: 'center' }}>
                <img
                  src={mediaPreview}
                  alt="Attachment preview"
                  style={{
                    maxHeight: '140px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    objectFit: 'contain',
                  }}
                />
              </div>
            )}
          </div>

          {/* Telegram Preview Bubble */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#f0fdf4',
              borderRadius: '6px',
              border: '1px solid #bbf7d0',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: '#166534', marginBottom: '4px' }}>
              <Sparkles size={14} /> Telegram Message Preview
            </div>
            <div style={{ color: '#14532d', fontStyle: 'italic' }}>
              &quot;{message}&quot;
            </div>
            {mediaFile && (
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#15803d', fontWeight: 500 }}>
                📎 Attached: {mediaFile.name} ({mediaType.toUpperCase()})
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
