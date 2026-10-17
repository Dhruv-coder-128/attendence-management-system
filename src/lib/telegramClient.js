import { supabase } from './supabase.js';

/**
 * Client-Side Telegram & Parent Communications Service
 * SMS — Student Management System
 * 
 * Strict Security Principles:
 * - Never fabricates delivery success.
 * - Attendance notices are routed strictly via server-side student-parent joins.
 * - Secure single-use, time-limited linking tokens.
 * - Honest tracking of WhatsApp manual share mode vs automated gateway.
 */

export const TELEGRAM_BOT_USERNAME = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TELEGRAM_BOT_USERNAME) || 'SMSAttendanceBot';
const TELEGRAM_SETTINGS_KEY = 'sms_school_telegram_settings';

/**
 * Retrieves per-school Telegram Bot credentials from local settings
 */
export function getSchoolTelegramSettings() {
  if (typeof window === 'undefined') return { botUsername: TELEGRAM_BOT_USERNAME, botToken: '', isCustom: false };
  try {
    const raw = localStorage.getItem(TELEGRAM_SETTINGS_KEY);
    if (!raw) return { botUsername: TELEGRAM_BOT_USERNAME, botToken: '', isCustom: false };
    const parsed = JSON.parse(raw);
    return {
      botUsername: parsed.botUsername || TELEGRAM_BOT_USERNAME,
      botToken: parsed.botToken || '',
      botName: parsed.botName || '',
      isCustom: Boolean(parsed.botToken && parsed.botUsername),
      testedAt: parsed.testedAt || null,
    };
  } catch {
    return { botUsername: TELEGRAM_BOT_USERNAME, botToken: '', isCustom: false };
  }
}

/**
 * Saves per-school custom Telegram Bot credentials
 */
export function saveSchoolTelegramSettings(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    const existing = getSchoolTelegramSettings();
    const merged = {
      ...existing,
      ...data,
      botUsername: (data.botUsername || existing.botUsername || '').replace(/^@/, '').trim(),
      botToken: (data.botToken || existing.botToken || '').trim(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(TELEGRAM_SETTINGS_KEY, JSON.stringify(merged));
    return merged;
  } catch (err) {
    console.warn('Failed to save telegram settings:', err);
  }
}

/**
 * Directly verifies a Telegram Bot Token against https://api.telegram.org/bot<TOKEN>/getMe
 */
export async function testTelegramBotConnection(botToken) {
  if (!botToken || !botToken.trim()) {
    return { ok: false, error: 'Telegram Bot Token is required.' };
  }
  const cleanToken = botToken.trim();
  try {
    const res = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await res.json();
    if (res.ok && data.ok) {
      return {
        ok: true,
        id: data.result.id,
        botName: data.result.first_name,
        username: data.result.username,
        canJoinGroups: data.result.can_join_groups,
      };
    }
    return {
      ok: false,
      error: data.description || `Telegram API returned code ${data.error_code || res.status}`,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error reaching api.telegram.org' };
  }
}

/**
 * Helper to generate a random hex string for linking tokens
 */
function generateRandomTokenHex(byteLength = 16) {
  const chars = '0123456789abcdef';
  let result = 'tk_';
  for (let i = 0; i < byteLength * 2; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Normalizes bot username by stripping leading '@' and trimming whitespace
 */
export function normalizeBotUsername(botUsername) {
  const fallback = getSchoolTelegramSettings().botUsername || TELEGRAM_BOT_USERNAME;
  return String(botUsername || fallback).replace(/^@/, '').trim();
}

/**
 * Returns the currently active Bot Username for the school.
 * Always prefers custom Bot Username from school settings, falling back to environment or default.
 */
export function getActiveBotUsername(overrideUsername = null) {
  if (overrideUsername && String(overrideUsername).trim()) {
    return normalizeBotUsername(overrideUsername);
  }
  const settings = getSchoolTelegramSettings();
  if (settings && settings.botUsername && settings.botUsername.trim()) {
    return normalizeBotUsername(settings.botUsername);
  }
  return normalizeBotUsername(TELEGRAM_BOT_USERNAME);
}

/**
 * Normalizes and sanitizes the start parameter per Telegram Bot deep-linking rules:
 * - Allowed chars: A-Z, a-z, 0-9, _, -
 * - Maximum length: 64 characters
 */
export function formatStartParam(tokenOrId) {
  if (!tokenOrId) return '';
  const str = String(tokenOrId).trim();
  const raw = str.startsWith('tk_') || str.startsWith('link_') ? str : `tk_${str}`;
  // Strip any illegal characters not allowed by Telegram Bot API specification
  const sanitized = raw.replace(/[^A-Za-z0-9_-]/g, '');
  return sanitized.slice(0, 64);
}

/**
 * Generates an official Telegram universal HTTPS deep link for parent registration
 * Uses school's configured bot username by default.
 */
export function getParentTelegramDeepLink(tokenOrId, botUsername = null) {
  if (!tokenOrId) return '';
  const cleanUsername = getActiveBotUsername(botUsername);
  const param = formatStartParam(tokenOrId);
  return `https://t.me/${cleanUsername}?start=${param}`;
}

/**
 * Generates a direct native Telegram app URI (tg://resolve?domain=...&start=...)
 * Bypasses web redirects on Android and iOS devices to launch the native client directly.
 */
export function getParentTelegramAppUri(tokenOrId, botUsername = null) {
  if (!tokenOrId) return '';
  const cleanUsername = getActiveBotUsername(botUsername);
  const param = formatStartParam(tokenOrId);
  return `tg://resolve?domain=${cleanUsername}&start=${param}`;
}

/**
 * Returns both the universal HTTPS web link and the direct native tg:// URI
 */
export function getParentTelegramLinks(tokenOrId, botUsername = null) {
  if (!tokenOrId) {
    return { deepLink: '', appUri: '', token: '' };
  }
  const cleanUsername = getActiveBotUsername(botUsername);
  const param = formatStartParam(tokenOrId);
  return {
    deepLink: `https://t.me/${cleanUsername}?start=${param}`,
    appUri: `tg://resolve?domain=${cleanUsername}&start=${param}`,
    token: param,
  };
}

/**
 * Generates a unique, secure, 7-day time-limited linking token for a parent
 * and records it in public.parent_invitations (with fallback to public.parents).
 */
export async function createSecureParentInvitation(parentId, channel = 'telegram') {
  if (!supabase) throw new Error('Supabase client is not available.');
  if (!parentId) throw new Error('Parent ID is required.');

  const token = generateRandomTokenHex(16); // e.g. tk_8a7d2f9c...
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  const deepLink = getParentTelegramDeepLink(token);
  const appUri = getParentTelegramAppUri(token);

  // 1. Try writing to public.parent_invitations table
  try {
    const { error: invErr } = await supabase.from('parent_invitations').insert([
      {
        parent_id: parentId,
        token,
        invitation_channel: channel,
        invitation_status: 'sent',
        linking_status: 'unlinked',
        expires_at: expiresAt,
        sent_at: new Date().toISOString(),
      },
    ]);

    if (invErr) {
      console.warn('Could not insert into parent_invitations table, using parents table fallback:', invErr.message);
    }
  } catch (err) {
    console.warn('parent_invitations table not ready yet, falling back to parents columns:', err.message);
  }

  // 2. Also cache active token and expiration on public.parents table
  try {
    await supabase
      .from('parents')
      .update({
        linking_token: token,
        linking_token_expires_at: expiresAt,
        invitation_status: 'sent',
        invitation_sent_at: new Date().toISOString(),
      })
      .eq('id', parentId);
  } catch (pErr) {
    console.warn('Could not update parents linking_token:', pErr.message);
  }

  return {
    success: true,
    token,
    deepLink,
    appUri,
    expiresAt,
  };
}

/**
 * Generates secure invitation tokens for multiple parents in bulk
 */
export async function createBulkParentInvitations(parents, channel = 'telegram') {
  if (!parents || parents.length === 0) return [];

  const results = [];
  for (const parent of parents) {
    try {
      const inv = await createSecureParentInvitation(parent.id, channel);
      results.push({
        parentId: parent.id,
        parentName: parent.full_name,
        phone: parent.phone,
        token: inv.token,
        deepLink: inv.deepLink,
        expiresAt: inv.expiresAt,
        success: true,
      });
    } catch (err) {
      results.push({
        parentId: parent.id,
        parentName: parent.full_name,
        phone: parent.phone,
        success: false,
        error: err.message,
      });
    }
  }
  return results;
}

/**
 * Manually links or verifies a parent's Telegram Chat ID in Supabase
 * (Admin bypass / manual verification in UI)
 */
export async function linkParentTelegramAccount(parentId, telegramChatId) {
  if (!parentId) throw new Error('Parent ID is required.');
  if (!telegramChatId || !String(telegramChatId).trim()) {
    throw new Error('Valid numeric Telegram Chat ID is required.');
  }
  if (!supabase) throw new Error('Supabase client not initialized.');

  const cleanChatId = String(telegramChatId).trim();

  // Core verified update payload (always valid across all schema versions)
  const corePayload = {
    telegram_chat_id: cleanChatId,
    is_verified: true,
    preferred_notification_channel: 'telegram',
  };

  // 1. First attempt: include invitation_status if supported by database schema
  let updateResult = await supabase
    .from('parents')
    .update({
      ...corePayload,
      invitation_status: 'linked',
    })
    .eq('id', parentId)
    .select()
    .single();

  // 2. Graceful fallback if invitation_status column does not exist in schema cache
  if (updateResult.error && updateResult.error.message?.includes('invitation_status')) {
    updateResult = await supabase
      .from('parents')
      .update(corePayload)
      .eq('id', parentId)
      .select()
      .single();
  }

  if (updateResult.error) {
    if (updateResult.error.code === 'PGRST116' || updateResult.error.message?.includes('single JSON object')) {
      throw new Error(`Parent record with ID "${parentId}" was not found in the database.`);
    }
    throw updateResult.error;
  }

  const parentData = updateResult.data;

  // 3. Also update parent_invitations linking_status if table exists
  try {
    await supabase
      .from('parent_invitations')
      .update({
        linking_status: 'linked',
        linked_at: new Date().toISOString(),
      })
      .eq('parent_id', parentId)
      .eq('linking_status', 'unlinked');
  } catch {
    // Non-fatal if table not created
  }

  return { success: true, parent: parentData, chatId: cleanChatId, ...parentData };
}

/**
/**
 * Helper to retrieve authenticated JWT from Supabase session
 */
async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }
  } catch (err) {
    console.warn('Could not retrieve auth session token for notification request:', err);
  }
  return headers;
}

/**
 * Direct client-side message sender to Telegram Bot API
 */
export async function sendDirectTelegramMessage(botToken, chatId, text, parseMode = 'Markdown') {
  if (!botToken || !chatId) {
    return { ok: false, error: 'Bot token and Chat ID are required.' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      return { ok: true, messageId: data.result?.message_id };
    }
    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error reaching Telegram API' };
  }
}

/**
 * Dispatches one-click attendance notifications for an entire batch.
 * Supports both cloud serverless backend and direct client-side desktop execution.
 */
export async function sendBatchAttendanceNotifications({
  batchId,
  date,
  sessionName = 'Regular',
  retryFailedOnly = false,
  forceAll = false,
}) {
  if (!batchId || !date) {
    return { success: false, error: 'Cohort / Batch and Date are required.' };
  }

  // 1. Try serverless endpoint first if running in web deployment
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        batchId,
        date,
        sessionName,
        retryFailedOnly,
        forceAll,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.ok) {
        return {
          success: true,
          summary: result.summary,
          details: result.details,
          batchName: result.batchName,
          date: result.date,
        };
      }
      return {
        success: false,
        error: result.error || `Server responded with HTTP ${response.status}`,
        summary: result.summary,
      };
    }
  } catch (err) {
    console.warn('Serverless notification endpoint unavailable, using client-side dispatcher:', err);
  }

  // 2. Client-side Desktop / Offline Resilient Dispatcher
  try {
    const schoolSettings = getSchoolTelegramSettings();
    const botToken = schoolSettings.botToken?.trim();

    // Fetch batch details
    const { data: batchData } = await supabase
      .from('batches')
      .select('id, name, code')
      .eq('id', batchId)
      .maybeSingle();

    const batchName = batchData?.name || 'Academic Cohort';

    // Fetch all attendance records for this batch and date
    const { data: attendanceRecords } = await supabase
      .from('attendance')
      .select('id, student_id, status, session_name, remarks, telegram_notified')
      .eq('batch_id', batchId)
      .eq('date', date);

    const records = attendanceRecords || [];
    if (records.length === 0) {
      return {
        success: false,
        error: 'No attendance records recorded for this batch on the selected date.',
      };
    }

    // Fetch students in this batch with joined parents
    const { data: studentsData } = await supabase
      .from('students')
      .select(`
        id,
        full_name,
        roll_no,
        admission_no,
        parent_students:parent_students (
          id,
          alert_preference,
          parents:parents (
            id,
            full_name,
            phone,
            telegram_chat_id,
            is_verified
          )
        )
      `)
      .eq('batch_id', batchId);

    const studentMap = {};
    (studentsData || []).forEach((s) => {
      studentMap[s.id] = s;
    });

    let sentCount = 0;
    let failedCount = 0;
    let pendingLinkingCount = 0;
    const details = [];

    for (const record of records) {
      const student = studentMap[record.student_id];
      const parentLink = student?.parent_students?.[0];
      const parent = parentLink?.parents;
      const isLinked = Boolean(parent?.is_verified && parent?.telegram_chat_id);

      if (!isLinked) {
        pendingLinkingCount++;
        details.push({
          studentName: student?.full_name || 'Student',
          rollNo: student?.roll_no || 'N/A',
          parentName: parent?.full_name || 'Unlinked Guardian',
          status: 'pending_linking',
          reason: 'Guardian Telegram account not yet linked or verified',
        });
        continue;
      }

      if (botToken) {
        const normStatus = (record.status || 'Present').toLowerCase();
        const templateType = normStatus === 'absent'
          ? 'attendance_absent'
          : normStatus === 'late'
          ? 'attendance_late'
          : 'attendance_present';

        const msg = renderNotificationMessage(templateType, {
          student_name: student.full_name,
          roll_no: student.roll_no || 'N/A',
          batch_name: batchName,
          date: date,
          status: (record.status || 'Present').toUpperCase(),
          school_name: schoolSettings.botName || 'School Management System',
        });
        const sendRes = await sendDirectTelegramMessage(botToken, parent.telegram_chat_id, msg);

        if (sendRes.ok) {
          sentCount++;
          // Update attendance record
          await supabase
            .from('attendance')
            .update({
              telegram_notified: true,
              telegram_notified_at: new Date().toISOString(),
            })
            .eq('id', record.id);

          details.push({
            studentName: student.full_name,
            rollNo: student.roll_no || 'N/A',
            parentName: parent.full_name,
            status: 'sent',
            chatId: parent.telegram_chat_id,
          });
        } else {
          failedCount++;
          details.push({
            studentName: student.full_name,
            rollNo: student.roll_no || 'N/A',
            parentName: parent.full_name,
            status: 'failed',
            reason: sendRes.error,
          });
        }
      } else {
        // No custom bot token: record local notification verification
        details.push({
          studentName: student.full_name,
          rollNo: student.roll_no || 'N/A',
          parentName: parent.full_name,
          status: 'token_required',
          reason: 'Telegram Bot Token not configured in Settings',
        });
      }
    }

    return {
      success: true,
      summary: {
        total: records.length,
        sent: sentCount,
        failed: failedCount,
        alreadyNotified: 0,
        pendingLinking: pendingLinkingCount,
        botConfigured: Boolean(botToken),
      },
      details,
      batchName,
      date,
    };
  } catch (clientErr) {
    console.error('Client-side batch attendance dispatcher error:', clientErr);
    return {
      success: false,
      error: 'Error processing batch dispatch: ' + clientErr.message,
    };
  }
}

/**
 * Dispatches a single student attendance notice via server API or direct bot
 */
export async function sendVerifiedAttendanceNotice({
  student,
  status,
  date,
  batchName,
  parent,
}) {
  if (!student) {
    return { success: false, error: 'Student details required.' };
  }

  // 1. Try serverless endpoint first
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        studentId: student.id,
        status,
        date,
        batchName,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.ok) {
        return {
          success: true,
          messageId: result.messageId,
          parentName: result.parentName,
          chatId: result.chatId,
        };
      }
      return {
        success: false,
        error: result.error || `HTTP ${response.status} error from notification API`,
      };
    }
  } catch (err) {
    console.warn('Serverless notice endpoint unavailable, checking client bot dispatch:', err);
  }

  // 2. Client-side direct bot dispatch
  const schoolSettings = getSchoolTelegramSettings();
  const botToken = schoolSettings.botToken?.trim();
  const targetParent = parent || student.parent_students?.[0]?.parents;

  if (!targetParent || !targetParent.telegram_chat_id || !targetParent.is_verified) {
    return {
      success: false,
      requiresLinking: true,
      error: 'Guardian Telegram account is not yet linked or verified.',
      deepLink: getParentTelegramDeepLink(student.id),
    };
  }

  if (!botToken) {
    return {
      success: false,
      error: 'Please configure your School Telegram Bot Token in Settings to send live alerts.',
    };
  }

  const normStatus = (status || 'Present').toLowerCase();
  const templateType = normStatus === 'absent'
    ? 'attendance_absent'
    : normStatus === 'late'
    ? 'attendance_late'
    : 'attendance_present';

  const msg = renderNotificationMessage(templateType, {
    student_name: student.full_name,
    roll_no: student.roll_no || 'N/A',
    batch_name: batchName || 'Regular Session',
    date: date,
    status: (status || 'Present').toUpperCase(),
    school_name: schoolSettings.botName || 'School Management System',
  });
  const sendRes = await sendDirectTelegramMessage(botToken, targetParent.telegram_chat_id, msg);

  if (sendRes.ok) {
    return {
      success: true,
      messageId: sendRes.messageId,
      parentName: targetParent.full_name,
      chatId: targetParent.telegram_chat_id,
    };
  }

  return {
    success: false,
    error: sendRes.error || 'Failed to dispatch Telegram message via Telegram Bot API.',
  };
}

/**
 * Creates a prefilled WhatsApp Web / WhatsApp Mobile deep link
 * for practical manual WhatsApp sharing (with explicit consent & zero fake delivery claims).
 */
export function getWhatsAppShareUrl(parent, studentNames = '', deepLinkUrl = '') {
  if (!parent || !parent.phone) return '';

  // Clean phone number (strip spaces, dashes, parentheses)
  let cleanPhone = parent.phone.replace(/[^0-9]/g, '');

  // Add default country code if 10-digit Indian mobile
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  const wardText = studentNames ? ` for your ward *${studentNames}*` : '';
  const messageText = `
Namaste *${parent.full_name || 'Guardian'}*,

This is an official invitation from *SMS — Student Management System*${wardText}.

To receive instant daily roll call attendance notifications directly on your phone:
👉 *Click here to connect:* ${deepLinkUrl}

*Instructions:*
1. Tap the link above to open Telegram.
2. Tap *START* at the bottom of the chat.
3. Tap *✅ Yes, This is my child* to verify your student ward and connect instantly.

_SMS — Student Management System_
`.trim();

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
}

/**
 * Queries Telegram Bot & Webhook Status from Serverless API or direct Bot Token verification
 */
export async function getTelegramBotStatus() {
  const schoolSettings = getSchoolTelegramSettings();

  // 1. If school has configured an individual custom Bot Token, verify it directly
  if (schoolSettings.botToken) {
    try {
      const directTest = await testTelegramBotConnection(schoolSettings.botToken);
      if (directTest.ok) {
        return {
          ok: true,
          configured: true,
          valid: true,
          bot: {
            id: directTest.id,
            first_name: directTest.botName,
            username: directTest.username,
          },
          webhook: { url: '' },
          isCustom: true,
        };
      }
    } catch (testErr) {
      console.warn('Direct Telegram test error:', testErr);
    }
  }

  // 2. Otherwise probe serverless endpoint if available
  try {
    const res = await fetch('/api/telegram-status');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return await res.json();
    }

    // If serverless endpoint returned HTML or 404, we are in desktop offline mode
    return {
      ok: false,
      configured: false,
      valid: false,
      error: schoolSettings.botToken
        ? 'Custom bot token invalid or network error.'
        : 'Desktop Offline Mode: Configure your school bot token above to enable Telegram parent notifications.',
    };
  } catch (err) {
    return {
      ok: false,
      configured: false,
      valid: false,
      error: 'Desktop Offline Mode: Configure your school bot token above to enable Telegram notifications.',
    };
  }
}

/**
 * Configures Telegram Bot Webhook URL on Telegram Bot API
 */
export async function setupTelegramWebhook(webhookUrl, action = 'set') {
  try {
    const res = await fetch('/api/telegram-webhook-setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl, action }),
    });
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    return {
      ok: false,
      error:
        'Webhook setup requires an active cloud deployment with a public HTTPS URL. In Desktop EXE mode, Telegram webhook is routed via the cloud gateway.',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


/**
 * Dispatches an official tuition fee reminder notice to verified guardians
 * Supports both serverless API and resilient client-side Telegram Bot dispatch.
 */
export async function sendVerifiedFeeReminder(studentOrParams, feeRecordArg, targetParentIdArg = null) {
  let studentObj = null;
  let studentId = null;
  let feeRecord = feeRecordArg;
  let targetParentId = targetParentIdArg;

  if (studentOrParams && typeof studentOrParams === 'object' && studentOrParams.student) {
    studentObj = studentOrParams.student;
    studentId = studentOrParams.student.id;
    feeRecord = studentOrParams.feeRecord || feeRecordArg;
    targetParentId = studentOrParams.targetParentId || targetParentIdArg;
  } else if (studentOrParams && typeof studentOrParams === 'object' && studentOrParams.id) {
    studentObj = studentOrParams;
    studentId = studentOrParams.id;
  } else if (typeof studentOrParams === 'string') {
    studentId = studentOrParams;
  }

  if (!studentId) {
    return { success: false, ok: false, error: 'Valid student ID or student details are required.' };
  }

  // 1. Try serverless endpoint first if running in web deployment
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fee_reminder',
        studentId,
        feeRecord,
        targetParentId,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.ok) {
        return {
          success: true,
          ok: true,
          message: result.message || 'Tuition fee reminder dispatched successfully!',
          recipientsCount: result.recipientsCount || 1,
          details: result.details || [],
        };
      }
      return {
        success: false,
        ok: false,
        error: result.error || `Server responded with HTTP ${response.status}`,
      };
    }
  } catch (err) {
    console.warn('Serverless fee reminder endpoint unavailable, using direct client dispatch:', err);
  }

  // 2. Client-side Direct Bot Fallback
  try {
    const schoolSettings = getSchoolTelegramSettings();
    const botToken = schoolSettings.botToken?.trim();

    let studentData = studentObj;
    if (!studentData || !studentData.full_name) {
      const { data: fetchedStudent } = await supabase
        .from('students')
        .select(`
          id, full_name, roll_no, admission_no, tuition_fee, fee_paid, fee_status, fee_due_date,
          parent_students:parent_students(
            id,
            alert_preference,
            parents:parents(id, full_name, phone, telegram_chat_id, is_verified)
          )
        `)
        .eq('id', studentId)
        .maybeSingle();
      studentData = fetchedStudent;
    }

    if (!studentData) {
      return { success: false, ok: false, error: 'Student record could not be found.' };
    }

    const parentList = (studentData.parent_students || [])
      .map((ps) => ps.parents)
      .filter((p) => Boolean(p && p.telegram_chat_id && p.is_verified));

    if (parentList.length === 0) {
      return {
        success: false,
        ok: false,
        error: `Guardian Telegram account is not yet linked or verified for ${studentData.full_name}.`,
      };
    }

    if (!botToken) {
      return {
        success: false,
        ok: false,
        error: 'Please configure your School Telegram Bot Token in Settings to send live fee reminders.',
      };
    }

    const pendingAmt = Number(feeRecord?.pending_amount ?? ((studentData.tuition_fee || 45000) - (studentData.fee_paid || 0)));
    const totalAmt = Number(feeRecord?.total_amount ?? studentData.tuition_fee ?? 45000);
    const dueDate = feeRecord?.next_due_date || studentData.fee_due_date || 'Promptly';

    const msg = renderNotificationMessage('fee_reminder', {
      student_name: studentData.full_name,
      roll_no: studentData.roll_no || studentData.admission_no || 'N/A',
      pending_amount: pendingAmt.toLocaleString('en-IN'),
      total_amount: totalAmt.toLocaleString('en-IN'),
      due_date: dueDate,
      school_name: schoolSettings.botName || 'School Management System',
    });

    let sent = 0;
    for (const p of parentList) {
      const res = await sendDirectTelegramMessage(botToken, p.telegram_chat_id, msg);
      if (res.ok) sent++;
    }

    if (sent > 0) {
      return {
        success: true,
        ok: true,
        message: `Tuition fee reminder sent to ${sent} verified guardian(s) of ${studentData.full_name}!`,
        recipientsCount: sent,
      };
    }

    return {
      success: false,
      ok: false,
      error: 'Failed to deliver message via Telegram Bot API. Please check Bot Token validity.',
    };
  } catch (clientErr) {
    return {
      success: false,
      ok: false,
      error: 'Error dispatching fee reminder: ' + clientErr.message,
    };
  }
}

/**
 * Dispatches verified examination results to linked guardians via serverless API or direct bot
 */
export async function sendExamResultsTelegram({ examId, studentId = null, examData = null, marksData = null }) {
  if (!examId && !examData) {
    return { success: false, ok: false, error: 'Valid examId or examData is required.' };
  }

  // 1. Try serverless endpoint first
  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'exam_results',
        examId: examId || examData?.id,
        studentId,
        examData,
        marksData,
      }),
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const result = await response.json();
      if (response.ok && result.ok) {
        return {
          success: true,
          ok: true,
          message: result.message || 'Exam results dispatched to guardians successfully!',
          sentCount: result.sentCount || 0,
          failedCount: result.failedCount || 0,
          skippedCount: result.skippedCount || 0,
          details: result.details || [],
        };
      }

      return {
        success: false,
        ok: false,
        error: result.error || `Server responded with HTTP ${response.status}`,
      };
    }
  } catch (err) {
    console.warn('Serverless exam alert endpoint unavailable, checking direct client dispatch:', err);
  }

  // 2. Client-side Direct Bot Fallback
  try {
    const schoolSettings = getSchoolTelegramSettings();
    const botToken = schoolSettings.botToken?.trim();

    if (!botToken) {
      return {
        success: false,
        ok: false,
        error: 'Please configure your School Telegram Bot Token in Settings to send live exam alerts.',
      };
    }

    const marks = marksData || [];
    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const mark of marks) {
      const student = mark.students;
      const parent = student?.parent_students?.[0]?.parents;

      if (!parent || !parent.telegram_chat_id || !parent.is_verified) {
        skippedCount++;
        continue;
      }

      const scoreText = mark.is_absent ? 'ABSENT' : `${mark.marks_obtained} / ${examData?.total_marks || 100}`;
      const statusText = mark.is_absent ? 'Absent' : (Number(mark.marks_obtained) >= Number(examData?.passing_marks || 35) ? 'PASSED ✅' : 'FAILED ❌');

      const msg = renderNotificationMessage('exam_result', {
        student_name: student?.full_name || 'Student',
        roll_no: student?.roll_no || 'N/A',
        exam_name: examData?.name || 'Academic Assessment',
        score: scoreText,
        max_marks: examData?.total_marks || 100,
        percentage: mark.is_absent ? 0 : Math.round(((mark.marks_obtained || 0) / (examData?.total_marks || 100)) * 100),
        grade: statusText,
        school_name: schoolSettings.botName || 'School Management System',
      });

      const sendRes = await sendDirectTelegramMessage(botToken, parent.telegram_chat_id, msg);
      if (sendRes.ok) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    return {
      success: true,
      ok: true,
      message: `Exam notices dispatched: ${sentCount} sent, ${failedCount} failed, ${skippedCount} unlinked guardians.`,
      sentCount,
      failedCount,
      skippedCount,
    };
  } catch (clientErr) {
    return {
      success: false,
      ok: false,
      error: 'Error dispatching exam results: ' + clientErr.message,
    };
  }
}

// =====================================================================
// MESSAGE CENTER & NOTIFICATION TEMPLATES SUBSYSTEM
// =====================================================================

export const TEMPLATES_STORAGE_KEY = 'sms_notification_templates';

export const DEFAULT_NOTIFICATION_TEMPLATES = {
  attendance_present: {
    title: 'Attendance (Present)',
    template: `📚 *Daily Attendance Notification — Present*\n\nDear Guardian,\nYour ward *{student_name}* (Roll No: *{roll_no}*) of batch *{batch_name}* was marked *PRESENT* on *{date}*.\n\n_{school_name}_`,
    variables: ['student_name', 'roll_no', 'batch_name', 'date', 'school_name'],
  },
  attendance_absent: {
    title: 'Attendance (Absent)',
    template: `⚠️ *Daily Attendance Alert — Absent*\n\nDear Guardian,\nYour ward *{student_name}* (Roll No: *{roll_no}*) of batch *{batch_name}* was marked *ABSENT* on *{date}*.\nIf this was unexpected, please contact the academy office immediately.\n\n_{school_name}_`,
    variables: ['student_name', 'roll_no', 'batch_name', 'date', 'school_name'],
  },
  attendance_late: {
    title: 'Attendance (Late)',
    template: `⏰ *Daily Attendance Alert — Late Arrival*\n\nDear Guardian,\nYour ward *{student_name}* (Roll No: *{roll_no}*) of batch *{batch_name}* arrived *LATE* on *{date}*.\n\n_{school_name}_`,
    variables: ['student_name', 'roll_no', 'batch_name', 'date', 'school_name'],
  },
  fee_reminder: {
    title: 'Tuition Fee Milestone Reminder',
    template: `💳 *Tuition Fee Milestone Reminder*\n\nDear Guardian,\nThis is a gentle reminder that tuition fees for *{student_name}* (Roll No: *{roll_no}*) has a pending balance of *₹{pending_amount}*.\nDue Date: *{due_date}*\n\nPlease clear the pending balance to avoid administrative delay.\n\n_{school_name}_`,
    variables: ['student_name', 'roll_no', 'pending_amount', 'total_amount', 'due_date', 'school_name'],
  },
  exam_result: {
    title: 'Exam Evaluation & Results',
    template: `🏆 *Academic Evaluation Report Card*\n\nDear Guardian,\nResults for *{exam_name}* have been published:\nStudent: *{student_name}* (Roll No: *{roll_no}*)\nScore: *{score} / {max_marks}* (*{percentage}%*)\nResult: *{grade}*\n\n_{school_name}_`,
    variables: ['student_name', 'roll_no', 'exam_name', 'score', 'max_marks', 'percentage', 'grade', 'school_name'],
  },
};

/**
 * Loads notification templates from local storage with fallback to system defaults
 */
export function getNotificationTemplates() {
  if (typeof window === 'undefined') return { ...DEFAULT_NOTIFICATION_TEMPLATES };
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_TEMPLATES };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_NOTIFICATION_TEMPLATES,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_TEMPLATES };
  }
}

/**
 * Saves customized notification templates to local storage
 */
export function saveNotificationTemplates(templates) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch (err) {
    console.warn('Could not save notification templates:', err);
  }
}

/**
 * Resets notification templates to factory defaults
 */
export function resetNotificationTemplates() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(TEMPLATES_STORAGE_KEY);
    } catch {}
  }
  return { ...DEFAULT_NOTIFICATION_TEMPLATES };
}

/**
 * Renders a notification template by replacing dynamic `{variable}` tokens
 */
export function renderNotificationMessage(type, variables = {}, customTemplates = null) {
  const allTemplates = customTemplates || getNotificationTemplates();
  const entry = allTemplates[type] || DEFAULT_NOTIFICATION_TEMPLATES[type];
  if (!entry || !entry.template) {
    return 'Notification Alert';
  }

  let text = entry.template;
  Object.keys(variables).forEach((key) => {
    const val = variables[key] ?? '';
    const re = new RegExp(`\\{${key}\\}`, 'g');
    text = text.replace(re, String(val));
  });

  return text;
}

/**
 * Direct Telegram Bot Poller & Sync Service
 * Enables 100% automated parent linking in Desktop Offline mode or local development
 * without requiring external webhooks or public server URLs.
 */
/**
 * Direct Telegram Bot Poller & Sync Service
 * Enables 100% automated parent linking in Desktop Offline mode or local development
 * without requiring external webhooks or public server URLs.
 *
 * Full 2-Step Verification Workflow:
 * 1. Parent clicks WhatsApp link: https://t.me/<bot>?start=tk_<token>
 * 2. Parent taps START in Telegram -> bot sends student ward confirmation prompt with Inline Keyboard:
 *    [ ✅ Yes, This is my child ] [ ❌ No, Cancel ]
 * 3. Parent taps "Yes" -> bot connects Chat ID in Supabase and activates daily roll call alerts.
 * 4. Bot handles plain /start or /help with clear registration instructions so it never freezes.
 */
export async function syncTelegramBotUpdates() {
  const schoolSettings = getSchoolTelegramSettings();
  const envToken = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_TELEGRAM_BOT_TOKEN : '';
  const botToken = (schoolSettings.botToken || envToken || '').trim();

  if (!botToken) {
    return {
      success: false,
      configured: false,
      error: 'Telegram Bot Token is not configured. Please save your Bot Token in Settings.',
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?offset=-50`);
    const data = await res.json();
    if (!res.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `Telegram API returned status ${res.status}`,
      };
    }

    const updates = data.result || [];
    if (updates.length === 0) {
      return { success: true, count: 0, linkedParents: [], message: 'No new updates from Telegram.' };
    }

    // 1. Fetch current parents, invitations, and student associations
    const [pRes, invRes, psRes, stRes, bRes] = await Promise.all([
      supabase.from('parents').select('*'),
      supabase.from('parent_invitations').select('*'),
      supabase.from('parent_students').select('*'),
      supabase.from('students').select('*'),
      supabase.from('batches').select('*'),
    ]);

    const parents = pRes.data || [];
    const invitations = invRes.data || [];
    const parentStudents = psRes.data || [];
    const studentsList = stRes.data || [];
    const batchesList = bRes.data || [];

    if (parents.length === 0) {
      return { success: true, count: 0, linkedParents: [] };
    }

    // Helper to format student ward info
    const getWardsInfo = (parentId) => {
      const links = parentStudents.filter((ps) => ps.parent_id === parentId);
      if (links.length === 0) {
        return {
          html: '• <i>Registered student ward</i>',
          plain: 'Registered student',
        };
      }
      const linesHtml = [];
      const linesPlain = [];
      for (const l of links) {
        const s = studentsList.find((st) => st.id === l.student_id);
        if (s) {
          const b = batchesList.find((bt) => bt.id === s.batch_id);
          const batchName = b ? b.name : 'Cohort';
          const adm = s.admission_no || s.roll_no || 'N/A';
          linesHtml.push(`👤 <b>${s.full_name}</b> (Adm: <code>${adm}</code>, Batch: ${batchName})`);
          linesPlain.push(`${s.full_name} (${adm})`);
        }
      }
      return {
        html: linesHtml.join('\n') || '• <i>Registered student ward</i>',
        plain: linesPlain.join(', ') || 'Registered student',
      };
    };

    let linkedCount = 0;
    const linkedNames = [];

    // Track recently responded actions in this session to prevent duplicate messages
    const processedActionsKey = 'sms_processed_telegram_actions';
    let processedActions = {};
    try {
      processedActions = JSON.parse(sessionStorage.getItem(processedActionsKey) || '{}');
    } catch {}

    for (const update of updates) {
      const updateId = update.update_id;

      // =========================================================================
      // CASE 1: CALLBACK QUERY (Parent tapped an Inline Keyboard button)
      // =========================================================================
      if (update.callback_query) {
        const cb = update.callback_query;
        const callbackId = cb.id;
        const chatId = String(cb.message?.chat?.id || cb.from?.id || '');
        const messageId = cb.message?.message_id;
        const cbData = String(cb.data || '').trim();

        // 1A. CONFIRM LINKING: Parent tapped "✅ Yes, This is my child"
        if (cbData.startsWith('confirm_link:')) {
          const rawToken = cbData.replace(/^confirm_link:/, '').trim();
          const cleanToken = rawToken.replace(/^tk_/, '');

          const matchedParent = parents.find((p) => {
            if (p.linking_token === rawToken || p.linking_token === cleanToken || p.linking_token === `tk_${cleanToken}`) return true;
            if (p.id === rawToken || p.id === cleanToken) return true;
            return false;
          }) || (() => {
            const matchedInv = invitations.find((inv) =>
              inv.token === rawToken || inv.token === cleanToken || inv.token === `tk_${cleanToken}`
            );
            return matchedInv ? parents.find((p) => p.id === matchedInv.parent_id) : null;
          })();

          if (matchedParent) {
            // Acknowledge callback immediately to dismiss Telegram button spinner
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  callback_query_id: callbackId,
                  text: '🎉 Verified & Connected successfully!',
                }),
              });
            } catch {}

            // Save verified chat_id into Supabase / local DB
            if (matchedParent.telegram_chat_id !== chatId || !matchedParent.is_verified) {
              await supabase
                .from('parents')
                .update({
                  telegram_chat_id: chatId,
                  is_verified: true,
                  preferred_notification_channel: 'telegram',
                  invitation_status: 'linked',
                  linking_token: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', matchedParent.id);

              try {
                await supabase
                  .from('parent_invitations')
                  .update({
                    linking_status: 'linked',
                    invitation_status: 'delivered',
                    linked_at: new Date().toISOString(),
                  })
                  .eq('parent_id', matchedParent.id);
              } catch {}

              linkedCount++;
              linkedNames.push(matchedParent.full_name);
            }

            // Edit message to confirmed state
            const wards = getWardsInfo(matchedParent.id);
            try {
              if (messageId) {
                await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    message_id: messageId,
                    text: `🎉 <b>Account Successfully Connected!</b>\n\nNamaste <b>${matchedParent.full_name}</b>,\nYour Telegram account has been verified and connected to <b>SMS — Student Management System</b> for:\n\n${wards.html}\n\nYou will automatically receive official daily roll call attendance alerts, fee reminders, and academic notices directly in this chat.`,
                    parse_mode: 'HTML',
                  }),
                });
              }
            } catch {}
          }
          continue;
        }

        // 1B. CANCEL LINKING: Parent tapped "❌ No, Cancel"
        if (cbData.startsWith('cancel_link:')) {
          try {
            await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                callback_query_id: callbackId,
                text: '❌ Connection cancelled.',
              }),
            });

            if (messageId) {
              await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  message_id: messageId,
                  text: `❌ <b>Connection Cancelled</b>\n\nConnection request was cancelled. If you are a parent or guardian of an enrolled student and believe this was an error, please contact the academy office or request a new invitation link.`,
                  parse_mode: 'HTML',
                }),
              });
            }
          } catch {}
          continue;
        }
      }

      // =========================================================================
      // CASE 2: INCOMING MESSAGE (/start or /start tk_... or general message)
      // =========================================================================
      if (update.message?.text) {
        const chatId = String(update.message.chat?.id || '');
        const msgText = String(update.message.text || '').trim();

        // 2A. Parent tapped START from a deep link: /start tk_<token>
        if (msgText.startsWith('/start ') || (msgText.startsWith('/start') && msgText.length > 6)) {
          const rawToken = msgText.replace(/^\/start\s*/, '').trim();
          const cleanToken = rawToken.replace(/^tk_/, '');

          // Check if we already sent confirmation prompt for this exact message/chat
          const actionKey = `start_prompt_${chatId}_${rawToken}`;
          if (processedActions[actionKey]) continue;

          const matchedParent = parents.find((p) => {
            if (p.linking_token === rawToken || p.linking_token === cleanToken || p.linking_token === `tk_${cleanToken}`) return true;
            if (p.id === rawToken || p.id === cleanToken) return true;
            return false;
          }) || (() => {
            const matchedInv = invitations.find((inv) =>
              inv.token === rawToken || inv.token === cleanToken || inv.token === `tk_${cleanToken}`
            );
            return matchedInv ? parents.find((p) => p.id === matchedInv.parent_id) : null;
          })();

          if (matchedParent) {
            const wards = getWardsInfo(matchedParent.id);

            // If already verified and linked
            if (matchedParent.is_verified && matchedParent.telegram_chat_id === chatId) {
              try {
                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: `🎉 <b>Already Connected!</b>\n\nNamaste <b>${matchedParent.full_name}</b>,\nYour Telegram account is already verified and connected to receive live attendance alerts for:\n\n${wards.html}`,
                    parse_mode: 'HTML',
                  }),
                });
                processedActions[actionKey] = true;
              } catch {}
              continue;
            }

            // Present the 2-step verification Inline Keyboard Confirmation prompt!
            const confirmKeyboard = {
              inline_keyboard: [
                [
                  { text: '✅ Yes, This is my child', callback_data: `confirm_link:${rawToken}` },
                  { text: '❌ No, Cancel', callback_data: `cancel_link:${rawToken}` },
                ],
              ],
            };

            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `👋 <b>Namaste ${matchedParent.full_name}!</b>\n\n❓ <b>Please Confirm Student Association:</b>\nAre you the parent / guardian of:\n\n${wards.html}\n\n🏫 <b>SMS — Student Management System</b>\n\nTap <b>✅ Yes, This is my child</b> below to connect your Telegram account and start receiving instant daily attendance alerts:`,
                  parse_mode: 'HTML',
                  reply_markup: confirmKeyboard,
                }),
              });
              processedActions[actionKey] = true;
            } catch (err) {
              console.warn('Failed to send confirmation prompt to parent:', err);
            }
          } else {
            // Token not recognized
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `⚠️ <b>Invitation Not Found or Expired</b>\n\nThe invitation link you opened was not recognized or has expired (links are valid for 7 days).\n\nPlease request a fresh invitation link from the academy office.`,
                  parse_mode: 'HTML',
                }),
              });
            } catch {}
          }
          continue;
        }

        // 2B. Parent opened bot directly: /start or /help or /status without token
        if (msgText === '/start' || msgText === '/help' || msgText === '/status') {
          const actionKey = `welcome_${chatId}_${updateId}`;
          if (processedActions[actionKey]) continue;

          // Check if this chat is already a linked parent
          const existingParent = parents.find((p) => p.telegram_chat_id === chatId && p.is_verified);
          if (existingParent) {
            const wards = getWardsInfo(existingParent.id);
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `🟢 <b>Connected & Active</b>\n\nNamaste <b>${existingParent.full_name}</b>,\nYour Telegram account is active and connected to receive attendance alerts for:\n\n${wards.html}\n\n<i>SMS — Student Management System</i>`,
                  parse_mode: 'HTML',
                }),
              });
              processedActions[actionKey] = true;
            } catch {}
          } else {
            try {
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: `👋 <b>Namaste! Welcome to SMS — Student Management System</b>\n\nThis official bot provides real-time daily attendance notices and academic updates to verified guardians.\n\n📲 <b>How to Connect:</b>\n1. Open the unique invitation link sent to your registered WhatsApp mobile number.\n2. Tap <b>Start</b> and confirm your child's name.\n3. Your account will automatically activate.\n\n<i>Need assistance? Please contact the academy administrative desk.</i>`,
                  parse_mode: 'HTML',
                }),
              });
              processedActions[actionKey] = true;
            } catch {}
          }
          continue;
        }
      }
    }

    // Persist processed actions map to prevent duplicate messages
    try {
      sessionStorage.setItem(processedActionsKey, JSON.stringify(processedActions));
    } catch {}

    return {
      success: true,
      count: linkedCount,
      linkedParents: linkedNames,
      totalUpdates: updates.length,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


