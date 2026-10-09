/**
 * Vercel Serverless Function — Telegram Webhook Configuration
 * Calls Telegram Bot API setWebhook or deleteWebhook with secret validation.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({
      ok: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in server environment variables.',
    });
  }

  const { webhookUrl, action = 'set' } = req.body || {};

  try {
    if (action === 'delete') {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`, {
        method: 'POST',
      });
      const data = await response.json();
      return res.status(200).json(data);
    }

    if (!webhookUrl || !webhookUrl.startsWith('https://')) {
      return res.status(400).json({
        ok: false,
        error: 'A valid HTTPS Webhook URL is required (e.g., https://your-app.vercel.app/api/telegram-webhook).',
      });
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || 'Failed to update webhook on Telegram Bot API.',
    });
  }
}
