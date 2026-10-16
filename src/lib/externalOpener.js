/**
 * Safely opens an external URL (web, mailto, tel, whatsapp)
 * Works seamlessly in both standard browsers and Tauri Windows Desktop
 */
export async function openExternalLink(url) {
  if (!url) return;

  // 1. Try Tauri v2 plugin-opener if running inside Tauri
  if (typeof window !== 'undefined' && (window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (tauriErr) {
      console.warn('Tauri openUrl error, falling back to window.open:', tauriErr);
    }
  }

  // 2. Standard browser navigation / window.open
  try {
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = url;
    }
  } catch (err) {
    window.location.href = url;
  }
}

/**
 * Copies text to clipboard with legacy fallback
 */
export async function copyToClipboard(text) {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn('navigator.clipboard failed:', err);
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}
