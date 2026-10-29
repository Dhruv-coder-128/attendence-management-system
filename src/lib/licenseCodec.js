/**
 * Single source of truth for license encode/decode.
 * Handles both new school_licenses table and legacy courses LIC:% JSON blob.
 */
import { getStudentCapacityTier } from './licenseService.js';

export function decodeLicenseRow(row, idx = 0) {
  // New dedicated table row
  if (row.license_key && !row.code) {
    return normalizeNewRow(row);
  }
  // Legacy courses table
  return normalizeLegacyRow(row, idx);
}

function normalizeNewRow(row) {
  let days = row.days_remaining;
  if (row.trial_ends_at && days < 9000) {
    const diff = new Date(row.trial_ends_at).getTime() - Date.now();
    days = Math.max(0, Math.ceil(diff / 86400000));
  }
  return {
    id: row.id || `LIC-${row.license_key}`,
    schoolName: row.school_name || 'SMS Client School',
    contactPerson: row.contact_person || 'Principal / Administrator',
    email: row.email || '',
    phone: row.phone || '',
    licenseKey: row.license_key,
    status: row.is_locked ? 'suspended' : row.status || 'trial_active',
    isLocked: Boolean(row.is_locked),
    isTimerVisible: row.is_timer_visible !== false,
    daysRemaining: days,
    maxStudents: parseInt(row.max_students ?? 200, 10),
    tier: getStudentCapacityTier(row.max_students || 200),
    trialStartedAt: row.trial_started_at,
    trialEndsAt: row.trial_ends_at,
    boundDeviceId: row.bound_device_id || null,
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

function normalizeLegacyRow(row, idx) {
  let parsed = {};
  try { parsed = JSON.parse(row.description) || {}; } catch {}
  const cleanKey = parsed.license_key || parsed.licenseKey || row.code.replace(/^LIC:/, '');
  const schoolName = parsed.school_name || parsed.schoolName || row.name?.replace(/\s*\[.*\]/, '').trim() || 'SMS Client School';
  const isLocked = Boolean(parsed.is_locked || parsed.isLocked || !row.is_active || parsed.status === 'suspended');
  let days = parsed.days_remaining !== undefined ? parsed.days_remaining : parsed.daysRemaining !== undefined ? parsed.daysRemaining : 30;
  const trialEnds = parsed.trial_ends_at || parsed.trialEndsAt;
  if (trialEnds && days < 9000) {
    const diff = new Date(trialEnds).getTime() - Date.now();
    days = Math.max(0, Math.ceil(diff / 86400000));
  }
  return {
    id: parsed.id || row.id || `SMS-SCH-${String(idx + 1).padStart(3, '0')}`,
    schoolName,
    contactPerson: parsed.contact_person || parsed.contactPerson || 'Principal / Administrator',
    email: parsed.email || '',
    phone: parsed.phone || '',
    licenseKey: cleanKey,
    status: isLocked ? 'suspended' : parsed.status || 'trial_active',
    isLocked,
    isTimerVisible: parsed.is_timer_visible !== undefined ? parsed.is_timer_visible : parsed.isTimerVisible !== false,
    daysRemaining: days,
    maxStudents: parsed.max_students !== undefined ? parseInt(parsed.max_students, 10) : parsed.maxStudents !== undefined ? parseInt(parsed.maxStudents, 10) : 200,
    tier: getStudentCapacityTier(parsed.max_students || parsed.maxStudents || 200),
    trialStartedAt: parsed.trial_started_at || parsed.trialStartedAt || row.created_at,
    trialEndsAt: trialEnds,
    boundDeviceId: parsed.bound_device_id || parsed.activated_device_id || null,
    notes: parsed.notes || '',
    createdAt: row.created_at,
  };
}

export function encodeLicensePayload(obj) {
  // Canonical payload for school_licenses table
  const cleanKey = String(obj.licenseKey || obj.license_key).trim().toUpperCase();
  const now = new Date();
  const days = obj.daysRemaining ?? obj.days_remaining ?? 30;
  const trialEndsAt = obj.trialEndsAt || obj.trial_ends_at || new Date(now.getTime() + days * 86400000).toISOString();
  const status = obj.isLocked ? 'suspended' : obj.status || (days > 0 ? 'trial_active' : 'trial_expired');
  return {
    license_key: cleanKey,
    school_name: (obj.schoolName || obj.school_name || 'SMS Client School').trim(),
    contact_person: (obj.contactPerson || obj.contact_person || 'Principal / Administrator').trim(),
    email: (obj.email || '').trim(),
    phone: (obj.phone || '').trim(),
    status,
    is_locked: Boolean(obj.isLocked || obj.is_locked),
    days_remaining: days,
    max_students: parseInt(obj.maxStudents ?? obj.max_students ?? 200, 10) || 200,
    trial_started_at: obj.trialStartedAt || obj.trial_started_at || now.toISOString(),
    trial_ends_at: trialEndsAt,
    is_timer_visible: obj.isTimerVisible !== undefined ? Boolean(obj.isTimerVisible) : obj.is_timer_visible !== false,
    bound_device_id: obj.boundDeviceId || obj.bound_device_id || null,
    notes: obj.notes || '',
    updated_at: now.toISOString(),
  };
}
