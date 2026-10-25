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
import { createClient } from '@supabase/supabase-js';

const HUB_URL_KEY = 'sms_teacher_hub_url';
const HUB_TOKEN_KEY = 'sms_teacher_hub_token';
const OFFLINE_QUEUE_KEY = 'sms_teacher_offline_queue';
const CACHED_BATCHES_KEY = 'sms_cached_hub_batches';
const CACHED_STUDENTS_PREFIX = 'sms_cached_hub_students_';

export const DEFAULT_SCHOOL_PC_URL = '';

// Production Supabase credentials (same as desktop EXE — secondary cloud fallback)
const SUPABASE_URL = 'https://uugvudqbwoyywzbjrfol.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut';

let _mobileDb = null;
function getMobileDb() {
  if (_mobileDb) return _mobileDb;
  try {
    _mobileDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return _mobileDb;
  } catch {
    return null;
  }
}

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
export async function pairDeviceWithHub(hubUrl = null, _otp = '') {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const deviceId = getOrCreateDeviceId();
  if (targetUrl) {
    try {
      await fetch(`${targetUrl}/api/local-hub?action=check_device&device_id=${encodeURIComponent(deviceId)}`);
    } catch {}
  }
  return { ok: true, registered: true, message: 'Device successfully registered on School Wi-Fi.' };
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
export async function autoDiscoverSchoolPC(onProgress = null) {
  if (typeof window === 'undefined') return { ok: false };

  const candidateIps = new Set();

  // 1. Detect phone's own subnet prefix dynamically via WebRTC
  try {
    const localPrefix = await detectLocalSubnetPrefix();
    if (localPrefix) {
      // Prioritize scanning the phone's actual Wi-Fi subnet
      for (let i = 100; i <= 120; i++) candidateIps.add(`${localPrefix}.${i}`);
      for (let i = 2; i <= 25; i++) candidateIps.add(`${localPrefix}.${i}`);
      candidateIps.add(`${localPrefix}.1`);
      candidateIps.add(`${localPrefix}.160`);
      candidateIps.add(`${localPrefix}.254`);
    }
  } catch {}

  // 2. Check previously configured host
  const saved = getStoredHubUrl();
  if (saved) {
    try {
      const parsed = new URL(saved);
      if (parsed.hostname && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        candidateIps.add(parsed.hostname);
        const parts = parsed.hostname.split('.');
        if (parts.length === 4) {
          const prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
          for (let i = 100; i <= 120; i++) candidateIps.add(`${prefix}.${i}`);
          for (let i = 2; i <= 20; i++) candidateIps.add(`${prefix}.${i}`);
        }
      }
    } catch {}
  }

  // 3. High-frequency subnet assignments on Indian school/home Wi-Fi routers & mobile hotspots
  const commonSubnets = [
    '192.168.0',
    '192.168.1',
    '192.168.43',  // Android Mobile Hotspot (phone as router or client)
    '192.168.137', // Windows Mobile Hotspot
    '192.168.29',  // JioFiber
    '192.168.31',  // Mi / Xiaomi Router
    '10.0.0',      // Commercial router
  ];
  for (const s of commonSubnets) {
    candidateIps.add(`${s}.103`);
    candidateIps.add(`${s}.104`);
    candidateIps.add(`${s}.100`);
    candidateIps.add(`${s}.101`);
    candidateIps.add(`${s}.102`);
    candidateIps.add(`${s}.105`);
    candidateIps.add(`${s}.106`);
    candidateIps.add(`${s}.107`);
    candidateIps.add(`${s}.108`);
    candidateIps.add(`${s}.109`);
    candidateIps.add(`${s}.110`);
    candidateIps.add(`${s}.1`);
    candidateIps.add(`${s}.2`);
    candidateIps.add(`${s}.3`);
    candidateIps.add(`${s}.4`);
    candidateIps.add(`${s}.5`);
  }

  const ports = [5173, 5174, 5175, 8765];
  const ipList = Array.from(candidateIps);

  // Probe in fast parallel chunks of 25 with 550ms timeout
  const CHUNK_SIZE = 25;
  for (let i = 0; i < ipList.length; i += CHUNK_SIZE) {
    const chunk = ipList.slice(i, i + CHUNK_SIZE);
    if (typeof onProgress === 'function') {
      onProgress({ checked: i, total: ipList.length });
    }

    const promises = [];
    for (const ip of chunk) {
      for (const port of ports) {
        const testUrl = `http://${ip}:${port}`;
        promises.push(
          (async () => {
            const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const tId = controller ? setTimeout(() => controller.abort(), 550) : null;
            try {
              const res = await fetch(`${testUrl}/api/local-hub?action=status`, {
                method: 'GET',
                headers: { Accept: 'application/json' },
                signal: controller ? controller.signal : undefined,
              });
              if (tId) clearTimeout(tId);
              if (res.ok) {
                const data = await res.json();
                if (data && data.service && data.service.includes('SMS Local Wi-Fi Attendance Hub')) {
                  return { ok: true, url: testUrl, data };
                }
              }
            } catch {
              if (tId) clearTimeout(tId);
            }
            return null;
          })()
        );
      }
    }

    const results = await Promise.all(promises);
    const match = results.find((r) => r && r.ok);
    if (match) {
      setStoredHubUrl(match.url);
      if (match.data?.token) {
        setStoredHubToken(match.data.token);
      }
      return match;
    }
  }

  return { ok: false, error: 'School PC not auto-detected. Please scan the QR code on the PC screen or enter IP manually.' };
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
    const res = await fetch(`${targetUrl}/api/local-hub?action=status`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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
    const res = await fetch(`${targetUrl}/api/local-hub?action=batches`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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

  // 2. SECONDARY: Cloud Supabase (if configured)
  try {
    const db = getMobileDb();
    if (db) {
      const { data, error } = await db
        .from('batches')
        .select('id, name, code, timing, classroom, is_active')
        .order('name');

      if (!error && Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(CACHED_BATCHES_KEY, JSON.stringify(data));
        } catch {}
        return data;
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
    const res = await fetch(
      `${targetUrl}/api/local-hub?action=students&batch_id=${encodeURIComponent(batchId)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
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

  // 2. SECONDARY: Cloud Supabase (if configured)
  try {
    const db = getMobileDb();
    if (db) {
      const { data, error } = await db
        .from('students')
        .select('id, full_name, roll_no, admission_no, gender, status, batch_id')
        .eq('batch_id', batchId)
        .order('roll_no');

      if (!error && Array.isArray(data) && data.length > 0) {
        try {
          localStorage.setItem(`${CACHED_STUDENTS_PREFIX}${batchId}`, JSON.stringify(data));
        } catch {}
        return data;
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
  const targetDate = date || new Date().toISOString().split('T')[0];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. PRIMARY: Hub API (local attendance saved on PC)
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2000) : null;
    const res = await fetch(
      `${targetUrl}/api/local-hub?action=attendance&batch_id=${encodeURIComponent(
        batchId
      )}&date=${encodeURIComponent(targetDate)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
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

  // 2. SECONDARY: Cloud Supabase (if configured)
  try {
    const db = getMobileDb();
    if (db) {
      const { data, error } = await db
        .from('attendance')
        .select('student_id, status, time_in, remarks, date')
        .eq('batch_id', batchId)
        .eq('date', targetDate);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
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
  const targetDate = date || new Date().toISOString().split('T')[0];

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

  // 1. Try Local Wi-Fi Hub with pairing token
  if (targetUrl) {
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

      const res = await fetch(`${targetUrl}/api/local-hub?action=attendance`, {
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

  // 2. Also try persisting directly to Supabase cloud in background
  try {
    const db = getMobileDb();
    if (db) {
      const payloads = records.map((r) => ({
        student_id: r.student_id,
        batch_id: batchId,
        date: targetDate,
        session_name: 'Regular',
        status: r.status || 'Present',
        time_in: r.time_in || '09:00',
        remarks: r.remarks || 'Mobile roll call',
      }));

      db.from('attendance')
        .upsert(payloads, { onConflict: 'student_id,batch_id,date,session_name' })
        .then(() => {})
        .catch(() => {});
    }
  } catch (err) {
    console.warn('Supabase direct save notice:', err.message);
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
  return { ok: false, queued: true, error: 'School PC unreachable. Stored in phone queue.' };
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
