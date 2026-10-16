import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Info,
  Clock,
  AlertTriangle,
  Award,
  CreditCard,
  Copy,
} from 'lucide-react';
import Button from '../common/Button';
import {
  getNotificationTemplates,
  saveNotificationTemplates,
  resetNotificationTemplates,
  renderNotificationMessage,
  DEFAULT_NOTIFICATION_TEMPLATES,
  getSchoolTelegramSettings,
  sendDirectTelegramMessage,
} from '../../lib/telegramClient';

/**
 * Enterprise Message Center & Notification Templates Configurator
 * Allows school administrators to preview, customize, and test automated
 * Telegram messages for Present, Absent, Late, Fee Reminders, and Exam Results.
 */
export default function MessageCenter() {
  const [templates, setTemplates] = useState(() => getNotificationTemplates());
  const [activeTab, setActiveTab] = useState('attendance_present');
  const [saveNotice, setSaveNotice] = useState('');
  const [testNotice, setTestNotice] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testChatId, setTestChatId] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);
  const textareaRef = useRef(null);

  const schoolSettings = getSchoolTelegramSettings();
  const botName = schoolSettings.botName || 'School Management System';

  // Sample data for real-time live preview rendering
  const sampleVariables = {
    student_name: 'Adhira Patel',
    roll_no: '20',
    batch_name: '12th Commerce Alpha',
    date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: activeTab === 'attendance_absent' ? 'ABSENT' : activeTab === 'attendance_late' ? 'LATE' : 'PRESENT',
    school_name: botName,
    pending_amount: '15,000',
    total_amount: '45,000',
    due_date: new Date(Date.now() + 15 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    exam_name: 'Mid-Term Board Assessment',
    score: '88',
    max_marks: '100',
    percentage: '88',
    grade: 'A+',
  };

  const tabs = [
    { id: 'attendance_present', label: 'Present Alert', icon: CheckCircle2, color: 'var(--status-present)' },
    { id: 'attendance_absent', label: 'Absent Notice', icon: AlertTriangle, color: 'var(--status-absent)' },
    { id: 'attendance_late', label: 'Late Arrival', icon: Clock, color: 'var(--status-late)' },
    { id: 'fee_reminder', label: 'Fee Reminder', icon: CreditCard, color: 'var(--gold-dark)' },
    { id: 'exam_result', label: 'Exam Evaluation', icon: Award, color: 'var(--navy-800)' },
  ];

  const currentTemplate = templates[activeTab] || DEFAULT_NOTIFICATION_TEMPLATES[activeTab];

  const handleTemplateChange = (val) => {
    setTemplates((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        template: val,
      },
    }));
  };

  const handleInsertVariable = (varName) => {
    const token = `{${varName}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      handleTemplateChange(currentTemplate.template + ' ' + token);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = currentTemplate.template;
    const updated = text.substring(0, start) + token + text.substring(end);
    handleTemplateChange(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const handleSaveAll = () => {
    saveNotificationTemplates(templates);
    setSaveNotice('All notification message formats saved successfully!');
    setTimeout(() => setSaveNotice(''), 4000);
  };

  const handleResetCurrent = () => {
    const def = DEFAULT_NOTIFICATION_TEMPLATES[activeTab];
    if (!def) return;
    setTemplates((prev) => ({
      ...prev,
      [activeTab]: { ...def },
    }));
    setSaveNotice(`Reset "${def.title}" to default template.`);
    setTimeout(() => setSaveNotice(''), 3000);
  };

  const handleResetAll = () => {
    if (confirm('Reset all message formats to default system templates?')) {
      const reset = resetNotificationTemplates();
      setTemplates(reset);
      setSaveNotice('All templates reset to factory defaults.');
      setTimeout(() => setSaveNotice(''), 3000);
    }
  };

  // Convert Telegram markdown (*bold*, _italic_) to HTML for live bubble preview
  const renderedPreviewText = renderNotificationMessage(activeTab, sampleVariables, templates);
  const formattedPreviewHtml = renderedPreviewText
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');

  const handleSendTestMessage = async () => {
    if (!testChatId.trim()) {
      setTestNotice('Please enter a recipient Telegram Chat ID.');
      return;
    }
    const token = schoolSettings.botToken?.trim();
    if (!token) {
      setTestNotice('School Telegram Bot Token is not configured in Settings.');
      return;
    }

    setIsSendingTest(true);
    setTestNotice('');

    try {
      const res = await sendDirectTelegramMessage(token, testChatId.trim(), renderedPreviewText);
      if (res.ok) {
        setTestNotice('Sample test alert delivered successfully to Telegram!');
      } else {
        setTestNotice('Delivery failed: ' + (res.error || 'Unknown error'));
      }
    } catch (err) {
      setTestNotice('Test failed: ' + err.message);
    } finally {
      setIsSendingTest(false);
    }
  };

  return (
    <div className="erp-card" style={{ padding: '24px', marginTop: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'var(--navy-900)',
              color: 'var(--gold-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MessageSquare size={22} />
          </div>
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '17px',
                fontWeight: 700,
                color: 'var(--navy-950)',
                margin: 0,
              }}
            >
              Message Center &amp; Notification Formats
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              Customize and preview exact automated Telegram notification text sent to parents and guardians
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <Button variant="outline" size="sm" icon={RotateCcw} onClick={handleResetAll}>
            Reset Defaults
          </Button>
          <Button variant="gold" size="sm" icon={Save} onClick={handleSaveAll}>
            Save Message Formats
          </Button>
        </div>
      </div>

      {saveNotice && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            color: 'var(--status-present)',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{saveNotice}</span>
        </div>
      )}

      {/* Tabs Row */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '10px',
          marginBottom: '18px',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                fontWeight: isActive ? 700 : 500,
                border: 'none',
                backgroundColor: isActive ? 'var(--navy-900)' : 'transparent',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} color={isActive ? 'var(--gold-light)' : tab.color} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2-Column Layout: Left Editor + Right Live Telegram Preview */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Left: Template Editor & Dynamic Tokens */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--navy-900)' }}>
                {currentTemplate.title}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                (Supports Telegram Markdown: *bold*, _italic_)
              </span>
            </div>

            <button
              type="button"
              onClick={handleResetCurrent}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '11px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Reset to Default
            </button>
          </div>

          {/* Dynamic Placeholder Variable Chips */}
          <div>
            <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Click to insert dynamic variable tag:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(currentTemplate.variables || []).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleInsertVariable(v)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: 'var(--navy-900)',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                  title={`Insert {${v}} at cursor`}
                >
                  +{`{${v}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div style={{ position: 'relative' }}>
            <textarea
              ref={textareaRef}
              rows={9}
              value={currentTemplate.template}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px',
                lineHeight: 1.5,
                backgroundColor: '#ffffff',
                color: 'var(--navy-950)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              placeholder="Enter message template..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Characters: {currentTemplate.template.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              icon={Send}
              onClick={() => setShowTestModal(!showTestModal)}
            >
              {showTestModal ? 'Hide Test Sender' : 'Test Send via Bot'}
            </Button>
          </div>

          {/* Inline Test Sender Drawer */}
          {showTestModal && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Send Live Sample Test Alert
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Enter Telegram Chat ID (e.g. 123456789)"
                  value={testChatId}
                  onChange={(e) => setTestChatId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '12px',
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSendTestMessage}
                  disabled={isSendingTest}
                >
                  {isSendingTest ? 'Sending...' : 'Send Test'}
                </Button>
              </div>
              {testNotice && (
                <div style={{ fontSize: '11.5px', color: testNotice.includes('successfully') ? 'var(--status-present)' : 'var(--status-absent)' }}>
                  {testNotice}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Simulated Real-Time Telegram Chat Preview */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} color="var(--gold-dark)" />
            <span>Live Telegram Guardian Preview</span>
          </div>

          <div
            style={{
              backgroundColor: '#0e1621',
              borderRadius: '14px',
              padding: '16px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
              border: '1px solid #1c2733',
              color: '#ffffff',
            }}
          >
            {/* Mock Telegram Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #1f2c3d', paddingBottom: '10px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: '#2b5278',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {botName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                  {botName}
                </div>
                <div style={{ fontSize: '10.5px', color: '#6c7883' }}>
                  bot • official channel
                </div>
              </div>
            </div>

            {/* Telegram Message Bubble */}
            <div
              style={{
                backgroundColor: '#182533',
                borderRadius: '12px 12px 12px 2px',
                padding: '12px 14px',
                fontSize: '12.5px',
                lineHeight: 1.45,
                color: '#e4ecf2',
                maxWidth: '96%',
                wordBreak: 'break-word',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                dangerouslySetInnerHTML={{ __html: formattedPreviewHtml }}
                style={{ userSelect: 'text' }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  gap: '4px',
                  marginTop: '8px',
                  fontSize: '10px',
                  color: '#6c7883',
                }}
              >
                <span>Just now</span>
                <span style={{ color: '#4fa3dd' }}>✓✓</span>
              </div>
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '10.5px', color: '#5b6975' }}>
              Preview uses sample student "Adhira Patel (Roll: 20)"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
