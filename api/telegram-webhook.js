import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Telegram Bot Webhook
 * Handles /start <token> deep link from parents to link their Telegram chat ID.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Telegram Webhook Ready (POST expected).');
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
  const senderName = message.from.first_name || 'Guardian';

  // Check for deep link command: /start link_<parentId>
  if (text.startsWith('/start link_')) {
    const parentId = text.replace('/start link_', '').trim();

    if (supabaseUrl && supabaseKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Update public.parents with real Telegram Chat ID and mark verified
        const { data, error } = await supabase
          .from('parents')
          .update({
            telegram_chat_id: chatId,
            is_verified: true,
            preferred_notification_channel: 'telegram',
          })
          .eq('id', parentId)
          .select('full_name')
          .single();

        if (!error && data) {
          // Reply in Telegram
          if (botToken) {
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: `✅ *Registration Confirmed*\n\nWelcome ${data.full_name}! Your Telegram account has been securely linked to Ruparel Attendance ERP.\n\nYou will now receive real-time roll call notices when your ward's attendance is recorded.`,
                parse_mode: 'Markdown',
              }),
            });
          }
          return res.status(200).json({ ok: true, linked: true, parent: data.full_name });
        }
      } catch (err) {
        console.error('Webhook error updating parent:', err);
      }
    }
  }

  // Fallback greeting if parent just texts /start
  if (text === '/start' && botToken) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `👋 Hello ${senderName},\n\nWelcome to *Ruparel Attendance ERP Bot*.\n\nTo link your Telegram account to your student ward, please click the personalized linking link provided in your Academy admission letter or ERP parent portal.`,
        parse_mode: 'Markdown',
      }),
    });
  }

  return res.status(200).json({ ok: true });
}
