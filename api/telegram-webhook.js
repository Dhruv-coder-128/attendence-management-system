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

export default async function handler(req, res) {
  // Telegram sends POST requests with update object
  if (req.method !== 'POST') {
    return res.status(200).send('Ruparel Attendance ERP Telegram Webhook Active (POST expected).');
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const update = req.body;
  if (!update || !update.message) {
    return res.status(200).json({ ok: true });
  }

  const message = update.message;
  const text = (message.text || '').trim();
  const chatId = String(message.chat.id);
  const senderName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || 'Guardian';

  // Helper to send Telegram message
  async function sendTelegramMessage(textToSend) {
    if (!botToken) return;
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: textToSend,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.error('Failed to send Telegram message:', err.message);
    }
  }

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration in serverless environment.');
    await sendTelegramMessage('⚠️ *Configuration Error*: Database connection is temporarily unavailable. Please try again shortly.');
    return res.status(200).json({ ok: false, error: 'Database unconfigured' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse command & deep link parameter
  // Telegram sends: "/start <parameter>" or "/start"
  const tokens = text.split(/\s+/);
  const command = tokens[0].toLowerCase();
  const param = tokens[1] ? tokens[1].trim() : '';

  // 1. HANDLE DEEP LINK INVITATION TOKEN: /start <token>
  if (command === '/start' && param) {
    try {
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
              await sendTelegramMessage('⚠️ *Invitation Link Expired*\n\nThis linking link has expired (links are valid for 7 days). Please contact Ruparel Academy administration to receive a fresh invitation link.');
              return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
            } else if (rpcRes.error_code === 'ALREADY_LINKED') {
              await sendTelegramMessage('ℹ️ *Link Already Used*\n\nThis invitation token has already been used and cannot be reused. Your account may already be linked.');
              return res.status(200).json({ ok: true, linked: false, reason: 'already_used' });
            } else {
              await sendTelegramMessage('❌ *Invalid Invitation Link*\n\nThis invitation link was not recognized. Please make sure you clicked the full link provided by Ruparel Academy.');
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
        const { data: invData } = await supabase
          .from('parent_invitations')
          .select('*, parents:parent_id ( id, full_name )')
          .eq('token', param)
          .maybeSingle();

        if (invData) {
          invitation = invData;
        }

        // 2. Check parents table fallback
        let parentRecord = null;
        if (invitation) {
          parentRecord = invitation.parents;
          // Check expiration
          if (new Date(invitation.expires_at) < new Date()) {
            await supabase.from('parent_invitations').update({ linking_status: 'expired' }).eq('id', invitation.id);
            await sendTelegramMessage('⚠️ *Invitation Link Expired*\n\nThis linking link has expired. Please contact Ruparel Academy administration to receive a fresh invitation link.');
            return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
          }
          // Check reuse
          if (invitation.linking_status === 'linked') {
            await sendTelegramMessage('ℹ️ *Link Already Used*\n\nThis invitation link has already been used.');
            return res.status(200).json({ ok: true, linked: false, reason: 'already_linked' });
          }
        } else {
          // Check fallback on parents table (linking_token or legacy link_<id>)
          const cleanParentId = param.startsWith('link_') ? param.replace('link_', '') : null;
          let pQuery = supabase.from('parents').select('id, full_name, linking_token, linking_token_expires_at');
          if (cleanParentId) {
            pQuery = pQuery.eq('id', cleanParentId);
          } else {
            pQuery = pQuery.eq('linking_token', param);
          }
          const { data: pData } = await pQuery.maybeSingle();
          if (pData) {
            parentRecord = pData;
            if (pData.linking_token_expires_at && new Date(pData.linking_token_expires_at) < new Date()) {
              await sendTelegramMessage('⚠️ *Invitation Link Expired*\n\nThis invitation link has expired. Please request a new invitation link.');
              return res.status(200).json({ ok: true, linked: false, reason: 'expired' });
            }
          }
        }

        if (!parentRecord) {
          await sendTelegramMessage('❌ *Invalid Invitation Link*\n\nThis invitation link was not recognized. Please ensure you clicked the full link provided by Ruparel Academy.');
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
          await supabase
            .from('parent_invitations')
            .update({
              linking_status: 'linked',
              invitation_status: 'delivered',
              linked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', invitation.id);
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
          const b = s.batches ? `(${s.batches.code})` : '';
          return `• *${s.full_name}* — Adm No: \`${s.admission_no}\` ${b}`;
        })
        .filter(Boolean);

      const wardsSection = wards.length > 0
        ? `\n👥 *Registered Student Ward(s):*\n${wards.join('\n')}\n`
        : '\n';

      // Send confirmation message to parent
      const welcomeMessage = `
✅ *Registration Confirmed!*

Namaste *${linkedParent.full_name}*,
Your Telegram account has been securely linked to *Ruparel Attendance ERP*.
${wardsSection}
🔔 *What happens next?*
Whenever daily roll call attendance is logged for your child, you will receive real-time notices directly in this Telegram chat.

_Ruparel Attendance ERP — Official Communications System_
`.trim();

      await sendTelegramMessage(welcomeMessage);
      return res.status(200).json({ ok: true, linked: true, parent: linkedParent.full_name, chatId });
    } catch (err) {
      console.error('Webhook linking exception:', err);
      await sendTelegramMessage('⚠️ *Linking Error*: An error occurred while registering your account. Please try again or contact the academy office.');
      return res.status(200).json({ ok: false, error: err.message });
    }
  }

  // 2. HANDLE STATUS CHECK: /status
  if (command === '/status') {
    try {
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
        const p = linkedParents[0];
        const wards = (p.parent_students || [])
          .map((ps) => ps.students ? `• *${ps.students.full_name}* (${ps.students.batches?.code || 'Cohort'})` : null)
          .filter(Boolean);

        await sendTelegramMessage(`
✅ *Account Status: Active & Linked*

Guardian: *${p.full_name}*
Chat ID: \`${chatId}\`

${wards.length > 0 ? `Registered Wards:\n${wards.join('\n')}\n\n` : ''}You are set to receive real-time roll call notices.
`.trim());
      } else {
        await sendTelegramMessage(`
ℹ️ *Account Status: Unlinked*

This Telegram chat (\`${chatId}\`) is not currently connected to any student ward in Ruparel Attendance ERP.

Please click the personalized linking link provided in your academy invitation message.
`.trim());
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Status check error:', err);
    }
  }

  // 3. FALLBACK GREETING: /start (without token) or /help
  await sendTelegramMessage(`
👋 Namaste ${senderName},

Welcome to *Ruparel Attendance ERP Academy Bot*.

This bot sends official daily attendance roll call alerts to verified parents.

👉 *How to connect your account:*
1. Request a personal invitation link from the Ruparel Academy administration or click the link received via WhatsApp/SMS.
2. Tap the link and press *START*.
3. Your Telegram account will be linked automatically.

Type /status at any time to check your current registration status.
`.trim());

  return res.status(200).json({ ok: true });
}
