/**
 * Vercel Serverless Function — Telegram Bot & Webhook Status Inspector
 * Queries official Telegram Bot API (getMe & getWebhookInfo) without exposing token.
 */

export default async function handler(req, res) {
  const rawToken = process.env.TELEGRAM_BOT_TOKEN;
  const botToken = rawToken ? String(rawToken).trim().replace(/^["']|["']$/g, '') : '';

  if (!botToken) {
    return res.status(200).json({
      ok: false,
      configured: false,
      valid: false,
      error: 'TELEGRAM_BOT_TOKEN is not configured in server environment variables.',
    });
  }

  try {
    const [meRes, webhookRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`).then((r) => r.json()),
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`).then((r) => r.json()),
    ]);

    if (!meRes.ok) {
      return res.status(200).json({
        ok: false,
        configured: true,
        valid: false,
        error: meRes.description || 'Invalid Telegram Bot Token.',
      });
    }

    const botInfo = meRes.result;
    const webhookInfo = webhookRes.result || {};

    return res.status(200).json({
      ok: true,
      configured: true,
      valid: true,
      bot: {
        id: botInfo.id,
        firstName: botInfo.first_name,
        first_name: botInfo.first_name,
        username: botInfo.username,
        canJoinGroups: botInfo.can_join_groups,
      },
      webhook: {
        url: webhookInfo.url || '',
        hasCustomCertificate: webhookInfo.has_custom_certificate,
        has_custom_certificate: webhookInfo.has_custom_certificate,
        pendingUpdateCount: webhookInfo.pending_update_count || 0,
        pending_update_count: webhookInfo.pending_update_count || 0,
        lastErrorDate: webhookInfo.last_error_date
          ? new Date(webhookInfo.last_error_date * 1000).toISOString()
          : null,
        lastErrorMessage: webhookInfo.last_error_message || null,
        maxConnections: webhookInfo.max_connections,
      },
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      configured: true,
      valid: false,
      error: err.message || 'Failed to inspect Telegram Bot API.',
    });
  }
}
