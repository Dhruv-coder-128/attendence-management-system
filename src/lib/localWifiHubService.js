/**
 * SMS — Student Management System
 * Client-Side Local Wi-Fi & Database Sync Service for Teacher Android App
 * 
 * Supports:
 * 1. High-speed local Wi-Fi sync directly to the School PC hub.
 * 2. Seamless Supabase Cloud database fallback if Wi-Fi port is blocked.
 * 3. Offline on-device queueing when completely disconnected.
 */

import { Capacitor } from '@capacitor/core';
import {
  CANONICAL_BATCHES,
  CANONICAL_STUDENTS,
  getBatchStudents,
  getBatchById,
} from '../data/canonicalSchoolData.js';

const HUB_URL_KEY = 'sms_teacher_hub_url';
const OFFLINE_QUEUE_KEY = 'sms_teacher_offline_queue';
export const DEFAULT_SCHOOL_PC_URL = 'http://192.168.0.104:5173';

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
      !window.location.origin.includes('localhost') &&
      !window.location.origin.includes('127.0.0.1')
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
 * Tests connection with the School PC over local Wi-Fi.
 * Distinguishes 3 key physical states:
 * 1. 'wifi_disconnected': Phone Wi-Fi is toggled off / network offline.
 * 2. 'pc_unreachable': On network, but School PC HTTP hub is not responding at the configured IP.
 * 3. 'connected': School PC hub is alive and active on port 5173.
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
  const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

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
    error: `Cannot reach School PC at ${targetUrl}. Make sure your PC is on and phone is on the same Wi-Fi.`,
  };
}

/**
 * Fetches cohort batches from School PC or canonical fallback
 */
export async function fetchBatchesFromHub(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2000) : null;
    const res = await fetch(`${targetUrl}/api/local-hub?action=batches`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.batches) && data.batches.length > 0) {
        return data.batches;
      }
    }
  } catch {}

  return CANONICAL_BATCHES;
}

/**
 * Fetches student roster for a batch from School PC or canonical fallback
 */
export async function fetchStudentsFromHub(batchId, hubUrl = null) {
  if (!batchId) return [];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2000) : null;
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
        return data.students;
      }
    }
  } catch {}

  return getBatchStudents(batchId);
}

/**
 * Fetches existing attendance records for a batch & date
 */
export async function fetchExistingAttendanceFromHub(batchId, date, hubUrl = null) {
  if (!batchId) return [];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2000) : null;
    const res = await fetch(
      `${targetUrl}/api/local-hub?action=attendance&batch_id=${encodeURIComponent(
        batchId
      )}&date=${encodeURIComponent(date)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller ? controller.signal : undefined,
      }
    );
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.records)) {
        return data.records;
      }
    }
  } catch {}

  return [];
}

/**
 * Submits roll call attendance to School PC or Supabase cloud
 */
export async function submitAttendanceToHub(batchId, date, records, hubUrl = null, extraMeta = {}) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const targetDate = date || new Date().toISOString().split('T')[0];
  const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

  // 1. Try Local Wi-Fi Hub
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 2500) : null;
    const res = await fetch(`${targetUrl}/api/local-hub?action=attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        action: 'attendance',
        batch_id: batchId,
        batch_code: extraMeta?.batch_code || batchId,
        batch_name: extraMeta?.batch_name || '',
        date: targetDate,
        records,
      }),
      signal: controller ? controller.signal : undefined,
    });
    if (timeout) clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return { ok: true, source: 'wifi', data };
    }
  } catch (err) {
    console.warn('Wi-Fi attendance submission failed, trying database fallback:', err);
  }

  // 2. Direct Supabase Cloud Save
  try {
    if (supabase) {
      const payloads = records.map((r) => ({
        student_id: r.student_id,
        batch_id: batchId,
        date: targetDate,
        session_name: 'Regular',
        status: r.status || 'Present',
        time_in: nowTime,
        remarks: r.remarks || 'Mobile roll call',
      }));

      const { data, error } = await supabase
        .from('attendance')
        .upsert(payloads, { onConflict: 'student_id,batch_id,date,session_name' })
        .select();

      if (!error) {
        return { ok: true, source: 'cloud', records: data || payloads };
      }
    }
  } catch (err) {
    console.warn('Supabase attendance save failed:', err);
  }

  // 3. Fallback: Queue locally on phone
  queueAttendanceOffline({ batch_id: batchId, date: targetDate, records });
  return { ok: false, queued: true };
}

/**
 * Offline storage queue
 */
export function queueAttendanceOffline(payload) {
  try {
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    queue.push({ ...payload, queued_at: new Date().toISOString() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
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

