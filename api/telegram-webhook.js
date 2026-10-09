import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Telegram Bot Webhook
 * Production-ready webhook handling /start <token> deep links for secure parent linking.
 * 
 * Flow:
 * 1. Parent clicks unique invitation link: https://t.me/<Bot>?start=tk_<token>
 * 2. Parent presses START in Telegram
 * 3. Telegram Bot API posts update to this webhook
 * 4. Webhook validates token (checks existence, expiration, and single-use)
 * 5. Atomically links Telegram Chat ID to the verified parent record
 * 6. Dispatches personalized confirmation with student ward details
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

  const message = update.message || update.edited_message;
  if (!message || !message.chat) {
    return res.status(200).json({ ok: true });
  }

  const text = (message.text || '').trim();
  const chatId = String(message.chat.id);
  const senderName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || 'Guardian';

  // Helper to send Telegram message safely using HTML with plain text fallback
  async function sendTelegramMessage(textToSend) {
    if (!botToken) {
      console.warn('TELEGRAM_BOT_TOKEN not configured on server');
      return { ok: false };
    }
    try {
      const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: textToSend,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      const data = await resp.json();

      if (!data.ok && data.description && data.description.includes('can\'t parse entities')) {
        // Fallback: strip HTML tags and send as plain text
        const plainText = textToSend.replace(/<[^>]*>/g, '');
        const plainResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: plainText,
            disable_web_page_preview: true,
          }),
        });
        return await plainResp.json();
      }

      return data;
    } catch (err) {
      console.error('Failed to send Telegram message:', err.message);
      return { ok: false, error: err.message };
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration in serverless environment.');
    await sendTelegramMessage('⚠️ <b>Configuration Error</b>: Database connection is temporarily unavailable. Please try again shortly.');
    return res.status(200).json({ ok: false, error: 'Database unconfigured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse command & deep link parameter
  // Telegram sends: "/start <parameter>" or "/start" or "/start@bot_username <parameter>"
  const tokens = text.split(/\s+/);
  const rawCommand = tokens[0].toLowerCase();
  const command = rawCommand.split('@')[0]; // Strips @RuparelAttendanceBot
  const param = tokens[1] ? tokens[1].trim() : '';

  // 1. HANDLE DEEP LINK INVITATION TOKEN: /start <token>
  if (command === '/start' && param) {
    try {
      // Check IDEMPOTENCY first: Is this chat already linked to a parent?
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

        await sendTelegramMessage(`
✅ <b>Account Already Connected!</b>

Namaste <b>${escapeHtml(p.full_name)}</b>,
Your Telegram account is already verified and connected to Ruparel Attendance ERP.${wardsList}

You will receive real-time roll call notifications whenever attendance is marked.

<i>Type /status at any time to verify your registration status.</i>
`.trim());
        return res.status(200).json({ ok: true, already_linked: true });
      }

      let linkedParent = null;
      let rpcFailed = false;

      // STEP A: Try atomic PostgreSQL RPC function first
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('link_parent_telegram_by_token', {
          p_token: param,
          p_chat_id: chatId,
        });

        if (!rpcErr && rpcRes) {
          if (rpcRes.success) {
            linkedParent = { id: rpcRes.parent_id, full_name: rpcRes.parent_name };
          } else {
            // Handled business errors: EXPIRED, ALREADY_LINKED, INVALID
            if (rpcRes.error_code === 'EXPIRED_TOKEN') {
              await sendTelegramMessage('⚠️ <b>Invitation Link Expired</b>\n\nThis linking link has expired (links are valid for 7 days). Please contact Ruparel Academy administration to receive a fresh invitation link.');
              return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
            } else if (rpcRes.error_code === 'ALREADY_LINKED') {
              await sendTelegramMessage('ℹ️ <b>Link Already Used</b>\n\nThis invitation token has already been used and cannot be reused. Your account may already be linked.');
              return res.status(200).json({ ok: true, linked: false, reason: 'already_used' });
            } else {
              await sendTelegramMessage('❌ <b>Invalid Invitation Link</b>\n\nThis invitation link was not recognized. Please make sure you clicked the full link provided by Ruparel Academy.');
              return res.status(200).json({ ok: true, linked: false, reason: 'invalid_token' });
            }
          }
        } else {
          rpcFailed = true;
        }
      } catch (err) {
        rpcFailed = true;
      }

      // STEP B: Direct fallback query if RPC function was not created yet
      if (rpcFailed || !linkedParent) {
        // 1. Check parent_invitations table
        let invitation = null;
        try {
          const { data: invData } = await supabase
            .from('parent_invitations')
            .select('*, parents:parent_id ( id, full_name )')
            .eq('token', param)
            .maybeSingle();
          if (invData) invitation = invData;
        } catch {
          // Table may not exist yet
        }

        // 2. Check parents table fallback
        let parentRecord = null;
        if (invitation) {
          parentRecord = invitation.parents;
          if (new Date(invitation.expires_at) < new Date()) {
            await supabase.from('parent_invitations').update({ linking_status: 'expired' }).eq('id', invitation.id);
            await sendTelegramMessage('⚠️ <b>Invitation Link Expired</b>\n\nThis linking link has expired. Please contact Ruparel Academy administration to receive a fresh invitation link.');
            return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
          }
          if (invitation.linking_status === 'linked') {
            await sendTelegramMessage('ℹ️ <b>Link Already Used</b>\n\nThis invitation link has already been used.');
            return res.status(200).json({ ok: true, linked: false, reason: 'already_linked' });
          }
        } else {
          // Check fallback on parents table (linking_token or legacy link_<id> / tk_<id>)
          const cleanParam = param.replace(/^(tk_|link_)/, '');
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanParam);

          let pQuery = supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at');
          if (isUuid) {
            pQuery = pQuery.or(`id.eq.${cleanParam},linking_token.eq.${param}`);
          } else {
            pQuery = pQuery.eq('linking_token', param);
          }

          const { data: pData } = await pQuery.maybeSingle();
          if (pData) {
            parentRecord = pData;
            if (pData.linking_token_expires_at && new Date(pData.linking_token_expires_at) < new Date()) {
              await sendTelegramMessage('⚠️ <b>Invitation Link Expired</b>\n\nThis invitation link has expired. Please request a new invitation link.');
              return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
            }
          }
        }

        if (!parentRecord) {
          await sendTelegramMessage(`
❌ <b>Invalid Invitation Link</b>

This invitation link was not recognized. Please ensure you clicked the full link provided by Ruparel Academy.

Your Telegram Chat ID: <code>${chatId}</code>
(You can share this Chat ID with the academy office to link your account manually)
`.trim());
          return res.status(200).json({ ok: true, linked: false, reason: 'unrecognized' });
        }

        // Link parent record in Supabase
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
          .eq('id', parentRecord.id);

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
          } catch {
            // Non-fatal
          }
        }

        linkedParent = parentRecord;
      }

      // STEP C: Query student wards linked to this guardian
      const { data: studentLinks } = await supabase
        .from('parent_students')
        .select(`
          relationship,
          students:student_id (
            full_name,
            admission_no,
            batches:batch_id ( name, code )
          )
        `)
        .eq('parent_id', linkedParent.id);

      const wards = (studentLinks || [])
        .map((sl) => {
          const s = sl.students;
          if (!s) return null;
          const b = s.batches ? `(${escapeHtml(s.batches.code)})` : '';
          return `• <b>${escapeHtml(s.full_name)}</b> — Adm No: <code>${escapeHtml(s.admission_no)}</code> ${b}`;
        })
        .filter(Boolean);

      const wardsSection = wards.length > 0
        ? `\n👥 <b>Registered Student Ward(s):</b>\n${wards.join('\n')}\n`
        : '\n';

      // Send personalized confirmation message to parent
      const welcomeMessage = `
✅ <b>Registration Confirmed!</b>

Namaste <b>${escapeHtml(linkedParent.full_name)}</b>,
Your Telegram account has been securely linked to <b>Ruparel Attendance ERP</b>.
${wardsSection}
🔔 <b>What happens next?</b>
Whenever daily roll call attendance is logged for your child, you will receive real-time notices directly in this Telegram chat.

<i>Ruparel Attendance ERP — Official Communications System</i>
`.trim();

      await sendTelegramMessage(welcomeMessage);
      return res.status(200).json({ ok: true, linked: true, parent: linkedParent.full_name, chatId });
    } catch (err) {
      console.error('Webhook linking exception:', err);
      await sendTelegramMessage('⚠️ <b>Linking Error</b>: An error occurred while registering your account. Please try again or contact the academy office.');
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // 2. HANDLE STATUS CHECK: /status
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
      } catch {
        // Fallback to direct query
      }

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
        await sendTelegramMessage(`
✅ <b>Account Status: Active & Linked</b>

Guardian: <b>${escapeHtml(foundParent.full_name)}</b>
Chat ID: <code>${chatId}</code>

${wardItems.length > 0 ? `Registered Wards:\n${wardItems.join('\n')}\n\n` : ''}You are set to receive real-time roll call notices.
`.trim());
      } else {
        await sendTelegramMessage(`
ℹ️ <b>Account Status: Unlinked</b>

This Telegram chat (<code>${chatId}</code>) is not currently connected to any student ward in Ruparel Attendance ERP.

Please click the personalized linking link provided in your academy invitation message.
`.trim());
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Status check error:', err);
      return res.status(200).json({ ok: true });
    }
  }

  // 3. FALLBACK GREETING: /start (without token) or /help
  await sendTelegramMessage(`
👋 Namaste <b>${escapeHtml(senderName)}</b>,

Welcome to <b>Ruparel Attendance ERP Academy Bot</b>.

This bot sends official daily attendance roll call alerts to verified parents.

👉 <b>How to connect your account:</b>
1. Open the personal invitation link provided by Ruparel Academy (via WhatsApp or SMS).
2. Tap the link and press <b>START</b>.
3. Your Telegram account will be linked automatically.

Your Telegram Chat ID: <code>${chatId}</code>
(Share this Chat ID with the academy office if you need manual assistance)

<i>Type /status at any time to check your current registration status.</i>
`.trim());

  return res.status(200).json({ ok: true });
}
