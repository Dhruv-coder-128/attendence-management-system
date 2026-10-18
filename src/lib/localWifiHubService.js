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

export const DEFAULT_SCHOOL_PC_URL = 'http://192.168.0.104:5173';

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
 * Returns whether this device has previously been paired and registered
 */
export function isDevicePairedLocally() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(DEVICE_PAIRED_KEY) === 'true';
}

/**
 * Sets local paired status
 */
export function setDevicePairedLocally(paired) {
  if (typeof window === 'undefined') return;
  if (paired) {
    localStorage.setItem(DEVICE_PAIRED_KEY, 'true');
  } else {
    localStorage.removeItem(DEVICE_PAIRED_KEY);
  }
}

/**
 * Submits 6-digit OTP to PC Hub to pair this phone (1-time registration)
 */
export async function pairDeviceWithHub(hubUrl, otp) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const deviceId = getOrCreateDeviceId();
  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=pair_device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ device_id: deviceId, otp: String(otp).trim() }),
    });
    const data = await res.json();
    if (res.ok && data.registered) {
      if (data.token) setStoredHubToken(data.token);
      setDevicePairedLocally(true);
      return { ok: true, registered: true, message: 'Device successfully registered.' };
    }
    return { ok: false, error: data.error || 'Invalid OTP code. Please check PC screen.' };
  } catch (err) {
    return { ok: false, error: 'Cannot reach School PC to pair: ' + err.message };
  }
}

/**
 * Checks with the PC Hub if this device is already in the registered devices list
 */
export async function checkDeviceRegistration(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const deviceId = getOrCreateDeviceId();
  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=check_device&device_id=${encodeURIComponent(deviceId)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.registered) {
        setDevicePairedLocally(true);
        return true;
      }
    }
  } catch {}
  return isDevicePairedLocally();
}

/**
 * Tests connection with the School PC over local Wi-Fi.
 * Distinguishes 3 key physical states:
 * 1. 'wifi_disconnected': Phone Wi-Fi is toggled off / network offline.
 * 2. 'pc_unreachable': On network, but School PC HTTP hub is not responding.
 * 3. 'connected': School PC hub is alive and active.
 */
export async function checkHubConnection(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. Check if device network is completely offline
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      state: 'wifi_disconnected',
      url: targetUrl,
      error: 'Phone is offline. Please connect to the School Wi-Fi network.',
    };
  }

  // 2. Ping School PC Wi-Fi Hub
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
        // Automatically save detected pairing token if present
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

  return {
    ok: false,
    state: 'pc_unreachable',
    url: targetUrl,
    error: `Cannot reach School PC at ${targetUrl}. Make sure your PC is running the SMS EXE and phone is on the same Wi-Fi.`,
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
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const targetDate = date || new Date().toISOString().split('T')[0];
  const token = getStoredHubToken();

  let wifiSyncOk = false;
  let serverMessage = '';

  // 1. Try Local Wi-Fi Hub with pairing token
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
    } else if (res.status === 401) {
      return {
        ok: false,
        unauthorized: true,
        error: 'Pairing token expired or missing. Please re-scan the QR code on the School PC.',
      };
    }
  } catch (err) {
    console.warn('Wi-Fi hub sync error:', err.message);
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
