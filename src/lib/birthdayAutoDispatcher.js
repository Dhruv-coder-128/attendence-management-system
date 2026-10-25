/**
 * SMS — Student Management System
 * Automated Birthday Wishes Dispatcher Service
 * 
 * Automatically sends personalized celebratory birthday greetings
 * to students celebrating their birthday today via Telegram Bot, WhatsApp, or both.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import {
  isStudentBirthdayToday,
  renderNotificationMessage,
  sendDirectTelegramMessage,
  formatStudentBirthdayWhatsAppUrl,
  getSchoolTelegramSettings,
} from './telegramClient.js';
import { getStoredAcademySettings } from './academySettings.js';

export async function checkAndDispatchBirthdayWishes({ force = false } = {}) {
  const settings = getStoredAcademySettings();
  const isEnabled = settings.auto_birthday_wish_enabled;
  const channel = settings.auto_birthday_wish_channel || 'both'; // 'telegram' | 'whatsapp' | 'both'

  if (!isEnabled && !force) {
    return {
      status: 'disabled',
      count: 0,
      message: 'Automated birthday greetings are currently disabled in Settings.',
    };
  }

  const todayIso = new Date().toISOString().split('T')[0];
  const dispatchKey = `sms_birthday_autodispatched_${todayIso}`;

  if (!force && typeof window !== 'undefined' && localStorage.getItem(dispatchKey)) {
    try {
      const existing = JSON.parse(localStorage.getItem(dispatchKey));
      return {
        status: 'already_run',
        count: existing.count || 0,
        telegramDispatchedCount: existing.telegramCount || 0,
        whatsappPreparedCount: existing.whatsappCount || 0,
        message: `Today's automated birthday greetings were already processed on ${new Date(existing.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      };
    } catch {
      // Continue if malformed
    }
  }

  // 1. Fetch active students with parent contact information
  let students = [];
  try {
    const { data, error } = await supabase
      .from('students')
      .select(`
        id,
        admission_no,
        roll_no,
        full_name,
        dob,
        phone,
        contact_number,
        mobile,
        batch_id,
        status,
        batches:batch_id ( name, code ),
        parent_students:parent_students (
          parents:parent_id (
            id,
            full_name,
            phone,
            telegram_chat_id,
            is_verified
          )
        )
      `)
      .neq('status', 'inactive')
      .neq('status', 'suspended');

    if (!error && Array.isArray(data)) {
      students = data;
    }
  } catch (err) {
    console.warn('Error querying students for birthday dispatch:', err);
  }

  // Filter students whose birthday is today
  const birthdayStudents = students.filter((s) => isStudentBirthdayToday(s.dob));
  if (birthdayStudents.length === 0) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        dispatchKey,
        JSON.stringify({ count: 0, date: todayIso, timestamp: new Date().toISOString() })
      );
    }
    return {
      status: 'no_birthdays',
      count: 0,
      message: 'No registered students have birthdays scheduled for today.',
    };
  }

  const botConfig = getSchoolTelegramSettings();
  const schoolName = settings.academy_name || botConfig.botName || 'School Management System';
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  let telegramDispatchedCount = 0;
  let whatsappPreparedCount = 0;
  const logs = [];

  for (const st of birthdayStudents) {
    const batchName = st.batches?.name || st.batches?.code || st.batch_id || '';
    const studentName = st.full_name || 'Student';
    const primaryPhone = st.contact_number || st.phone || st.mobile || '';
    const parent = st.parent_students?.[0]?.parents || null;
    const parentChatId = parent?.telegram_chat_id || null;

    const variables = {
      student_name: studentName,
      roll_no: st.roll_no || '',
      batch_name: batchName,
      school_name: schoolName,
      date: todayFormatted,
    };

    const renderedMessage = renderNotificationMessage('birthday_greeting', variables);

    // 1. Direct Telegram Bot Dispatch
    let telegramSent = false;
    if (channel === 'telegram' || channel === 'both') {
      if (botConfig.botToken && parentChatId) {
        try {
          const res = await sendDirectTelegramMessage(botConfig.botToken, parentChatId, renderedMessage);
          if (res.ok) {
            telegramSent = true;
            telegramDispatchedCount++;
          }
        } catch (e) {
          console.warn(`Failed to send Telegram birthday greeting to ${studentName}:`, e);
        }
      }
    }

    // 2. WhatsApp URL Preparation
    let waUrl = '';
    if (channel === 'whatsapp' || channel === 'both') {
      waUrl = formatStudentBirthdayWhatsAppUrl(primaryPhone || parent?.phone, renderedMessage);
      whatsappPreparedCount++;
    }

    logs.push({
      student_id: st.id,
      student_name: studentName,
      admission_no: st.admission_no,
      batch_name: batchName,
      telegramSent,
      waUrl,
      timestamp: new Date().toISOString(),
    });
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(
      dispatchKey,
      JSON.stringify({
        count: birthdayStudents.length,
        telegramCount: telegramDispatchedCount,
        whatsappCount: whatsappPreparedCount,
        date: todayIso,
        timestamp: new Date().toISOString(),
      })
    );

    window.dispatchEvent(
      new CustomEvent('sms-birthday-autodispatched', {
        detail: {
          total: birthdayStudents.length,
          telegramDispatchedCount,
          whatsappPreparedCount,
          channel,
        },
      })
    );
  }

  return {
    status: 'success',
    count: birthdayStudents.length,
    telegramDispatchedCount,
    whatsappPreparedCount,
    channel,
    students: birthdayStudents,
    logs,
    message: `✓ Successfully processed birthday wishes for ${birthdayStudents.length} student(s) (Telegram Bot: ${telegramDispatchedCount}, WhatsApp: ${whatsappPreparedCount}).`,
  };
}
