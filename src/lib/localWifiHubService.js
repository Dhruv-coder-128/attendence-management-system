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
import { supabase } from './supabase.js';

const HUB_URL_KEY = 'sms_teacher_hub_url';
const OFFLINE_QUEUE_KEY = 'sms_teacher_offline_queue';
export const DEFAULT_SCHOOL_PC_URL = 'http://192.168.0.104:5173';

const DEFAULT_BATCHES = [
  { id: 'b_11th_com', name: 'B11 — 11th Commerce', code: '11-COM', timing: '08:00 AM – 10:30 AM', classroom: 'Room 101' },
  { id: 'b_bsy_sy', name: 'BSY — SY', code: 'BSY-SY', timing: '08:00 AM – 10:30 AM', classroom: 'Room 202' },
  { id: 'b_11th_sci', name: 'Grade 11 Science Morning', code: '11-SCI-A', timing: '07:30 AM – 10:30 AM', classroom: 'LH-1' },
  { id: 'b_12th_sci', name: 'Grade 12 Science Board & JEE', code: '12-SCI-A', timing: '07:30 AM – 11:00 AM', classroom: 'LH-2' },
];

const DEFAULT_STUDENTS = [
  { id: 'st_1001', batch_id: 'b_11th_com', full_name: 'Krishna Dave', roll_no: '1', admission_no: 'ST1001', gender: 'Female' },
  { id: 'st_1006', batch_id: 'b_11th_com', full_name: 'Ananya Joshi', roll_no: '6', admission_no: 'ST1006', gender: 'Female' },
  { id: 'st_1011', batch_id: 'b_11th_com', full_name: 'Meera Makwana', roll_no: '11', admission_no: 'ST1011', gender: 'Female' },
  { id: 'st_1016', batch_id: 'b_11th_com', full_name: 'Rohan Mehta', roll_no: '16', admission_no: 'ST1016', gender: 'Male' },
  { id: 'st_1021', batch_id: 'b_11th_com', full_name: 'Reyansh Thakkar', roll_no: '1', admission_no: 'ST1021', gender: 'Male' },
  { id: 'st_1026', batch_id: 'b_11th_com', full_name: 'Vihaan Trivedi', roll_no: '6', admission_no: 'ST1026', gender: 'Male' },
  { id: 'st_1031', batch_id: 'b_11th_com', full_name: 'Aarav Amin', roll_no: '11', admission_no: 'ST1031', gender: 'Male' },
  { id: 'st_1004', batch_id: 'b_bsy_sy', full_name: 'Yash Vora', roll_no: '4', admission_no: 'ST1004', gender: 'Male' },
  { id: 'st_1009', batch_id: 'b_bsy_sy', full_name: 'Pari Joshi', roll_no: '9', admission_no: 'ST1009', gender: 'Female' },
  { id: 'st_1014', batch_id: 'b_bsy_sy', full_name: 'Dev Thakkar', roll_no: '14', admission_no: 'ST1014', gender: 'Male' },
  { id: 'st_dhruv_1019', batch_id: 'b_bsy_sy', full_name: 'Dhruv Shah', roll_no: '19', admission_no: 'ST1019', gender: 'Male' },
  { id: 'st_1024', batch_id: 'b_bsy_sy', full_name: 'Neha Rathod', roll_no: '24', admission_no: 'ST1024', gender: 'Female' },
];

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
 * Tests connection with the School PC over Wi-Fi or Supabase cloud
 */
export async function checkHubConnection(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');
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
      return { ok: true, mode: 'wifi', url: targetUrl, data };
    }
  } catch {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // Fallback: Verify connection to Supabase database
  try {
    if (supabase) {
      const { error } = await supabase.from('batches').select('id').limit(1);
      if (!error) {
        return { ok: true, mode: 'cloud', url: 'Cloud Supabase' };
      }
    }
  } catch {}

  return { ok: false, mode: 'offline', url: targetUrl, error: 'Cannot reach School PC over Wi-Fi' };
}

/**
 * Fetches cohort batches from School PC or Supabase cloud
 */
export async function fetchBatchesFromHub(hubUrl = null) {
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. Try Local Wi-Fi PC Hub
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
  } catch (err) {
    console.warn('Wi-Fi batches fetch failed, trying database fallback:', err);
  }

  // 2. Direct Supabase Query
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('batches')
        .select('id, name, code, timing, classroom, is_active')
        .order('name');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Supabase batches query failed:', err);
  }

  return DEFAULT_BATCHES;
}

/**
 * Fetches student roster for a batch from School PC or Supabase cloud
 */
export async function fetchStudentsFromHub(batchId, hubUrl = null) {
  if (!batchId) return [];
  const targetUrl = (hubUrl || getStoredHubUrl()).replace(/\/+$/, '');

  // 1. Try Local Wi-Fi PC Hub
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
  } catch (err) {
    console.warn('Wi-Fi students fetch failed, trying database fallback:', err);
  }

  // 2. Direct Supabase Query
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('students')
        .select('id, full_name, roll_no, admission_no, gender, batch_id, status')
        .eq('batch_id', batchId)
        .order('admission_no');
      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err) {
    console.warn('Supabase students query failed:', err);
  }

  const filtered = DEFAULT_STUDENTS.filter((s) => s.batch_id === batchId || !batchId);
  return filtered.length > 0 ? filtered : DEFAULT_STUDENTS;
}

/**
 * Submits roll call attendance to School PC or Supabase cloud
 */
export async function submitAttendanceToHub(batchId, date, records, hubUrl = null) {
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

