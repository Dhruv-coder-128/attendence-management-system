import React, { useState } from 'react';
import { Send, Bell, CheckCircle, MessageSquare, Plus, Sparkles, AlertCircle } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';

/**
 * Notifications and Telegram Alert Broadcast Manager
 */
export default function NotificationsPage({ notifications, onBroadcast }) {
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [template, setTemplate] = useState('attendance');
  const [title, setTitle] = useState('Daily Morning Absentee Roll Call Notice');
  const [message, setMessage] = useState(
    'Dear Parent, Your ward was marked absent for the 06:30 AM morning session on 09-Oct-2026. Please contact academy reception to confirm whereabouts.'
  );
  const [channel, setChannel] = useState('Telegram Bot');
  const [audience, setAudience] = useState('Absentee Guardians (Today)');

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
      setAudience('All Academy Students (472 Total)');
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    const newLog = {
      id: `notif-${Date.now()}`,
      title,
      message,
      category: template === 'attendance' ? 'Attendance' : template === 'fee' ? 'Fee Alert' : 'Academic',
      channel,
      recipientsCount: audience.includes('472') ? 472 : audience.includes('Absentee') ? 36 : 68,
      sentAt: 'Just now',
      status: 'Delivered',
      sender: 'Director Desk',
    };

    onBroadcast(newLog);
    setIsComposerOpen(false);
  };

  const columns = [
    {
      header: 'Broadcast Notice Title',
      key: 'title',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{item.title}</div>
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
      render: (item) => <Badge status="Present">{item.status}</Badge>,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Telegram &amp; SMS Broadcast Outbox</h1>
          <p className="page-description">
            Automated Roll Call SMS, Telegram Parent Alerts &bull; Communication Logs
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="gold"
            size="md"
            icon={Plus}
            onClick={() => setIsComposerOpen(true)}
          >
            Compose Broadcast
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={notifications}
        searchPlaceholder="Search past dispatches and alerts..."
      />

      {/* Composer Modal */}
      <Modal
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        title="Compose Telegram &amp; Parent Alert"
        subtitle="Format message and dispatch to Telegram Bot API or SMS gateway"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsComposerOpen(false)}>
              Discard
            </Button>
            <Button variant="gold" size="sm" icon={Send} onClick={handleSend}>
              Dispatch Broadcast
            </Button>
          </>
        }
      >
        <form onSubmit={handleSend}>
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
                'Absentee Guardians (Today)',
                'Grade 12 JEE Students & Guardians',
                'Pending Fee Accounts',
                'All Academy Students (472 Total)',
              ]}
            />
          </div>

          <Input
            label="Notice Subject / Headline"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="form-group">
            <label className="form-label">Message Content</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports dynamic merge tags: {'{StudentName}'}, {'{BatchName}'}, {'{Date}'}
            </span>
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
          </div>
        </form>
      </Modal>
    </div>
  );
}
