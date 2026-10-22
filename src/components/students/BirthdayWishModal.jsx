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
          </div>
        </div>
      </div>
    </Modal>
  );
}
