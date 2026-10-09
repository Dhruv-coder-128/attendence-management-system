/**
 * Vercel Serverless Function — Telegram Attendance Alert Dispatcher
 * Securely reads TELEGRAM_BOT_TOKEN from server environment variables.
 * Dispatches roll call notifications ONLY to verified parents.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in Vercel environment variables.',
    });
  }

  const { studentName, admissionNo, batchName, date, status, chatId, parentName } = req.body;

  if (!chatId) {
    return res.status(400).json({
      ok: false,
      error: 'Missing telegram chatId. Notifications can only be dispatched to verified parents.',
    });
  }

  const statusEmoji = status === 'Present' ? '✅' : status === 'Absent' ? '🚨' : status === 'Late' ? '⚠️' : 'ℹ️';

  const messageText = `
${statusEmoji} *Ruparel Attendance ERP — Academic Alert*

Dear ${parentName || 'Guardian'},
Your ward *${studentName}* (Adm No: \`${admissionNo}\`) has been marked *${status.toUpperCase()}* for today's session.

📅 *Date:* ${date}
🏫 *Cohort:* ${batchName || 'Regular Session'}
⏱️ *Time Logged:* ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}

_This is an official automated alert from Ruparel Attendance Management System._
`.trim();

  try {
    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: 'Markdown',
      }),
    });

    const tgData = await tgResponse.json();

    if (!tgResponse.ok || !tgData.ok) {
      return res.status(400).json({
        ok: false,
        error: tgData.description || 'Telegram Bot API rejected message dispatch.',
      });
    }

    return res.status(200).json({
      ok: true,
      messageId: tgData.result?.message_id,
      chatId,
      dispatchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Telegram dispatch error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Internal network error communicating with Telegram Bot API.',
    });
  }
}
