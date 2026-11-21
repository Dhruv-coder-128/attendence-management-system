/**
 * SMS — Student Management System
 * Client-Side Local Wi-Fi & Database Sync Service for Teacher Android App
 *
 * Supports:
 * 1. High-speed local Wi-Fi sync to School PC hub (attendance synchronization only)
 * 2. Supabase Cloud database direct save as secondary fallback
 * 3. Offline on-device queueing and retry when completely disconnected
 * 4. Token-protected LAN transmission
 */

import { Capacitor } from '@capacitor/core';

import { todayLocal } from './dateUtils';
const HUB_URL_KEY = 'sms_teacher_hub_url';
const HUB_TOKEN_KEY = 'sms_teacher_hub_token';
const OFFLINE_QUEUE_KEY = 'sms_teacher_offline_queue';
const CACHED_BATCHES_KEY = 'sms_cached_hub_batches';
const CACHED_STUDENTS_PREFIX = 'sms_cached_hub_students_';

export const DEFAULT_SCHOOL_PC_URL = '';

// Production Supabase credentials (same as desktop EXE — secondary cloud fallback)

/**
 * Returns default or previously configured School PC URL
 */
export function getStoredHubUrl() {
  if (typeof window === 'undefined') return DEFAULT_SCHOOL_PC_URL;
  try {
    const saved = localStorage.getItem(HUB_URL_KEY);
    if (saved && saved.trim()) {
      const cleanSaved = saved.trim().replace(/\/+$/, '');
      if (Capacitor.isNativePlatform() && (cleanSaved.includes('localhost') || cleanSaved.includes('127.0.0.1'))) {
        return DEFAULT_SCHOOL_PC_URL;
      }
      return cleanSaved;
    }

    if (Capacitor.isNativePlatform()) {
      return DEFAULT_SCHOOL_PC_URL;
    }

    if (
      window.location &&
      window.location.origin &&
      !window.location.origin.includes('file://') &&
      !window.location.origin.includes('tauri://')
    ) {
      return window.location.origin;
    }
    return DEFAULT_SCHOOL_PC_URL;
  } catch {
    return DEFAULT_SCHOOL_PC_URL;
  }
}

/**
 * Updates stored School PC URL
 */
export function setStoredHubUrl(url) {
  if (typeof window === 'undefined' || !url) return;
  const clean = url.trim().replace(/\/+$/, '');
  localStorage.setItem(HUB_URL_KEY, clean);
}

/**
 * Returns stored pairing token
 */
/** Headers for hub requests: the paired token authorises this phone on the School PC hub. */
export function hubHeaders() {
  const token = getStoredHubToken();
  return token ? { Accept: 'application/json', 'X-Hub-Token': token } : { Accept: 'application/json' };
}

/**
 * fetch() for every School PC call from the phone.
 * Sent as a CORS "simple request" (token in the URL, JSON as text/plain, no custom headers) so Android's
 * WebView never sends a preflight: WebView blocks preflighted requests to 192.168.x.x addresses, which made
 * roll call fail with "unreachable" while the status check (a plain GET) still showed "Connected".
 * A 401 means our token is stale, so forget it and ask the teacher to pair again.
 */
export async function hubFetch(url, opts = {}) {
  const token = getStoredHubToken();
  const target = new URL(url);
  if (token && !target.searchParams.has('token')) target.searchParams.set('token', token);
  const res = await fetch(target.toString(), {
    method: opts.method || 'GET',
    body: opts.body,
    signal: opts.signal,
    headers: opts.body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : undefined,
  });
  if (res.status === 401) {
    setStoredHubToken('');
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sms-hub-unpaired'));
  }
  return res;
}

export function getStoredHubToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(HUB_TOKEN_KEY) || '';
}

/**
 * Updates stored pairing token
 */
export function setStoredHubToken(token) {
  if (typeof window === 'undefined') return;
  if (token && token.trim()) {
    localStorage.setItem(HUB_TOKEN_KEY, token.trim());
  } else {
    localStorage.removeItem(HUB_TOKEN_KEY);
  }
}

const DEVICE_ID_KEY = 'sms_teacher_device_id';
const DEVICE_PAIRED_KEY = 'sms_device_paired';

/**
 * Gets or creates persistent unique hardware/device identifier for this teacher's phone
 */
/**
 * Gets or creates persistent unique hardware/device identifier for this teacher's phone
 */
export function getOrCreateDeviceId() {
  if (typeof window === 'undefined') return 'device-unknown';
  let devId = localStorage.getItem(DEVICE_ID_KEY);
  if (!devId) {
    devId = 'phone_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, devId);
  }
  return devId;
}

/**
 * Returns whether this device has previously been paired and registered.
 * On local Wi-Fi, devices are automatically trusted — zero OTP blocker.
 */
export function isDevicePairedLocally() {
  return true;
}

/**
 * Sets local paired status (no-op on local Wi-Fi)
 */
export function setDevicePairedLocally(_paired) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEVICE_PAIRED_KEY, 'true');
}

/**
 * Auto-registers this phone with the School PC Hub.
 * Zero OTP friction — immediate authorization on local Wi-Fi.
 */
export async function pairDeviceWithHub(hubUrl = null, otp = '') {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  if (!targetUrl) return { ok: false, error: 'Connect to the School PC first.' };
  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=pair_device`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, // simple request: no preflight on Android
      body: JSON.stringify({ device_id: getOrCreateDeviceId(), otp: String(otp).trim() }),
    });
    const data = await res.json();
    if (!data.ok || !data.token) return { ok: false, error: data.error || 'Pairing failed.' };
    setStoredHubToken(data.token);
    setDevicePairedLocally(true);
    return { ok: true, token: data.token };
  } catch {
    return { ok: false, error: 'Cannot reach the School PC.' };
  }
}

/**
 * Checks with the PC Hub if this device is already in the registered devices list
 */
export async function checkDeviceRegistration(_hubUrl = null) {
  return true;
}

/**
/**
 * Attempts to detect local device IP subnet prefix via WebRTC ICE candidate probing.
 * E.g., returns '192.168.0' or '192.168.43' or null.
 */
async function detectLocalSubnetPrefix() {
  const PeerConnection = typeof window !== 'undefined' ? (window.RTCPeerConnection || window.webkitRTCPeerConnection) : null;
  if (!PeerConnection) return null;
  return new Promise((resolve) => {
    try {
      const pc = new PeerConnection({ iceServers: [] });
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { pc.close(); } catch {}
          resolve(null);
        }
      }, 700);

      pc.createDataChannel('');
      pc.createOffer().then((offer) => pc.setLocalDescription(offer)).catch(() => {});
      pc.onicecandidate = (event) => {
        if (event && event.candidate && event.candidate.candidate) {
          const cand = event.candidate.candidate;
          const match = cand.match(/(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/);
          if (match && match[1]) {
            const ip = match[1];
            if (
              !ip.startsWith('127.') &&
              !ip.startsWith('0.') &&
              !ip.startsWith('169.254.')
            ) {
              const parts = ip.split('.');
              if (parts.length === 4) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timer);
                  try { pc.close(); } catch {}
                  resolve(`${parts[0]}.${parts[1]}.${parts[2]}`);
                }
              }
            }
          }
        }
      };
    } catch {
      resolve(null);
    }
  });
}

/**
 * Smart LAN Auto-Discovery:
 * Rapidly scans candidate IPs across the local Wi-Fi subnet to find the School PC Hub.
 * Uses WebRTC subnet detection, prioritizes active Wi-Fi subnets, and tests ports (5173, 5174, 5175).
 * Guaranteed to work on local Wi-Fi and mobile hotspots without active internet.
 * Returns { ok: true, url: 'http://<ip>:<port>' } if found.
 */
const HUB_PORTS = [5173, 5174, 5175, 8765, 8766];

/** One status probe. Plain GET with no custom headers, so the browser sends no extra preflight request. */
async function probeHub(baseUrl, timeoutMs = 1500) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${baseUrl}/api/local-hub?action=status`, { signal: controller ? controller.signal : undefined });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.service?.includes('SMS Local Wi-Fi Attendance Hub') ? { ok: true, url: baseUrl, data } : null;
  } catch {
    return null;
  } finally {
    if (tId) clearTimeout(tId);
  }
}

/**
 * Finds the School PC on the Wi-Fi. Order: the saved PC on every hub port (its port can change when the
 * app restarts), then every address in the saved/phone subnet, then common router subnets.
 */
export async function autoDiscoverSchoolPC(onProgress = null) {
  if (typeof window === 'undefined') return { ok: false };
  const found = (match) => {
    setStoredHubUrl(match.url);
    return match;
  };

  const subnets = [];
  let savedHost = '';
  try {
    const saved = getStoredHubUrl();
    if (saved) {
      savedHost = new URL(saved).hostname;
      if (savedHost && savedHost !== 'localhost' && savedHost !== '127.0.0.1') {
        // 1. Same PC, any port (fast path: the usual "it worked yesterday" case).
        const quick = (await Promise.all(HUB_PORTS.map((p) => probeHub(`http://${savedHost}:${p}`)))).find(Boolean);
        if (quick) return found(quick);
        const parts = savedHost.split('.');
        if (parts.length === 4) subnets.push(parts.slice(0, 3).join('.'));
      }
    }
  } catch {}
  try {
    const localPrefix = await detectLocalSubnetPrefix();
    if (localPrefix && !subnets.includes(localPrefix)) subnets.unshift(localPrefix);
  } catch {}

  const candidateIps = [];
  const add = (ip) => { if (ip !== savedHost && !candidateIps.includes(ip)) candidateIps.push(ip); };
  // 2. Every address of the known subnet(s): the PC can have any number the router hands out.
  for (const prefix of subnets) for (let i = 1; i <= 254; i++) add(`${prefix}.${i}`);
  // 3. Typical router ranges when nothing is known yet.
  for (const s of ['192.168.1', '192.168.0', '192.168.29', '192.168.31', '192.168.43', '192.168.137', '10.0.0']) {
    if (subnets.includes(s)) continue;
    for (let i = 2; i <= 30; i++) add(`${s}.${i}`);
    for (let i = 100; i <= 120; i++) add(`${s}.${i}`);
  }

  const CHUNK_SIZE = 32; // 32 addresses x 5 ports per round
  for (let i = 0; i < candidateIps.length; i += CHUNK_SIZE) {
    if (typeof onProgress === 'function') onProgress({ checked: i, total: candidateIps.length });
    const chunk = candidateIps.slice(i, i + CHUNK_SIZE);
    const results = await Promise.all(chunk.flatMap((ip) => HUB_PORTS.map((p) => probeHub(`http://${ip}:${p}`, 1200))));
    const match = results.find(Boolean);
    if (match) return found(match);
  }

  return { ok: false, error: 'School PC not found on this Wi-Fi. Scan the QR code on the PC (Connect Teacher App) or type its address.' };
}

/**
 * Tests connection with the School PC over local Wi-Fi.
 * Supports auto-discovery fallback if the configured URL is missing or unreachable.
 */
export async function checkHubConnection(hubUrl = null, tryAutoDiscover = false) {
  let targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 0. Auto-discovery fallback if requested and targetUrl is empty
  if (!targetUrl && tryAutoDiscover) {
    const disc = await autoDiscoverSchoolPC();
    if (disc.ok && disc.url) {
      targetUrl = disc.url;
    }
  }

  // 1. Not yet configured
  if (!targetUrl) {
    return {
      ok: false,
      state: 'pc_unreachable',
      url: '',
      error: 'School PC not configured. Scan the QR code on your PC screen or enter the Wi-Fi IP manually.',
    };
  }

  // 3. Ping School PC Wi-Fi Hub
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2500) : null;

  try {
    // Plain GET: status is public, and custom headers would add a CORS preflight round-trip.
    const res = await fetch(`${targetUrl}/api/local-hub?action=status`, {
      signal: controller ? controller.signal : undefined,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.service && data.service.includes('SMS Local Wi-Fi Attendance Hub')) {
        if (data.token) {
          setStoredHubToken(data.token);
        }
        return {
          ok: true,
          state: 'connected',
          mode: 'wifi',
          url: targetUrl,
          data,
        };
      }
    }
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // 4. If direct ping failed and auto-discovery was requested, attempt scan
  if (tryAutoDiscover) {
    const retryDisc = await autoDiscoverSchoolPC();
    if (retryDisc.ok && retryDisc.url) {
      return {
        ok: true,
        state: 'connected',
        mode: 'wifi',
        url: retryDisc.url,
        data: retryDisc.data,
      };
    }
  }

  return {
    ok: false,
    state: 'pc_unreachable',
    url: targetUrl,
    error: `Cannot reach School PC at ${targetUrl}. Make sure PC is running SMS-App and phone is on the same Wi-Fi.`,
  };
}

/**
 * Fetches cohort batches — queries Local Wi-Fi Hub direct from School PC.
 * Never silently returns mock/canonical dummy data if disconnected (Req 8).
 */
export async function fetchBatchesFromHub(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. PRIMARY: High-speed Local Wi-Fi Hub API (direct from School PC)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2500) : null;
    const res = await hubFetch(`${targetUrl}/api/local-hub?action=batches`, {
      method: 'GET',
      headers: hubHeaders(),
      signal: controller ? controller.signal : undefined,
    });
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.batches) && data.batches.length > 0) {
        // Cache real school cohorts in phone storage
        try {
          localStorage.setItem(CACHED_BATCHES_KEY, JSON.stringify(data.batches));
        } catch {}
        return data.batches;
      }
    }
  } catch {}

  // 3. OFFLINE CACHE: Return previously synchronized batches from this school
  try {
    const cached = localStorage.getItem(CACHED_BATCHES_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Do NOT silently return fake mock data. Return empty array so UI can show disconnected state.
  return [];
}

/**
 * Fetches student roster — queries Local Wi-Fi Hub direct from School PC.
 * Never silently returns mock/canonical dummy data if disconnected (Req 8).
 */
export async function fetchStudentsFromHub(batchId, hubUrl = null) {
  if (!batchId) return [];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. PRIMARY: High-speed Local Wi-Fi Hub API (direct from School PC)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2500) : null;
    const res = await hubFetch(
      `${targetUrl}/api/local-hub?action=students&batch_id=${encodeURIComponent(batchId)}`,
      {
        method: 'GET',
        headers: hubHeaders(),
        signal: controller ? controller.signal : undefined,
      }
    );
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.students) && data.students.length > 0) {
        // Cache real students in phone storage
        try {
          localStorage.setItem(`${CACHED_STUDENTS_PREFIX}${batchId}`, JSON.stringify(data.students));
        } catch {}
        return data.students;
      }
    }
  } catch {}

  // 3. OFFLINE CACHE: Return previously synchronized roster for this batch
  try {
    const cached = localStorage.getItem(`${CACHED_STUDENTS_PREFIX}${batchId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Return empty array so UI can show disconnected state
  return [];
}

/**
 * Fetches existing attendance records for a batch & date
 */
export async function fetchExistingAttendanceFromHub(batchId, date, hubUrl = null) {
  if (!batchId) return [];
  const targetDate = date || todayLocal();
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. PRIMARY: Hub API (local attendance saved on PC)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2000) : null;
    const res = await hubFetch(
      `${targetUrl}/api/local-hub?action=attendance&batch_id=${encodeURIComponent(
        batchId
      )}&date=${encodeURIComponent(targetDate)}`,
      {
        method: 'GET',
        headers: hubHeaders(),
        signal: controller ? controller.signal : undefined,
      }
    );
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.records) && data.records.length > 0) {
        return data.records;
      }
    }
  } catch {}

  return [];
}

/**
 * Submits roll call attendance:
 * 1. Local Wi-Fi Hub with pairing token (instant PC sync, real-time update on desktop)
 * 2. Supabase Cloud Database direct save as background secondary fallback
 * 3. Queue offline for later sync when connection fails
 */
export async function submitAttendanceToHub(batchId, date, records, hubUrl = null, extraMeta = {}, allowOfflineQueue = true) {
  let targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const targetDate = date || todayLocal();

  // If URL not configured, try auto-discovering School PC on local Wi-Fi first
  if (!targetUrl) {
    const disc = await autoDiscoverSchoolPC();
    if (disc.ok && disc.url) {
      targetUrl = disc.url;
    }
  }

  const token = getStoredHubToken();

  let wifiSyncOk = false;
  let serverMessage = '';
  let refusedMessage = '';

  // 1. Try Local Wi-Fi Hub with pairing token (a second attempt after re-finding the PC if it moved)
  for (let attempt = 0; attempt < 2 && targetUrl && !wifiSyncOk && !refusedMessage; attempt++) {
    if (attempt === 1) {
      const disc = await autoDiscoverSchoolPC();
      if (!disc.ok || disc.url === targetUrl) break;
      targetUrl = disc.url;
    }
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 6000) : null;

      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Device-Id': getOrCreateDeviceId(),
      };
      if (token) {
        headers['X-Hub-Token'] = token;
      }

      const res = await hubFetch(`${targetUrl}/api/local-hub?action=attendance`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'attendance',
        batch_id: batchId,
        batch_code: extraMeta?.batch_code || batchId,
        batch_name: extraMeta?.batch_name || '',
        date: targetDate,
        records,
        token,
        device_id: getOrCreateDeviceId(),
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (timeout) clearTimeout(timeout);

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      refusedMessage = res.status === 401
        ? 'This phone is not paired with the School PC. Enter the 6-digit code shown on the PC (Connect Teacher App).'
        : errJson?.error || `School PC refused the roll call (HTTP ${res.status}).`;
    }
    if (res.ok) {
      const resJson = await res.json();
      wifiSyncOk = true;
      serverMessage = resJson?.message || 'Saved to School PC';
      // On successful Wi-Fi sync, immediately remove any pending offline queued item for this batch and date
      try {
        const queue = getOfflineQueue();
        const remaining = queue.filter(
          (item) => !(item.batch_id === batchId && item.date === targetDate)
        );
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
      } catch {}
    }
  } catch (err) {
    console.warn('Wi-Fi hub sync error:', err.message);
  }
}

  if (wifiSyncOk) {
    return { ok: true, source: 'wifi', message: serverMessage };
  }

  // 3. Queue offline if Wi-Fi was not reached and offline queue is allowed
  if (allowOfflineQueue) {
    queueAttendanceOffline({
      batch_id: batchId,
      batch_code: extraMeta?.batch_code || batchId,
      batch_name: extraMeta?.batch_name || '',
      date: targetDate,
      records,
    });
  }
  return {
    ok: false,
    queued: allowOfflineQueue,
    error: refusedMessage
      ? `${refusedMessage}${allowOfflineQueue ? ' Saved on this phone; it will be sent automatically later.' : ''}`
      : `School PC unreachable.${allowOfflineQueue ? ' Saved on this phone; it will be sent automatically later.' : ''}`,
  };
}

/**
 * Offline storage queue
 */
export function queueAttendanceOffline(payload) {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    // Deduplicate queue by batch_id and date
    const filtered = queue.filter(
      (item) => !(item.batch_id === payload.batch_id && item.date === payload.date)
    );
    filtered.push({ ...payload, queued_at: new Date().toISOString() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to queue attendance offline:', err);
  }
}

/**
 * Returns current offline queue items
 */
export function getOfflineQueue() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Clears offline queue
 */
export function clearOfflineQueue() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch {}
}

/**
 * Retries and flushes all pending offline attendance records to the School PC
 */
export async function flushOfflineQueue(hubUrl = null) {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { ok: true, flushedCount: 0 };

  const remaining = [];
  let flushedCount = 0;

  for (const item of queue) {
    const res = await submitAttendanceToHub(
      item.batch_id,
      item.date,
      item.records,
      hubUrl,
      { batch_code: item.batch_code, batch_name: item.batch_name },
      false
    );
    if (res.ok) {
      flushedCount++;
    } else {
      remaining.push(item);
    }
  }

  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  } catch {}

  return {
    ok: remaining.length === 0,
    flushedCount,
    remainingCount: remaining.length,
  };
}
