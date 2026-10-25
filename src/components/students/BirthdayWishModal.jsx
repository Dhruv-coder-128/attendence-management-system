import React, { useState, useEffect, useRef } from 'react';
import {
  Cake,
  X,
  Send,
  MessageCircle,
  Copy,
  Check,
  Sparkles,
  Phone,
  User,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import {
  renderNotificationMessage,
  getNotificationTemplates,
  getSchoolTelegramSettings,
  formatStudentBirthdayWhatsAppUrl,
  sendDirectTelegramMessage,
} from '../../lib/telegramClient';
import { openExternalLink } from '../../lib/externalOpener';

/**
 * BirthdayWishModal — Interactive Birthday Greeting & Dispatch Console
 * Allows teachers and management to personalize and send birthday wishes
 * directly via WhatsApp, Telegram Bot, or Clipboard.
 */
export default function BirthdayWishModal({ isOpen, onClose, student, onSent }) {
  const [channel, setChannel] = useState('whatsapp'); // 'whatsapp' | 'telegram'
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSendingTelegram, setIsSendingTelegram] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const textareaRef = useRef(null);

  const schoolSettings = getSchoolTelegramSettings();
  const schoolName = schoolSettings.botName || 'School Management System';

  // Initialize or re-populate message whenever student changes
  useEffect(() => {
    if (student) {
      const todayFormatted = new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      const variables = {
        student_name: student.full_name || 'Student',
        roll_no: student.roll_no || '',
        batch_name: student.batch_name || student.batch_code || '',
        school_name: schoolName,
        date: todayFormatted,
      };
      const rendered = renderNotificationMessage('birthday_greeting', variables);
      setMessage(rendered);
      setCopied(false);
      setTelegramStatus(null);
    }
  }, [student, schoolName]);

  if (!isOpen || !student) return null;

  const targetPhone = student.contact_number || student.phone || student.mobile || '';
  const parentChatId = student.parent_students?.[0]?.parents?.telegram_chat_id || student.telegram_chat_id || null;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
      } else {
        const el = document.createElement('textarea');
        el.value = message;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const handleWhatsAppSend = () => {
    const waUrl = formatStudentBirthdayWhatsAppUrl(targetPhone, message);
    openExternalLink(waUrl);
    if (onSent) onSent('whatsapp');
  };

  const handleTelegramSend = async () => {
    setIsSendingTelegram(true);
    setTelegramStatus(null);
    try {
      const botToken = schoolSettings.botToken;
      if (botToken && parentChatId) {
        const res = await sendDirectTelegramMessage(botToken, parentChatId, message);
        if (res.ok) {
          setTelegramStatus({ ok: true, msg: '✓ Birthday wish dispatched directly to Parent via Telegram Bot!' });
          if (onSent) onSent('telegram');
        } else {
          setTelegramStatus({ ok: false, msg: `Telegram error: ${res.error || 'Failed to dispatch via Bot'}` });
        }
      } else {
        // Fallback: Open Telegram share deep link
        const tgUrl = `https://t.me/share/url?text=${encodeURIComponent(message)}`;
        openExternalLink(tgUrl);
        setTelegramStatus({ ok: true, msg: '✓ Opened Birthday Wish in Telegram!' });
        if (onSent) onSent('telegram');
      }
    } catch (err) {
      setTelegramStatus({ ok: false, msg: 'Dispatch failed: ' + (err.message || String(err)) });
    } finally {
      setIsSendingTelegram(false);
    }
  };

  const handleInsertToken = (token) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMessage((prev) => prev + ' ' + token);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const updated = message.substring(0, start) + token + message.substring(end);
    setMessage(updated);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div style={{ padding: '4px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '16px',
            borderBottom: '1px solid #e2e8f0',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: 'rgba(236, 72, 153, 0.12)',
                border: '1px solid rgba(236, 72, 153, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ec4899',
              }}
            >
              <Cake size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
                Birthday Greeting
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Celebrate and send best wishes to {student.full_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Student Profile Ribbon */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#ec4899',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {student.full_name ? student.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                {student.full_name}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Roll: {student.roll_no || 'N/A'} &bull; Batch: {student.batch_name || student.batch_code || 'General'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
            <Phone size={14} style={{ color: '#ec4899' }} />
            <span>{targetPhone ? `+91 ${targetPhone}` : 'No phone linked'}</span>
          </div>
        </div>

        {/* Gateway Channel Selector: WhatsApp vs Telegram */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>
            Choose Delivery Channel
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setChannel('whatsapp')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: channel === 'whatsapp' ? '2px solid #22c55e' : '1px solid #cbd5e1',
                backgroundColor: channel === 'whatsapp' ? '#f0fdf4' : '#ffffff',
                color: channel === 'whatsapp' ? '#15803d' : '#475569',
                fontWeight: channel === 'whatsapp' ? 700 : 600,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              <MessageCircle size={16} color={channel === 'whatsapp' ? '#22c55e' : '#64748b'} />
              <span>WhatsApp Direct</span>
            </button>

            <button
              type="button"
              onClick={() => setChannel('telegram')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '9px 14px',
                borderRadius: '8px',
                border: channel === 'telegram' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                backgroundColor: channel === 'telegram' ? '#f0f9ff' : '#ffffff',
                color: channel === 'telegram' ? '#0369a1' : '#475569',
                fontWeight: channel === 'telegram' ? 700 : 600,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              <Send size={16} color={channel === 'telegram' ? '#0284c7' : '#64748b'} />
              <span>Telegram Bot / App</span>
            </button>
          </div>
        </div>

        {/* Message Editor */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
              Personalized Greeting Message
            </label>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Supports WhatsApp bold (*text*) &amp; italics (_text_)
            </span>
          </div>

          <textarea
            ref={textareaRef}
            rows={7}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              lineHeight: 1.5,
              fontFamily: 'inherit',
              color: '#0f172a',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />

          {/* Quick variable chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Insert Tag:</span>
            {['{student_name}', '{roll_no}', '{batch_name}', '{school_name}'].map((token) => (
              <button
                key={token}
                type="button"
                onClick={() => handleInsertToken(token)}
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  fontSize: '11.5px',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                {token}
              </button>
            ))}
          </div>
        </div>

        {/* Telegram Status feedback if sent */}
        {telegramStatus && (
          <div
            style={{
              marginBottom: '14px',
              padding: '8px 12px',
              borderRadius: '6px',
              backgroundColor: telegramStatus.ok ? '#ecfdf5' : '#fef2f2',
              border: `1px solid ${telegramStatus.ok ? '#a7f3d0' : '#fecaca'}`,
              color: telegramStatus.ok ? '#065f46' : '#991b1b',
              fontSize: '12px',
              fontWeight: 500,
            }}
          >
            {telegramStatus.msg}
          </div>
        )}

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            paddingTop: '14px',
            borderTop: '1px solid #e2e8f0',
          }}
        >
          <button
            type="button"
            onClick={handleCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '6px',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#334155',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
            {copied ? 'Copied to Clipboard!' : 'Copy Greeting'}
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
            <Button
              variant="outline"
              size="md"
              onClick={onClose}
            >
              Cancel
            </Button>

            {channel === 'whatsapp' ? (
              <button
                type="button"
                onClick={handleWhatsAppSend}
                disabled={!targetPhone}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  backgroundColor: targetPhone ? '#25d366' : '#cbd5e1',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: targetPhone ? 'pointer' : 'not-allowed',
                  boxShadow: targetPhone ? '0 2px 8px rgba(37, 211, 102, 0.3)' : 'none',
                }}
              >
                <MessageCircle size={16} />
                1-Click WhatsApp Wish
              </button>
            ) : (
              <button
                type="button"
                onClick={handleTelegramSend}
                disabled={isSendingTelegram}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  borderRadius: '6px',
                  backgroundColor: '#0284c7',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isSendingTelegram ? 'wait' : 'pointer',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
                }}
              >
                <Send size={16} />
                {isSendingTelegram ? 'Dispatching...' : '1-Click Telegram Wish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
