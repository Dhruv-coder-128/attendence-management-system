/**
 * SMS — Student Management System
 * Parent Portal & Sibling Support Service Engine
 * 
 * Manages parent authentication, multi-child sibling resolution,
 * visual attendance heatmap aggregation, fee installment ledger,
 * batch exam ranking, and admin portal controls.
 */

import { getStudentFeeRecord } from './feeService.js';
import { getApiBaseUrl } from './licenseService.js';

const PARENT_SESSION_KEY = 'sms_parent_portal_session';
const PARENT_SETTINGS_KEY = 'sms_parent_portal_settings';

/**
 * Default administrative settings for the Parent Portal
 */
export const DEFAULT_PORTAL_SETTINGS = {
  allowMarkSheets: true,
  allowFeeReceipts: true,
  allowAttendanceHeatmap: true,
  allowClassDiary: true,
  allowOnlineUPI: true,
  welcomeNotice: 'Welcome to the official Parent & Student Portal. Track live attendance, fee installments, and test results.',
  helplinePhone: '',
  helplineEmail: 'support@smsacademy.edu',
};

/**
 * Normalizes phone numbers (removes spaces, dashes, +91 prefixes)
 */
export function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '').slice(-10);
}

/**
 * Normalizes admission or roll numbers
 */
export function cleanIdentifier(id) {
  if (!id) return '';
  return id.trim().toLowerCase();
}

/**
 * Retrieves the stored parent session from localStorage
 */
export function getParentPortalSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PARENT_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Saves or updates the parent portal session in localStorage
 */
export function saveParentPortalSession(data) {
  if (typeof window === 'undefined' || !data) return;
  try {
    localStorage.setItem(PARENT_SESSION_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to save parent session:', err);
  }
}

/**
 * Clears the parent session (Logout)
 */
export function clearParentPortalSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PARENT_SESSION_KEY);
}

/**
 * Retrieves Admin-configured portal settings
 */
export function getParentPortalSettings() {
  if (typeof window === 'undefined') return DEFAULT_PORTAL_SETTINGS;
  try {
    const raw = localStorage.getItem(PARENT_SETTINGS_KEY);
    if (!raw) return DEFAULT_PORTAL_SETTINGS;
    return { ...DEFAULT_PORTAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PORTAL_SETTINGS;
  }
}

/**
 * Saves Admin-configured portal settings
 */
export function saveParentPortalSettings(settings) {
  if (typeof window === 'undefined') return;
  try {
    const current = getParentPortalSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(PARENT_SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn('Failed to save portal settings:', err);
    return DEFAULT_PORTAL_SETTINGS;
  }
}

async function parentAuthApi(body) {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/api/parent-portal-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => ({ ok: false, error: `Server returned HTTP ${res.status}` }));
  } catch {
    return { ok: false, error: 'Cannot reach the school server. Please check your internet connection.' };
  }
}

/** Step 1: sends a one-time login code to the parent's linked Telegram chat. */
export async function requestParentOtp(phoneInput, identifierInput) {
  const phone = cleanPhone(phoneInput);
  const identifier = cleanIdentifier(identifierInput);
  if (phone.length !== 10) return { ok: false, error: 'Please enter a valid 10-digit mobile number.' };
  if (!identifier) return { ok: false, error: 'Please enter your child\'s roll number or admission number.' };
  return parentAuthApi({ action: 'request_otp', phone, identifier });
}

/** Step 2: verifies the code and stores the parent session (including the signed session token). */
export async function verifyParentOtp(phoneInput, code) {
  const data = await parentAuthApi({ action: 'verify_otp', phone: cleanPhone(phoneInput), code: String(code || '').trim() });
  if (data.ok) saveParentPortalSession(data);
  return data;
}

// One server round-trip per child per page load; attendance and exams share it.
const portalDataCache = new Map();
function fetchPortalData(studentId) {
  if (!portalDataCache.has(studentId)) {
    const sessionToken = getParentPortalSession()?.sessionToken;
    const promise = sessionToken
      ? parentAuthApi({ action: 'portal_data', sessionToken, studentId })
      : Promise.resolve({ ok: false, error: 'Not logged in.' });
    portalDataCache.set(studentId, promise);
    promise.then((d) => { if (!d.ok) portalDataCache.delete(studentId); });
  }
  return portalDataCache.get(studentId);
}

/**
 * Fetches attendance records and computes visual heatmap for a student
 */
export async function fetchStudentAttendanceSummary(studentId) {
  if (!studentId) return null;

  const portal = await fetchPortalData(studentId);
  const records = portal.ok ? portal.attendance : [];

  // Stats calculation
  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  const heatmap = {};

  records.forEach((r) => {
    heatmap[r.date] = {
      status: r.status,
      time_in: r.time_in,
      remarks: r.remarks,
      session_name: r.session_name,
    };

    if (r.status === 'Present') present++;
    else if (r.status === 'Late') late++;
    else if (r.status === 'Absent') absent++;
    else if (r.status === 'Excused') excused++;
  });

  const totalHeld = records.length;
  const attended = present + late;
  const rate = totalHeld > 0 ? Math.round((attended / totalHeld) * 100) : 100;

  // Monthly breakdown
  const monthMap = {};
  records.forEach((r) => {
    const monthKey = r.date.slice(0, 7); // YYYY-MM
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { held: 0, attended: 0, name: new Date(r.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) };
    }
    monthMap[monthKey].held++;
    if (r.status === 'Present' || r.status === 'Late') {
      monthMap[monthKey].attended++;
    }
  });

  const monthlyRates = Object.entries(monthMap).map(([key, val]) => ({
    key,
    label: val.name,
    rate: Math.round((val.attended / val.held) * 100),
    held: val.held,
    attended: val.attended,
  }));

  // Today's status
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecord = heatmap[todayStr] || records[0];

  return {
    records,
    heatmap,
    todayRecord,
    monthlyRates,
    stats: {
      totalHeld,
      present,
      late,
      absent,
      excused,
      rate,
      isDefaulter: rate < 75,
    },
  };
}

/**
 * Fetches fee status, installment schedule, and payment receipts
 */
export async function fetchStudentFeesSummary(student) {
  if (!student) return null;
  const feeRecord = await getStudentFeeRecord(student, student.courses);
  return feeRecord;
}

/**
 * Fetches exam results with batch ranking and percentile
 */
export async function fetchStudentExamsWithRank(studentId) {
  if (!studentId) return [];

  const portal = await fetchPortalData(studentId);
  return portal.ok ? portal.exams : [];
}

/**
 * Daily Class Diary & Homework Feed
 */
// shortcut: no class-diary table exists yet, so there is nothing real to show.
export function getDailyClassDiary() {
  return [];
}

/**
 * Builds a direct 1-click WhatsApp or Web Portal link for a student/parent
 */
export function buildParentPortalLink(parent, student) {
  let origin = 'https://attendence-management-system-lovat.vercel.app';
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('sms_parent_portal_url');
    if (custom && custom.startsWith('http')) {
      origin = custom.replace(/\/$/, '');
    } else if (
      window.location &&
      window.location.origin &&
      !window.location.origin.includes('tauri.localhost') &&
      !window.location.origin.includes('tauri://') &&
      !window.location.origin.includes('localhost') &&
      !window.location.origin.includes('127.0.0.1') &&
      !window.location.origin.includes('file://')
    ) {
      origin = window.location.origin;
    }
  }
  const phone = cleanPhone(parent?.phone);
  const adm = encodeURIComponent(student?.admission_no || student?.roll_no || '');
  return `${origin}/?portal=parent&phone=${phone}&adm=${adm}`;
}
