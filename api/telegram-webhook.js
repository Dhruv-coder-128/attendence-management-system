import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Telegram Bot Webhook
 * Automated Parent-Linking Workflow for Ruparel Attendance ERP
 *
 * Flow:
 * 1. Parent clicks unique invitation link: https://t.me/<Bot>?start=tk_<token>
 * 2. Parent presses START in Telegram.
 * 3. Webhook automatically reads Telegram Chat ID from the incoming update (no manual entry!).
 * 4. Bot looks up invitation token server-side, resolves the parent & associated student ward(s).
 * 5. Bot presents the student ward's name(s) and prompts parent to confirm via Inline Button.
 * 6. Parent taps "Confirm & Connect" (or replies /confirm).
 * 7. Webhook validates authorization, atomically updates Supabase to Linked, consumes the single-use token,
 *    and sends the success confirmation with notification setup details.
 */

// Helper to escape HTML special characters for Telegram HTML parse_mode
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req, res) {
  // Telegram sends POST requests with update object
  if (req.method !== 'POST') {
    return res.status(200).send('Ruparel Attendance ERP Telegram Webhook Active (POST expected).');
  }

  const rawToken = process.env.TELEGRAM_BOT_TOKEN;
  const botToken = rawToken ? String(rawToken).trim().replace(/^["']|["']$/g, '') : '';
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  let update = req.body;
  if (typeof update === 'string') {
    try {
      update = JSON.parse(update);
    } catch {
      update = null;
    }
  }

  if (!update) {
    return res.status(200).json({ ok: true });
  }

  // Extract Telegram message or callback query
  const callbackQuery = update.callback_query;
  const message = callbackQuery ? callbackQuery.message : (update.message || update.edited_message);

  if (!message || (!message.chat && !callbackQuery?.from)) {
    return res.status(200).json({ ok: true });
  }

  const chatId = String(message.chat?.id || callbackQuery?.from?.id);
  const senderName = [message.from?.first_name || callbackQuery?.from?.first_name, message.from?.last_name || callbackQuery?.from?.last_name]
    .filter(Boolean)
    .join(' ') || 'Guardian';

  // Helper to send Telegram message safely using HTML with plain text fallback
  async function sendTelegramMessage(targetChatId, textToSend, replyMarkup = null) {
    if (!botToken) {
      console.warn('TELEGRAM_BOT_TOKEN not configured on server');
      return { ok: false };
    }
    try {
      const payload = {
        chat_id: targetChatId,
        text: textToSend,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();

      if (!data.ok && data.description && data.description.includes('can\'t parse entities')) {
        // Fallback: strip HTML tags and send as plain text
        const plainText = textToSend.replace(/<[^>]*>/g, '');
        payload.text = plainText;
        delete payload.parse_mode;
        const plainResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await plainResp.json();
      }

      return data;
    } catch (err) {
      console.error('Failed to send Telegram message:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // Helper to answer Telegram callback query (removes client loading state)
  async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    if (!botToken || !callbackQueryId) return { ok: true };
    try {
      const payload = { callback_query_id: callbackQueryId };
      if (text) payload.text = String(text);
      if (showAlert) payload.show_alert = true;

      const resp = await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await resp.json();
    } catch (err) {
      console.warn('answerCallbackQuery error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // Helper to edit existing Telegram message
  async function editTelegramMessage(targetChatId, messageId, newText, replyMarkup = null) {
    if (!botToken || !targetChatId || !messageId) return { ok: false };
    try {
      const payload = {
        chat_id: targetChatId,
        message_id: messageId,
        text: newText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (replyMarkup !== null) {
        payload.reply_markup = replyMarkup;
      }
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!data.ok && data.description && data.description.includes('can\'t parse entities')) {
        const plainText = newText.replace(/<[^>]*>/g, '');
        payload.text = plainText;
        delete payload.parse_mode;
        const plainResp = await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        return await plainResp.json();
      }
      return data;
    } catch (err) {
      console.warn('editTelegramMessage error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration in serverless environment.');
    await sendTelegramMessage(chatId, '⚠️ <b>Configuration Error</b>: Database connection is temporarily unavailable. Please try again shortly.');
    return res.status(200).json({ ok: false, error: 'Database unconfigured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Helper: query only the student wards associated with a specific parent
  async function fetchWardsForParent(parentId) {
    if (!parentId) return [];
    try {
      const { data: studentLinks } = await supabase
        .from('parent_students')
        .select(`
          relationship,
          students:student_id (
            id,
            full_name,
            admission_no,
            batches:batch_id ( name, code )
          )
        `)
        .eq('parent_id', parentId);

      return (studentLinks || [])
        .map((sl) => {
          const s = sl.students;
          if (!s) return null;
          return {
            full_name: s.full_name,
            admission_no: s.admission_no,
            batch_code: s.batches?.code || 'Cohort',
            relationship: sl.relationship || 'Ward',
          };
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  // Helper: formats a list of student wards as HTML bullet points
  function formatWardsHtml(wards) {
    if (!wards || wards.length === 0) {
      return '• <i>Registered student ward</i>';
    }
    return wards
      .map((w) => `• <b>${escapeHtml(w.full_name)}</b> — Adm No: <code>${escapeHtml(w.admission_no)}</code> (${escapeHtml(w.batch_code)})`)
      .join('\n');
  }

  // Helper: executes server-side parent linking and token consumption
  async function executeParentLinking(tokenParam, targetChatId) {
    let linkedParent = null;
    let rpcFailed = false;

    // STEP A: Try atomic PostgreSQL RPC function first
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('link_parent_telegram_by_token', {
        p_token: tokenParam,
        p_chat_id: targetChatId,
      });

      if (!rpcErr && rpcRes) {
        if (rpcRes.success) {
          linkedParent = { id: rpcRes.parent_id, full_name: rpcRes.parent_name };
        } else {
          return { success: false, errorCode: rpcRes.error_code, error: rpcRes.error };
        }
      } else {
        rpcFailed = true;
      }
    } catch {
      rpcFailed = true;
    }

    // STEP B: Fallback direct query if RPC function was not created yet
    if (rpcFailed || !linkedParent) {
      let invitation = null;
      try {
        const { data: invData } = await supabase
          .from('parent_invitations')
          .select('*, parents:parent_id ( id, full_name )')
          .eq('token', tokenParam)
          .maybeSingle();
        if (invData) invitation = invData;
      } catch {}

      let parentRecord = null;
      if (invitation) {
        parentRecord = invitation.parents;
        if (new Date(invitation.expires_at) < new Date()) {
          try {
            await supabase.from('parent_invitations').update({ linking_status: 'expired' }).eq('id', invitation.id);
          } catch {}
          return { success: false, errorCode: 'EXPIRED_TOKEN', error: 'Invitation link has expired.' };
        }
        if (invitation.linking_status === 'linked') {
          return { success: false, errorCode: 'ALREADY_LINKED', error: 'Invitation token has already been used.' };
        }
      } else {
        const cleanParam = tokenParam.replace(/^(tk_|link_)/, '');
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanParam);

        let pData = null;
        const pQueryRes = await (isUuid
          ? supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at').or(`id.eq.${cleanParam},linking_token.eq.${tokenParam}`).maybeSingle()
          : supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at').eq('linking_token', tokenParam).maybeSingle()
        );

        if (pQueryRes.error && pQueryRes.error.message?.includes('linking_token')) {
          if (isUuid) {
            const baseRes = await supabase.from('parents').select('id, full_name').eq('id', cleanParam).maybeSingle();
            pData = baseRes.data;
          }
        } else {
          pData = pQueryRes.data;
        }

        if (pData) {
          parentRecord = pData;
          if (pData.linking_token_expires_at && new Date(pData.linking_token_expires_at) < new Date()) {
            return { success: false, errorCode: 'EXPIRED_TOKEN', error: 'Invitation link has expired.' };
          }
        }
      }

      if (!parentRecord) {
        return { success: false, errorCode: 'INVALID_TOKEN', error: 'Invalid invitation link.' };
      }

      // Update parent record in Supabase
      const upRes = await supabase
        .from('parents')
        .update({
          telegram_chat_id: targetChatId,
          is_verified: true,
          preferred_notification_channel: 'telegram',
          invitation_status: 'linked',
          linking_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentRecord.id);

      if (upRes.error && upRes.error.message?.includes('invitation_status')) {
        await supabase
          .from('parents')
          .update({
            telegram_chat_id: targetChatId,
            is_verified: true,
            preferred_notification_channel: 'telegram',
            updated_at: new Date().toISOString(),
          })
          .eq('id', parentRecord.id);
      }

      if (invitation) {
        try {
          await supabase
            .from('parent_invitations')
            .update({
              linking_status: 'linked',
              invitation_status: 'delivered',
              linked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', invitation.id);
        } catch {}
      }

      linkedParent = parentRecord;
    }

    return { success: true, parent: linkedParent };
  }

  // =========================================================================
  // 1. HANDLE INLINE BUTTON CALLBACK QUERY (CONFIRMATION / CANCELLATION)
  // =========================================================================
  if (callbackQuery) {
    const callbackData = (callbackQuery.data || '').trim();
    const messageId = message.message_id;

    // Action A: Cancel Linking
    if (callbackData.startsWith('cancel_link:')) {
      await answerCallbackQuery(callbackQuery.id, 'Connection cancelled.');
      await editTelegramMessage(
        chatId,
        messageId,
        `
❌ <b>Connection Cancelled</b>

No changes were made to your account. You can tap your personalized invitation link again whenever you are ready to connect.
`.trim(),
        { inline_keyboard: [] }
      );
      return res.status(200).json({ ok: true, cancelled: true });
    }

    // Action B: Confirm and Link Account
    if (callbackData.startsWith('confirm_link:')) {
      const tokenParam = callbackData.replace(/^confirm_link:/, '').trim();
      await answerCallbackQuery(callbackQuery.id, 'Connecting your account...');

      const linkResult = await executeParentLinking(tokenParam, chatId);

      if (!linkResult.success) {
        let errorMsg = '❌ <b>Invalid Invitation Link</b>\n\nThis invitation link was not recognized. Please request a fresh link from Ruparel Academy.';
        if (linkResult.errorCode === 'EXPIRED_TOKEN') {
          errorMsg = '⚠️ <b>Invitation Link Expired</b>\n\nThis invitation link has expired (links are valid for 7 days). Please contact Ruparel Academy administration to receive a fresh invitation link.';
        } else if (linkResult.errorCode === 'ALREADY_LINKED') {
          errorMsg = 'ℹ️ <b>Link Already Used</b>\n\nThis invitation link has already been used and cannot be reused. Your account may already be linked.\n\n<i>Type /status to verify your current connection.</i>';
        }

        await editTelegramMessage(chatId, messageId, errorMsg.trim(), { inline_keyboard: [] });
        return res.status(200).json({ ok: true, linked: false, reason: linkResult.errorCode });
      }

      // Success: Fetch only the student wards associated with this parent
      const wards = await fetchWardsForParent(linkResult.parent.id);
      const wardsList = formatWardsHtml(wards);

      const successMessage = `
🎉 <b>Account Successfully Connected!</b>

Namaste <b>${escapeHtml(linkResult.parent.full_name)}</b>,
Your Telegram account has been securely verified and linked to <b>Ruparel Attendance ERP</b>.

👥 <b>Connected Student Ward(s):</b>
${wardsList}

🔔 <b>Real-Time Notifications Active:</b>
You will automatically receive official daily roll call notices directly in this Telegram chat whenever attendance is marked for your child.

<i>Type /status at any time to verify your registration status.</i>
`.trim();

      await editTelegramMessage(chatId, messageId, successMessage, { inline_keyboard: [] });
      return res.status(200).json({ ok: true, linked: true, parent: linkResult.parent.full_name, chatId });
    }

    await answerCallbackQuery(callbackQuery.id);
    return res.status(200).json({ ok: true });
  }

  // =========================================================================
  // 2. HANDLE TEXT COMMANDS AND DEEP LINKS (/start <token>, /status, etc.)
  // =========================================================================
  const text = (message.text || '').trim();
  const tokens = text.split(/\s+/);
  const rawCommand = tokens[0].toLowerCase();
  const command = rawCommand.split('@')[0]; // Strips @RuparelAttendanceBot
  const param = tokens[1] ? tokens[1].trim() : '';

  // 2A. HANDLE /confirm <token> (Text command fallback for button confirmation)
  if (command === '/confirm' && param) {
    const linkResult = await executeParentLinking(param, chatId);
    if (!linkResult.success) {
      if (linkResult.errorCode === 'EXPIRED_TOKEN') {
        await sendTelegramMessage(chatId, '⚠️ <b>Invitation Link Expired</b>\n\nThis invitation link has expired. Please request a fresh invitation link from Ruparel Academy.');
      } else if (linkResult.errorCode === 'ALREADY_LINKED') {
        await sendTelegramMessage(chatId, 'ℹ️ <b>Link Already Used</b>\n\nThis invitation token has already been used.');
      } else {
        await sendTelegramMessage(chatId, '❌ <b>Invalid Invitation Link</b>\n\nThis invitation link was not recognized. Please make sure you clicked the complete link.');
      }
      return res.status(200).json({ ok: true, linked: false });
    }

    const wards = await fetchWardsForParent(linkResult.parent.id);
    const wardsList = formatWardsHtml(wards);

    await sendTelegramMessage(chatId, `
🎉 <b>Account Successfully Connected!</b>

Namaste <b>${escapeHtml(linkResult.parent.full_name)}</b>,
Your Telegram account has been securely verified and linked to <b>Ruparel Attendance ERP</b>.

👥 <b>Connected Student Ward(s):</b>
${wardsList}

🔔 <b>Real-Time Notifications Active:</b>
You will automatically receive official daily attendance notices in this chat.

<i>Type /status at any time to verify your registration status.</i>
`.trim());
    return res.status(200).json({ ok: true, linked: true });
  }

  // 2B. HANDLE DEEP LINK INVITATION: /start <token>
  if (command === '/start' && param) {
    try {
      // Check IDEMPOTENCY: Is this chat ID already linked to a parent?
      const { data: alreadyLinkedParents } = await supabase
        .from('parents')
        .select(`
          id,
          full_name,
          parent_students (
            students:student_id ( full_name, admission_no, batches ( code ) )
          )
        `)
        .eq('telegram_chat_id', chatId)
        .limit(1);

      if (alreadyLinkedParents && alreadyLinkedParents.length > 0) {
        const p = alreadyLinkedParents[0];
        const wards = (p.parent_students || [])
          .map((ps) => ps.students ? `• <b>${escapeHtml(ps.students.full_name)}</b> (Adm No: <code>${escapeHtml(ps.students.admission_no)}</code>)` : null)
          .filter(Boolean);

        const wardsList = wards.length > 0 ? `\n\n👥 <b>Registered Ward(s):</b>\n${wards.join('\n')}` : '';

        await sendTelegramMessage(chatId, `
✅ <b>Account Already Connected!</b>

Namaste <b>${escapeHtml(p.full_name)}</b>,
Your Telegram account is already verified and connected to Ruparel Attendance ERP.${wardsList}

You will receive real-time roll call notifications whenever attendance is marked.

<i>Type /status at any time to verify your registration status.</i>
`.trim());
        return res.status(200).json({ ok: true, already_linked: true });
      }

      // Step 1: Look up invitation details server-side
      let invDetails = null;

      // Try RPC function first
      try {
        const { data: rpcDetails, error: rpcErr } = await supabase.rpc('get_invitation_details_by_token', {
          p_token: param,
        });
        if (!rpcErr && rpcDetails) {
          invDetails = rpcDetails;
        }
      } catch {}

      // Fallback direct query if RPC function is not created yet
      if (!invDetails) {
        let invitation = null;
        try {
          const { data: invData } = await supabase
            .from('parent_invitations')
            .select('*, parents:parent_id ( id, full_name, is_verified, telegram_chat_id )')
            .eq('token', param)
            .maybeSingle();
          if (invData) invitation = invData;
        } catch {}

        if (invitation) {
          if (invitation.linking_status === 'linked') {
            invDetails = { valid: false, status: 'already_linked' };
          } else if (new Date(invitation.expires_at) < new Date()) {
            invDetails = { valid: false, status: 'expired' };
          } else {
            const wards = await fetchWardsForParent(invitation.parent_id);
            invDetails = {
              valid: true,
              status: 'ready',
              parent_id: invitation.parent_id,
              parent_name: invitation.parents?.full_name,
              wards,
            };
          }
        } else {
          const cleanParam = param.replace(/^(tk_|link_)/, '');
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanParam);

          let pData = null;
          const pQueryRes = await (isUuid
            ? supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at').or(`id.eq.${cleanParam},linking_token.eq.${param}`).maybeSingle()
            : supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at').eq('linking_token', param).maybeSingle()
          );

          if (pQueryRes.error && pQueryRes.error.message?.includes('linking_token')) {
            if (isUuid) {
              const baseRes = await supabase.from('parents').select('id, full_name').eq('id', cleanParam).maybeSingle();
              pData = baseRes.data;
            }
          } else {
            pData = pQueryRes.data;
          }

          if (pData) {
            if (pData.linking_token_expires_at && new Date(pData.linking_token_expires_at) < new Date()) {
              invDetails = { valid: false, status: 'expired' };
            } else {
              const wards = await fetchWardsForParent(pData.id);
              invDetails = {
                valid: true,
                status: 'ready',
                parent_id: pData.id,
                parent_name: pData.full_name,
                wards,
              };
            }
          } else {
            invDetails = { valid: false, status: 'not_found' };
          }
        }
      }

      // Handle invalid / expired / already used invitations
      if (!invDetails || !invDetails.valid) {
        if (invDetails?.status === 'expired') {
          await sendTelegramMessage(chatId, '⚠️ <b>Invitation Link Expired</b>\n\nThis linking link has expired (links are valid for 7 days). Please contact Ruparel Academy administration to receive a fresh invitation link.');
          return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
        }
        if (invDetails?.status === 'already_linked') {
          await sendTelegramMessage(chatId, 'ℹ️ <b>Link Already Used</b>\n\nThis invitation token has already been used and cannot be reused. Your account may already be linked.\n\n<i>Type /status to verify your current connection.</i>');
          return res.status(200).json({ ok: true, linked: false, reason: 'already_used' });
        }
        await sendTelegramMessage(chatId, '❌ <b>Invalid Invitation Link</b>\n\nThis invitation link was not recognized. Please make sure you clicked the full link provided by Ruparel Academy.');
        return res.status(200).json({ ok: true, linked: false, reason: 'invalid_token' });
      }

      // Format only the student wards associated with this parent
      const wardsList = formatWardsHtml(invDetails.wards);

      // Present the student ward details and ask parent to confirm
      const confirmPromptMessage = `
👋 <b>Namaste ${escapeHtml(invDetails.parent_name)}!</b>

Welcome to <b>Ruparel Attendance ERP</b>.

You are connecting your Telegram account to receive official daily roll call attendance alerts for your student ward(s):

👥 <b>Registered Student Ward(s):</b>
${wardsList}

Please confirm below to connect this Telegram account.
`.trim();

      const inlineKeyboard = {
        inline_keyboard: [
          [
            { text: '✅ Confirm & Connect', callback_data: `confirm_link:${param}` },
            { text: '❌ Cancel', callback_data: `cancel_link:${param}` },
          ],
        ],
      };

      await sendTelegramMessage(chatId, confirmPromptMessage, inlineKeyboard);
      return res.status(200).json({ ok: true, prompt_sent: true, parent: invDetails.parent_name, chatId });
    } catch (err) {
      console.error('Webhook start error:', err);
      await sendTelegramMessage(chatId, '⚠️ <b>Registration Error</b>: An error occurred while preparing your connection. Please try again or contact the academy office.');
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // 2C. HANDLE STATUS CHECK: /status
  if (command === '/status') {
    try {
      let foundParent = null;
      let wardItems = [];

      try {
        const { data: statusRpc } = await supabase.rpc('get_parent_status_by_chat_id', { p_chat_id: chatId });
        if (statusRpc && statusRpc.found) {
          foundParent = { id: statusRpc.parent_id, full_name: statusRpc.parent_name };
          wardItems = (statusRpc.wards || []).map((w) => `• <b>${escapeHtml(w.full_name)}</b> (Adm No: <code>${escapeHtml(w.admission_no)}</code>)`);
        }
      } catch {}

      if (!foundParent) {
        const { data: linkedParents } = await supabase
          .from('parents')
          .select(`
            id,
            full_name,
            parent_students (
              students:student_id ( full_name, admission_no, batches ( code ) )
            )
          `)
          .eq('telegram_chat_id', chatId);

        if (linkedParents && linkedParents.length > 0) {
          foundParent = linkedParents[0];
          wardItems = (foundParent.parent_students || [])
            .map((ps) => ps.students ? `• <b>${escapeHtml(ps.students.full_name)}</b> (${escapeHtml(ps.students.batches?.code || 'Cohort')})` : null)
            .filter(Boolean);
        }
      }

      if (foundParent) {
        await sendTelegramMessage(chatId, `
✅ <b>Account Status: Active & Linked</b>

Guardian: <b>${escapeHtml(foundParent.full_name)}</b>

${wardItems.length > 0 ? `Connected Wards:\n${wardItems.join('\n')}\n\n` : ''}You are set to receive real-time roll call notices.
`.trim());
      } else {
        await sendTelegramMessage(chatId, `
ℹ️ <b>Account Status: Unlinked</b>

This Telegram chat is not currently connected to any student ward in Ruparel Attendance ERP.

Please click the personalized invitation link sent to you by Ruparel Academy to connect.
`.trim());
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Status check error:', err);
      return res.status(200).json({ ok: true });
    }
  }

  // 2D. FALLBACK GREETING: /start (without token) or general message
  await sendTelegramMessage(chatId, `
👋 Namaste <b>${escapeHtml(senderName)}</b>,

Welcome to <b>Ruparel Attendance ERP Academy Bot</b>.

This bot sends official daily attendance alerts to verified parents.

👉 <b>How to connect your account:</b>
1. Open the personal invitation link provided by Ruparel Academy (via WhatsApp or SMS).
2. Tap the link and press <b>START</b>.
3. Review your child's details and tap <b>Confirm & Connect</b>.

<i>Type /status at any time to check your current registration status.</i>
`.trim());

  return res.status(200).json({ ok: true });
}
