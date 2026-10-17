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
  Eye,
  Smartphone,
  Check,
  Copy,
  ExternalLink,
  Download,
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { sendBatchBroadcastNotification, getSchoolTelegramSettings } from '../lib/telegramClient';
import { getAcademySettings } from '../lib/academySettings';

/**
 * Notifications and Telegram Alert Broadcast Manager
 * Features real database-backed Telegram dispatch audit logs + outbox announcements
 */
export default function NotificationsPage({ notifications = [], onBroadcast, onRefreshCounts }) {
  const [activeTab, setActiveTab] = useState('dispatchLogs'); // 'dispatchLogs' | 'broadcast'
  const [dispatchLogs, setDispatchLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logFilter, setLogFilter] = useState('all'); // 'all' | 'delivered' | 'failed'

  // Clear unread notifications badge immediately on page view
  useEffect(() => {
    try {
      localStorage.setItem('sms_last_viewed_notifications', new Date().toISOString());
    } catch {}
    if (onRefreshCounts) onRefreshCounts();
  }, [onRefreshCounts]);

  // Composer Modal State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [template, setTemplate] = useState('attendance');
  const [title, setTitle] = useState('Daily Morning Absentee Roll Call Notice');
  const [message, setMessage] = useState(
    'Dear Parent, Your ward was marked absent for the 06:30 AM morning session on 09-Oct-2026. Please contact academy reception to confirm whereabouts.'
  );
  const [channel, setChannel] = useState('Telegram Bot');
  const [audience, setAudience] = useState('Absentee Guardians (Today)');

  // Multi-attachment Media State (Photos, PDF Documents, Videos)
  const [mediaFiles, setMediaFiles] = useState([]); // [{ id, file, type, name, size, dataUrl }, ...]
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState(null); // 'photo' | 'document' | 'video'
  const [mediaPreview, setMediaPreview] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchProgress, setDispatchProgress] = useState(null);
  const [dispatchFeedback, setDispatchFeedback] = useState(null);
  const fileInputRef = useRef(null);

  // Broadcast Detail & Phone Preview State
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const telegramSettings = useMemo(() => getSchoolTelegramSettings(), []);
  const academySettings = useMemo(() => getAcademySettings(), []);

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

      // Hydrate all logs so linked_guardian is ALWAYS set, filtering strictly for student roll calls
      const validRollCallLogs = (rawLogs || []).filter((log) => Boolean(log && log.student_id));
      const hydratedLogs = validRollCallLogs.map((log) => {
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
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const fileTypeStr = file.type || '';
      let detectedType = 'document';
      if (fileTypeStr.startsWith('image/')) {
        detectedType = 'photo';
      } else if (fileTypeStr.startsWith('video/')) {
        detectedType = 'video';
      } else {
        detectedType = 'document';
      }

      const id = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const reader = new FileReader();
      reader.onload = () => {
        setMediaFiles((prev) => {
          const updated = [
            ...prev,
            {
              id,
              file,
              type: detectedType,
              name: file.name,
              size: file.size,
              dataUrl: reader.result,
            },
          ];
          if (updated.length > 0) {
            setMediaFile(updated[0].file);
            setMediaType(updated[0].type);
            setMediaPreview(updated[0].dataUrl);
          }
          return updated;
        });
      };
      reader.readAsDataURL(file);
    });

    setDispatchFeedback(null);
  };

  const handleRemoveMediaFile = (id) => {
    setMediaFiles((prev) => {
      const updated = prev.filter((m) => m.id !== id);
      if (updated.length > 0) {
        setMediaFile(updated[0].file);
        setMediaType(updated[0].type);
        setMediaPreview(updated[0].dataUrl);
      } else {
        setMediaFile(null);
        setMediaType(null);
        setMediaPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return updated;
    });
  };

  const handleClearAllMedia = () => {
    setMediaFiles([]);
    setMediaFile(null);
    setMediaType(null);
    setMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = () => {
    handleClearAllMedia();
  };

  const handleOpenDetail = (item) => {
    setSelectedNotice(item);
    setIsDetailModalOpen(true);
  };

  const handleCopyNoticeText = (text) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2000);
    }
  };

  const handleCloneNotice = (item) => {
    setTitle(item.title || '');
    setMessage(item.message || '');
    if (item.category === 'Attendance') setTemplate('attendance');
    else if (item.category === 'Fee Alert') setTemplate('fee');
    else setTemplate('general');
    setChannel(item.channel || 'Telegram Bot');
    if (item.attachments && item.attachments.length > 0) {
      setMediaFiles(item.attachments);
      setMediaFile(item.attachments[0].file || null);
      setMediaType(item.attachments[0].type);
      setMediaPreview(item.attachments[0].dataUrl);
    } else if (item.mediaType) {
      const single = {
        id: `media-clone-${Date.now()}`,
        type: item.mediaType,
        name: item.mediaName || 'Attachment',
        size: 0,
        dataUrl: item.mediaDataUrl,
      };
      setMediaFiles([single]);
      setMediaType(item.mediaType);
      setMediaPreview(item.mediaDataUrl || null);
    } else {
      handleClearAllMedia();
    }
    setIsDetailModalOpen(false);
    setIsComposerOpen(true);
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
        const primaryMedia = mediaFiles[0] || (mediaFile ? { file: mediaFile, type: mediaType, name: mediaFile.name, dataUrl: mediaPreview } : null);
        const result = await sendBatchBroadcastNotification({
          title,
          message,
          category: template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic',
          audience,
          mediaFiles,
          mediaFile: primaryMedia?.file || null,
          mediaType: primaryMedia?.type || null,
          mediaName: primaryMedia?.name || '',
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
          mediaType: primaryMedia?.type || null,
          mediaName: primaryMedia?.name || null,
          mediaDataUrl: primaryMedia?.dataUrl || null,
          attachments: mediaFiles.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            size: m.size,
            dataUrl: m.dataUrl,
          })),
        };

        onBroadcast(newLog);

        if (result.success) {
          alert(`✅ Broadcast delivered successfully to ${result.deliveredCount} verified guardian(s) via Telegram Bot API!`);
          setIsComposerOpen(false);
          handleClearAllMedia();
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
        mediaDataUrl: mediaPreview || null,
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
    {
      header: 'Actions',
      key: 'actions',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            type="button"
            onClick={() => handleOpenDetail(item)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '4px 9px',
              borderRadius: '5px',
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            title="Inspect media and Telegram parent phone preview"
          >
            <Eye size={12} />
            <span>View Detail</span>
          </button>
        </div>
      ),
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
            key="table-live-roll-call"
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
            key="table-outbox-broadcast"
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
        title="Compose Telegram & Parent Alert"
        subtitle="Format announcement and dispatch directly via Telegram Bot API with real-time smartphone preview"
        size="dossier"
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

          {/* 2-Column Responsive Layout: Left Form Controls | Right Live Smartphone Screen */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(360px, 1.25fr) minmax(320px, 1fr)',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Form Inputs & Multi-Attachment Dropzone */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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

              <div className="form-group" style={{ margin: 0 }}>
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

              {/* Multi-Media Attachment Selector (Photos, PDF Documents, Videos) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <Paperclip size={14} /> Attach Media (Photos, PDFs, Videos)
                  </label>
                  {mediaFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllMedia}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#dc2626',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Clear All ({mediaFiles.length})
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  multiple
                  style={{ display: 'none' }}
                  id="broadcast-media-input"
                />

                <label
                  htmlFor="broadcast-media-input"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '14px 16px',
                    border: '1.5px dashed #cbd5e1',
                    borderRadius: '8px',
                    backgroundColor: '#f8fafc',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--navy-900)', fontWeight: 600 }}>
                    <UploadCloud size={18} color="var(--primary)" />
                    <span>Choose Multiple Files or Drop Here</span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Attach Photos (JPG/PNG), PDF Documents, or Videos (MP4)
                  </span>
                </label>

                {/* Attached Media List / Chips */}
                {mediaFiles.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                    {mediaFiles.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          {item.type === 'photo' && (
                            item.dataUrl ? (
                              <img src={item.dataUrl} alt="thumb" style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }} />
                            ) : (
                              <ImageIcon size={18} color="#16a34a" />
                            )
                          )}
                          {item.type === 'video' && <Video size={18} color="#9333ea" />}
                          {item.type === 'document' && <FileText size={18} color="#2563eb" />}

                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '240px' }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                              {(item.size / 1024).toFixed(1)} KB &bull; Type: {item.type.toUpperCase()}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveMediaFile(item.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Remove this attachment"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Live Telegram Smartphone Screen Mockup */}
            <div style={{ position: 'sticky', top: '0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-950)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Smartphone size={15} color="var(--primary)" /> Telegram Parent Live View
                </label>
                <span style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
                  Live Updating
                </span>
              </div>

              {/* Realistic Smartphone Shell */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '340px',
                  margin: '0 auto',
                  border: '3px solid #1e293b',
                  borderRadius: '28px',
                  backgroundColor: '#0f172a',
                  padding: '8px 6px 12px 6px',
                  boxShadow: '0 16px 30px -6px rgba(0,0,0,0.3)',
                }}
              >
                {/* Speaker notch */}
                <div style={{ width: '50px', height: '4px', backgroundColor: '#334155', borderRadius: '2px', margin: '0 auto 8px auto' }} />

                {/* Telegram App Container */}
                <div
                  style={{
                    borderRadius: '20px',
                    overflow: 'hidden',
                    backgroundColor: '#8da8b8',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '430px',
                    maxHeight: '490px',
                  }}
                >
                  {/* Top Telegram Header Bar */}
                  <div
                    style={{
                      backgroundColor: '#517da2',
                      color: '#ffffff',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        color: '#517da2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      🎓
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {telegramSettings.botName || academySettings.academy_name || 'SMS Academy'}
                        <CheckCircle2 size={11} fill="#38bdf8" color="#ffffff" />
                      </div>
                      <div style={{ fontSize: '9.5px', color: '#e0f2fe' }}>
                        bot &bull; @{telegramSettings.botUsername || 'sms_attendance_bot'}
                      </div>
                    </div>
                  </div>

                  {/* Chat Feed */}
                  <div
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      backgroundImage: 'radial-gradient(#9cb5c5 10%, transparent 11%)',
                      backgroundSize: '14px 14px',
                      overflowY: 'auto',
                    }}
                  >
                    {/* Today pill */}
                    <div style={{ textAlign: 'center', margin: '2px 0' }}>
                      <span style={{ fontSize: '9.5px', fontWeight: 600, backgroundColor: 'rgba(0,0,0,0.22)', color: '#ffffff', padding: '1px 8px', borderRadius: '10px' }}>
                        Today
                      </span>
                    </div>

                    {/* Telegram Inbound Message Bubble */}
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px 12px 12px 2px',
                        padding: '8px 10px',
                        maxWidth: '96%',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {/* Attached Media Previews */}
                      {mediaFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Photos */}
                          {mediaFiles.filter((m) => m.type === 'photo').map((photo, pIdx) => (
                            photo.dataUrl ? (
                              <img
                                key={photo.id || pIdx}
                                src={photo.dataUrl}
                                alt="Photo preview"
                                style={{
                                  width: '100%',
                                  maxHeight: '130px',
                                  objectFit: 'cover',
                                  borderRadius: '6px',
                                }}
                              />
                            ) : null
                          ))}

                          {/* Videos */}
                          {mediaFiles.filter((m) => m.type === 'video').map((vid, vIdx) => (
                            <div
                              key={vid.id || vIdx}
                              style={{
                                width: '100%',
                                padding: '14px 10px',
                                backgroundColor: '#0f172a',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '11px',
                                gap: '6px',
                              }}
                            >
                              <Video size={16} color="#a855f7" />
                              <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {vid.name || 'Video Attachment'}
                              </span>
                            </div>
                          ))}

                          {/* Documents */}
                          {mediaFiles.filter((m) => m.type === 'document').map((doc, dIdx) => (
                            <div
                              key={doc.id || dIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                backgroundColor: '#f1f5f9',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <FileText size={16} color="#dc2626" />
                              <div style={{ overflow: 'hidden', flex: 1 }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy-950)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {doc.name || 'Academic Document.pdf'}
                                </div>
                                <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                                  {(doc.size / 1024).toFixed(0)} KB &bull; PDF Document
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Subject Title */}
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>
                        📢 {title || 'Notice Subject Headline'}
                      </div>

                      {/* Sub-header */}
                      <div style={{ fontSize: '9.5px', color: '#64748b', fontStyle: 'italic', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                        {telegramSettings.botName || 'SMS Academy'} &bull; {template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic Notice'}
                      </div>

                      {/* Message Content */}
                      <div style={{ fontSize: '11px', color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                        {message || 'Type your message on the left to see the live Telegram preview...'}
                      </div>

                      {/* Bubble Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', marginTop: '2px' }}>
                        <span style={{ fontSize: '9px', color: '#94a3b8' }}>
                          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span style={{ color: '#0284c7', fontSize: '10px', fontWeight: 700 }}>✓✓</span>
                      </div>
                    </div>
                  </div>

                  {/* Telegram bottom chat input mockup */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      padding: '6px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    <Paperclip size={14} color="#64748b" />
                    <div style={{ flex: 1, fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                      Broadcast message...
                    </div>
                    <Send size={13} color="#517da2" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Broadcast Notice Detail & Live Media / Telegram Smartphone Preview Modal */}
      {isDetailModalOpen && selectedNotice && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title="Broadcast Notice Detail & Live Preview"
          subtitle="Inspect attached media files, audit delivery metrics, and review the exact Telegram screen parents see."
          size="xl"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Target Audience: <strong>{selectedNotice.channel}</strong> &bull; {selectedNotice.recipientsCount || 0} Guardians
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDetailModalOpen(false)}
                >
                  Close
                </Button>
                {selectedNotice.channel === 'Telegram Bot' && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Send}
                    onClick={() => {
                      handleResendBroadcast(selectedNotice);
                      setIsDetailModalOpen(false);
                    }}
                  >
                    Re-dispatch Now
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon={Sparkles}
                  onClick={() => handleCloneNotice(selectedNotice)}
                >
                  Customize & Re-dispatch
                </Button>
              </div>
            </div>
          }
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
              alignItems: 'start',
            }}
          >
            {/* Left Column: Notice Metadata, Full Text & Live Media Viewer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Notice Metadata Card */}
              <div
                style={{
                  padding: '14px 16px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <Badge status={selectedNotice.category}>{selectedNotice.category}</Badge>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: selectedNotice.channel?.includes('Telegram') ? '#e0f2fe' : '#f1f5f9',
                      color: selectedNotice.channel?.includes('Telegram') ? '#0369a1' : 'var(--text-secondary)',
                    }}
                  >
                    {selectedNotice.channel}
                  </span>
                </div>
                <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
                  {selectedNotice.title}
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                  <span>Dispatched: <strong>{selectedNotice.sentAt}</strong></span>
                  <span>Recipients: <strong>{selectedNotice.recipientsCount} guardians</strong></span>
                  <span>Status: <strong style={{ color: selectedNotice.status?.includes('Delivered') ? 'var(--status-present)' : '#d97706' }}>{selectedNotice.status}</strong></span>
                </div>
              </div>

              {/* Message Content Box */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
                    Dispatched Message Content:
                  </label>
                  <button
                    type="button"
                    onClick={() => handleCopyNoticeText(selectedNotice.message)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0284c7',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {copiedNotice ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                    {copiedNotice ? 'Copied!' : 'Copy Text'}
                  </button>
                </div>
                <div
                  style={{
                    padding: '12px 14px',
                    backgroundColor: '#ffffff',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12.5px',
                    lineHeight: 1.6,
                    color: 'var(--navy-950)',
                    whiteSpace: 'pre-wrap',
                    minHeight: '80px',
                  }}
                >
                  {selectedNotice.message}
                </div>
              </div>

              {/* Live Media Attachment Viewer */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', display: 'block', marginBottom: '6px' }}>
                  Live Media Attachment Preview {selectedNotice.attachments?.length > 1 ? `(${selectedNotice.attachments.length} Files)` : ''}:
                </label>

                {/* Multiple Attachments List */}
                {selectedNotice.attachments && selectedNotice.attachments.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {selectedNotice.attachments.map((att, aIdx) => (
                      <div
                        key={att.id || aIdx}
                        style={{
                          padding: '12px 14px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              backgroundColor: att.type === 'photo' ? '#e0f2fe' : att.type === 'video' ? '#f3e8ff' : '#fee2e2',
                              color: att.type === 'photo' ? '#0284c7' : att.type === 'video' ? '#9333ea' : '#dc2626',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {att.type === 'photo' ? <ImageIcon size={18} /> : att.type === 'video' ? <Video size={18} /> : <FileText size={18} />}
                          </div>
                          <div style={{ overflow: 'hidden' }}>
                            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--navy-950)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {att.name || `Attachment ${aIdx + 1}`}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {att.type === 'photo' ? 'Image File' : att.type === 'video' ? 'Video File' : 'Document File'} {att.size ? `• ${(att.size / 1024).toFixed(0)} KB` : ''}
                            </div>
                          </div>
                        </div>

                        {att.dataUrl && (
                          <a
                            href={att.dataUrl}
                            download={att.name || `attachment_${aIdx + 1}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '5px 10px',
                              borderRadius: '6px',
                              backgroundColor: '#ffffff',
                              color: '#0284c7',
                              border: '1px solid #bae6fd',
                              textDecoration: 'none',
                              flexShrink: 0,
                            }}
                          >
                            <ExternalLink size={12} />
                            <span>View / Download</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : selectedNotice.mediaType === 'photo' ? (
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#0f172a',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <ImageIcon size={14} color="#38bdf8" />
                      <span>Photo: <strong>{selectedNotice.mediaName || 'Broadcast Image'}</strong></span>
                    </div>
                    {selectedNotice.mediaDataUrl ? (
                      <img
                        src={selectedNotice.mediaDataUrl}
                        alt={selectedNotice.mediaName || 'Broadcast Attachment'}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '260px',
                          borderRadius: '6px',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '12px', padding: '20px' }}>
                        Image preview not stored in memory. Attached as: {selectedNotice.mediaName}
                      </div>
                    )}
                  </div>
                ) : selectedNotice.mediaType === 'video' && (
                  <div
                    style={{
                      padding: '10px',
                      backgroundColor: '#000000',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                      <Video size={14} color="#a855f7" />
                      <span>Video: <strong>{selectedNotice.mediaName || 'Broadcast Video'}</strong></span>
                    </div>
                    {selectedNotice.mediaDataUrl ? (
                      <video
                        src={selectedNotice.mediaDataUrl}
                        controls
                        style={{
                          width: '100%',
                          maxHeight: '260px',
                          borderRadius: '6px',
                        }}
                      />
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '12px', padding: '20px' }}>
                        Video file attached: {selectedNotice.mediaName}
                      </div>
                    )}
                  </div>
                )}

                {selectedNotice.mediaType === 'document' && (
                  <div
                    style={{
                      padding: '14px 16px',
                      backgroundColor: '#f8fafc',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <FileText size={22} />
                        </div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                            {selectedNotice.mediaName || 'Academic Notice.pdf'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            PDF Document Attachment
                          </div>
                        </div>
                      </div>
                      {selectedNotice.mediaDataUrl && (
                        <a
                          href={selectedNotice.mediaDataUrl}
                          download={selectedNotice.mediaName || 'document.pdf'}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            padding: '6px 12px',
                            borderRadius: '6px',
                            backgroundColor: '#ffffff',
                            color: '#0284c7',
                            border: '1px solid #bae6fd',
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={13} />
                          <span>Open / Download</span>
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {!selectedNotice.mediaType && (!selectedNotice.attachments || selectedNotice.attachments.length === 0) && (
                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: '#f1f5f9',
                      borderRadius: '6px',
                      color: 'var(--text-muted)',
                      fontSize: '11.5px',
                      fontStyle: 'italic',
                    }}
                  >
                    Standard text notice broadcast (no photo, PDF, or video attached).
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Realistic Telegram Smartphone Parent Screen Mockup */}
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)', display: 'block', marginBottom: '6px' }}>
                Telegram Smartphone Parent View:
              </label>

              {/* Smartphone Frame */}
              <div
                style={{
                  width: '100%',
                  maxWidth: '340px',
                  margin: '0 auto',
                  border: '3px solid #1e293b',
                  borderRadius: '28px',
                  backgroundColor: '#0f172a',
                  padding: '10px 8px 14px 8px',
                  boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25), 0 8px 10px -6px rgba(0,0,0,0.2)',
                }}
              >
                {/* Phone Speaker Notch */}
                <div
                  style={{
                    width: '64px',
                    height: '4px',
                    backgroundColor: '#334155',
                    borderRadius: '2px',
                    margin: '0 auto 8px auto',
                  }}
                />

                {/* Telegram App Screen */}
                <div
                  style={{
                    borderRadius: '20px',
                    overflow: 'hidden',
                    backgroundColor: '#8da8b8',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '380px',
                  }}
                >
                  {/* Telegram Top Header Bar */}
                  <div
                    style={{
                      backgroundColor: '#517da2',
                      color: '#ffffff',
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#ffffff',
                        color: '#517da2',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      🎓
                    </div>
                    <div style={{ overflow: 'hidden', flex: 1 }}>
                      <div
                        style={{
                          fontSize: '12.5px',
                          fontWeight: 700,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {telegramSettings.botName || academySettings.academy_name || 'SMS Academy'}
                        <CheckCircle2 size={12} fill="#38bdf8" color="#ffffff" />
                      </div>
                      <div style={{ fontSize: '10px', color: '#e0f2fe' }}>
                        bot &bull; @{telegramSettings.botUsername || 'sms_attendance_bot'}
                      </div>
                    </div>
                  </div>

                  {/* Telegram Chat History Feed */}
                  <div
                    style={{
                      flex: 1,
                      padding: '12px 10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      backgroundImage: 'radial-gradient(#9cb5c5 10%, transparent 11%)',
                      backgroundSize: '16px 16px',
                    }}
                  >
                    {/* Centered Date Badge */}
                    <div style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          backgroundColor: 'rgba(0,0,0,0.2)',
                          color: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        Today
                      </span>
                    </div>

                    {/* Telegram Inbound Speech Bubble */}
                    <div
                      style={{
                        backgroundColor: '#ffffff',
                        borderRadius: '12px 12px 12px 2px',
                        padding: '10px 12px',
                        maxWidth: '96%',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {/* Attached Media Thumbnails inside Chat Bubble */}
                      {selectedNotice.attachments && selectedNotice.attachments.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {selectedNotice.attachments.filter((m) => m.type === 'photo').map((photo, pIdx) => (
                            photo.dataUrl ? (
                              <img
                                key={photo.id || pIdx}
                                src={photo.dataUrl}
                                alt="Telegram photo"
                                style={{
                                  width: '100%',
                                  maxHeight: '130px',
                                  objectFit: 'cover',
                                  borderRadius: '6px',
                                }}
                              />
                            ) : null
                          ))}

                          {selectedNotice.attachments.filter((m) => m.type === 'video').map((vid, vIdx) => (
                            <div
                              key={vid.id || vIdx}
                              style={{
                                width: '100%',
                                padding: '12px 8px',
                                backgroundColor: '#0f172a',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '11px',
                                gap: '6px',
                              }}
                            >
                              <Video size={16} color="#a855f7" />
                              <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {vid.name || 'Video Attachment'}
                              </span>
                            </div>
                          ))}

                          {selectedNotice.attachments.filter((m) => m.type === 'document').map((doc, dIdx) => (
                            <div
                              key={doc.id || dIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                backgroundColor: '#f1f5f9',
                                borderRadius: '6px',
                              }}
                            >
                              <FileText size={16} color="#dc2626" />
                              <div style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {doc.name || 'Document.pdf'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <>
                          {selectedNotice.mediaType === 'photo' && selectedNotice.mediaDataUrl && (
                            <img
                              src={selectedNotice.mediaDataUrl}
                              alt="Telegram attachment preview"
                              style={{
                                width: '100%',
                                maxHeight: '140px',
                                objectFit: 'cover',
                                borderRadius: '8px',
                              }}
                            />
                          )}

                          {selectedNotice.mediaType === 'video' && (
                            <div
                              style={{
                                width: '100%',
                                height: '90px',
                                backgroundColor: '#0f172a',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                fontSize: '11px',
                                gap: '6px',
                              }}
                            >
                              <Video size={18} color="#a855f7" />
                              <span>Video ({selectedNotice.mediaName || 'play video'})</span>
                            </div>
                          )}

                          {selectedNotice.mediaType === 'document' && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 8px',
                                backgroundColor: '#f1f5f9',
                                borderRadius: '6px',
                              }}
                            >
                              <FileText size={18} color="#dc2626" />
                              <div style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {selectedNotice.mediaName || 'Academic Notice.pdf'}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Notice Header in bold */}
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a' }}>
                        📢 {selectedNotice.title}
                      </div>

                      {/* Notice Body Text */}
                      <div style={{ fontSize: '11.5px', color: '#1e293b', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        {selectedNotice.message}
                      </div>

                      {/* Timestamp & Telegram Double Blue Checks */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '3px',
                          marginTop: '2px',
                        }}
                      >
                        <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                          {selectedNotice.sentAt || '11:45 AM'}
                        </span>
                        <span style={{ color: '#0284c7', fontSize: '11px', fontWeight: 700 }}>
                          ✓✓
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Informative Help Text */}
              <p
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  marginTop: '10px',
                  lineHeight: 1.4,
                }}
              >
                📱 <strong>Live Parent Experience:</strong> Parents see your logo, message, and media in Telegram exactly as rendered above.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
