/**
 * CORS helper - allowlist based, no wildcard.
 * Reads ALLOWED_ORIGINS env (comma separated) or defaults to production domains.
 */

const DEFAULT_ALLOWED = [
  'https://attendance-management-system-lovat.vercel.app',
  // Add your custom domains here via ALLOWED_ORIGINS env
];

function getAllowedOrigins() {
  const envList = (process.env.ALLOWED_ORIGINS || process.env.VITE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // Always include defaults + env
  const merged = [...new Set([...DEFAULT_ALLOWED, ...envList])];
  return merged;
}

export function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser (curl, server-to-server, Tauri, Capacitor)
  const allowed = getAllowedOrigins();
  // Allow localhost for dev
  if (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('tauri://') || origin.includes('capacitor://')) {
    return true;
  }
  return allowed.some((a) => origin === a || origin.endsWith(a.replace(/^https?:\/\//, '')));
}

export function applyCors(req, res) {
  const origin = req.headers.origin || req.headers.referer || '';
  // Set specific origin if allowed, otherwise don't set wildcard
  if (!origin) {
    // For non-browser requests, reflect no CORS needed but set for safety
    res.setHeader('Access-Control-Allow-Origin', DEFAULT_ALLOWED[0]);
  } else if (isOriginAllowed(origin)) {
    // Extract origin from referer if needed
    let originUrl = origin;
    try {
      if (origin.startsWith('http')) {
        originUrl = new URL(origin).origin;
      }
    } catch {}
    if (isOriginAllowed(originUrl)) {
      res.setHeader('Access-Control-Allow-Origin', originUrl);
    } else {
      // Try matching against parsed origin
      res.setHeader('Access-Control-Allow-Origin', DEFAULT_ALLOWED[0]);
    }
    res.setHeader('Vary', 'Origin');
  } else {
    // Not allowed - still respond but browser will block; API should also check
    res.setHeader('Access-Control-Allow-Origin', DEFAULT_ALLOWED[0]);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Hub-Token, X-School-Token, X-Device-Id, X-Hub-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
  return isOriginAllowed(origin) || !origin || origin.includes('localhost');
}

export function handleOptions(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

export default { applyCors, handleOptions, isOriginAllowed };
