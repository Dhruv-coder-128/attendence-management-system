import { supabase } from './supabase';

/**
 * Client-Side Telegram Service
 * Strictly respects verification status: NEVER dispatches to unverified parents.
 */

export const TELEGRAM_BOT_USERNAME = 'RuparelAttendanceBot';

/**
 * Generates an official Telegram deep link for parent registration
 */
export function getParentTelegramDeepLink(parentId, botUsername = TELEGRAM_BOT_USERNAME) {
  if (!parentId) return '';
  return `https://t.me/${botUsername}?start=link_${parentId}`;
}

/**
 * Manually links or verifies a parent's Telegram Chat ID in Supabase
 */
export async function linkParentTelegramAccount(parentId, telegramChatId) {
  if (!supabase) throw new Error('Supabase client not initialized.');
  if (!parentId) throw new Error('Parent ID is required.');
  if (!telegramChatId || !String(telegramChatId).trim()) {
    throw new Error('Valid Telegram Chat ID is required.');
  }

  const cleanChatId = String(telegramChatId).trim();

  const { data, error } = await supabase
    .from('parents')
    .update({
      telegram_chat_id: cleanChatId,
      is_verified: true,
      preferred_notification_channel: 'telegram',
    })
    .eq('id', parentId)
    .select()
    .single();

  if (error) throw error;
  return { success: true, parent: data, chatId: cleanChatId, ...data };
}

/**
 * Dispatches an attendance notification for a student to their verified guardian
 */
export async function sendVerifiedAttendanceNotice({
  student,
  status,
  date,
  batchName,
  parent,
}) {
  if (!parent) {
    return {
      success: false,
      error: 'No parent is linked to this student record.',
    };
  }

  if (!parent.is_verified || !parent.telegram_chat_id) {
    return {
      success: false,
      error: `Parent "${parent.full_name}" has not completed Telegram linking yet. Please share the one-time deep link to verify their account first.`,
      requiresLinking: true,
      deepLink: getParentTelegramDeepLink(parent.id),
    };
  }

  // Attempt serverless dispatch
  try {
    const response = await fetch('/api/telegram-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: student.full_name,
        admissionNo: student.admission_no,
        batchName: batchName || 'Regular Session',
        date,
        status,
        chatId: parent.telegram_chat_id,
        parentName: parent.full_name,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      return {
        success: true,
        messageId: result.messageId,
        parentName: parent.full_name,
        chatId: parent.telegram_chat_id,
      };
    }

    const errData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errData.error || `Serverless dispatch returned HTTP ${response.status}`,
    };
  } catch (err) {
    // If running in local dev without Vercel CLI serverless dev server:
    console.warn('API route /api/telegram-notify not reachable locally:', err);
    return {
      success: false,
      error: 'Telegram serverless endpoint (/api/telegram-notify) requires Vercel environment with TELEGRAM_BOT_TOKEN.',
      parentVerified: true,
      chatId: parent.telegram_chat_id,
    };
  }
}
