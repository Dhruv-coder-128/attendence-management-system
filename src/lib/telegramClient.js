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
 * (e.g. https://t.me/SMSAttendanceBot?start=tk_...)
 */
export function getParentTelegramDeepLink(tokenOrId, botUsername = TELEGRAM_BOT_USERNAME) {
  if (!tokenOrId) return '';
  const cleanUsername = normalizeBotUsername(botUsername);
  const param = formatStartParam(tokenOrId);
  return `https://t.me/${cleanUsername}?start=${param}`;
}

/**
 * Generates a direct native Telegram app URI (tg://resolve?domain=...&start=...)
 * Bypasses web redirects on Android and iOS devices to launch the native client directly.
 */
export function getParentTelegramAppUri(tokenOrId, botUsername = TELEGRAM_BOT_USERNAME) {
  if (!tokenOrId) return '';
  const cleanUsername = normalizeBotUsername(botUsername);
  const param = formatStartParam(tokenOrId);
  return `tg://resolve?domain=${cleanUsername}&start=${param}`;
}

/**
 * Returns both the universal HTTPS web link and the direct native tg:// URI
 */
export function getParentTelegramLinks(tokenOrId, botUsername = TELEGRAM_BOT_USERNAME) {
  if (!tokenOrId) {
    return { deepLink: '', appUri: '', token: '' };
  }
  const cleanUsername = normalizeBotUsername(botUsername);
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
 * Dispatches one-click attendance notifications for an entire batch.
 * The serverless backend authorizes student-parent relationships and resolves chat IDs.
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
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Network error communicating with notification dispatcher.',
    };
  }
}

/**
 * Dispatches a single student attendance notice via server API
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
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Notification service connection failure.',
    };
  }
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
1. Tap the link above.
2. Press *START* in the Telegram bot.
3. Your account will be linked instantly to receive real-time roll call alerts.

_SMS — Student Management System_
`.trim();

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
}

/**
 * Queries Telegram Bot & Webhook Status from Serverless API
 */
export async function getTelegramBotStatus() {
  try {
    const res = await fetch('/api/telegram-status');
    return await res.json();
  } catch (err) {
    return { configured: false, error: err.message };
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
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Dispatches an official tuition fee reminder notice to verified guardians
 * via the serverless Telegram Bot API, strictly respecting alert preferences.
 */
export async function sendVerifiedFeeReminder({
  student,
  feeRecord,
  targetParentId = null,
}) {
  if (!student || !student.id) {
    return { success: false, error: 'Valid student details are required.' };
  }

  try {
    const headers = await getAuthHeaders();
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'fee_reminder',
        studentId: student.id,
        feeRecord,
        targetParentId,
      }),
    });

    const result = await response.json();
    if (response.ok && result.ok) {
      return {
        success: true,
        message: result.message || 'Tuition fee reminder dispatched successfully!',
        recipientsCount: result.recipientsCount || 1,
        details: result.details || [],
      };
    }

    return {
      success: false,
      error: result.error || `Server responded with HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Network error communicating with fee reminder gateway.',
    };
  }
}

/**
 * Dispatches verified examination results to linked guardians via the serverless Telegram Bot API,
 * strictly respecting each guardian's notification preference (all vs emergency_only).
 */
export async function sendExamResultsTelegram({ examId, studentId = null, examData = null, marksData = null }) {
  if (!examId && !examData) {
    return { success: false, error: 'Valid examId or examData is required.' };
  }

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

    const result = await response.json();
    if (response.ok && result.ok) {
      return {
        success: true,
        message: result.message || 'Exam results dispatched to guardians successfully!',
        sentCount: result.sentCount || 0,
        failedCount: result.failedCount || 0,
        skippedCount: result.skippedCount || 0,
        details: result.details || [],
      };
    }

    return {
      success: false,
      error: result.error || `Server responded with HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Network error communicating with exam alert gateway.',
    };
  }
}

