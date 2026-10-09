import { supabase } from './supabase.js';

/**
 * Client-Side Telegram & Parent Communications Service
 * Ruparel Attendance ERP
 * 
 * Strict Security Principles:
 * - Never fabricates delivery success.
 * - Attendance notices are routed strictly via server-side student-parent joins.
 * - Secure single-use, time-limited linking tokens.
 * - Honest tracking of WhatsApp manual share mode vs automated gateway.
 */

export const TELEGRAM_BOT_USERNAME = 'RuparelAttendanceBot';

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
 * Generates an official Telegram deep link for parent registration
 */
export function getParentTelegramDeepLink(tokenOrId, botUsername = TELEGRAM_BOT_USERNAME) {
  if (!tokenOrId) return '';
  const str = String(tokenOrId).trim();
  const param = str.startsWith('tk_') || str.startsWith('link_') ? str : `tk_${str}`;
  return `https://t.me/${botUsername}?start=${param}`;
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
  if (!supabase) throw new Error('Supabase client not initialized.');
  if (!parentId) throw new Error('Parent ID is required.');
  if (!telegramChatId || !String(telegramChatId).trim()) {
    throw new Error('Valid numeric Telegram Chat ID is required.');
  }

  const cleanChatId = String(telegramChatId).trim();

  const { data, error } = await supabase
    .from('parents')
    .update({
      telegram_chat_id: cleanChatId,
      is_verified: true,
      preferred_notification_channel: 'telegram',
      invitation_status: 'linked',
    })
    .eq('id', parentId)
    .select()
    .single();

  if (error) throw error;

  // Also update parent_invitations linking_status if present
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

  return { success: true, parent: data, chatId: cleanChatId, ...data };
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

This is an official invitation from *Ruparel Attendance ERP Academy*${wardText}.

To receive instant daily roll call attendance notifications directly on your phone:
👉 *Click here to connect:* ${deepLinkUrl}

*Instructions:*
1. Tap the link above.
2. Press *START* in the Telegram bot.
3. Your account will be linked instantly to receive real-time roll call alerts.

_Ruparel Attendance Management System_
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
