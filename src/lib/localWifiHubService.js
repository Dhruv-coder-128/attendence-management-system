/**
 * SMS — Student Management System
 * Client-Side Local Wi-Fi Hub Service for Teacher Android App
 * 
 * Communicates directly with the School PC over local Wi-Fi router.
 * Zero-cloud, real-time student fetching and roll call sync.
 */

import { Capacitor } from '@capacitor/core';

const HUB_URL_KEY = 'sms_teacher_hub_url';
const OFFLINE_QUEUE_KEY = 'sms_teacher_offline_queue';
export const DEFAULT_SCHOOL_PC_URL = 'http://10.102.139.146:5173';

/**
 * Returns default or previously configured School PC URL
 */
export function getStoredHubUrl() {
  if (typeof window === 'undefined') return DEFAULT_SCHOOL_PC_URL;
  try {
    const saved = localStorage.getItem(HUB_URL_KEY);
    if (saved && saved.trim()) {
      const cleanSaved = saved.trim().replace(/\/+$/, '');
      // If running inside Capacitor APK on Android, localhost refers to the phone, not PC!
      if (Capacitor.isNativePlatform() && (cleanSaved.includes('localhost') || cleanSaved.includes('127.0.0.1'))) {
        return DEFAULT_SCHOOL_PC_URL;
      }
      return cleanSaved;
    }

    // In Capacitor native mobile app, webview origin is http://localhost
    if (Capacitor.isNativePlatform()) {
      return DEFAULT_SCHOOL_PC_URL;
    }

    // If running in browser over Wi-Fi on phone (not localhost/file)
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
 * Tests connection with the School PC over Wi-Fi
 */
export async function checkHubConnection(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), 4000) : null;

  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=status`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller ? controller.signal : undefined,
    });
    if (timeoutId) clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      return { ok: true, url: targetUrl, data };
    }
    return { ok: false, url: targetUrl, error: `HTTP ${res.status}: ${res.statusText}` };
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    return { ok: false, url: targetUrl, error: err.name === 'AbortError' ? 'Connection timed out' : (err.message || 'Unable to reach School PC') };
  }
}

/**
 * Fetches cohort batches from School PC
 */
export async function fetchBatchesFromHub(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=batches`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      return data.batches || [];
    }
  } catch (err) {
    console.warn('Failed to fetch batches from PC:', err);
  }
  return [];
}

/**
 * Fetches real-time student list for a batch from School PC
 */
export async function fetchStudentsFromHub(batchId, hubUrl = null) {
  if (!batchId) return [];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=students&batch_id=${encodeURIComponent(batchId)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      return data.students || [];
    }
  } catch (err) {
    console.warn('Failed to fetch students from PC:', err);
  }
  return [];
}

/**
 * Submits roll call attendance from phone directly to School PC database
 */
export async function submitAttendanceToHub(batchId, date, records, hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
  const payload = {
    action: 'attendance',
    batch_id: batchId,
    date: date || new Date().toISOString().split('T')[0],
    records,
  };

  try {
    const res = await fetch(`${targetUrl}/api/local-hub?action=attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
    const errData = await res.json().catch(() => ({}));
    return { ok: false, error: errData.error || `HTTP ${res.status}` };
  } catch (err) {
    // Queue offline if network blipped
    queueAttendanceOffline(payload);
    return {
      ok: false,
      queued: true,
      error: 'Wi-Fi connection lost. Attendance has been saved locally on phone and will sync when reconnected.',
    };
  }
}

function queueAttendanceOffline(payload) {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    current.push({ ...payload, queuedAt: new Date().toISOString() });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(current));
  } catch {}
}

export function getOfflineQueue() {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearOfflineQueue() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(OFFLINE_QUEUE_KEY);
}
