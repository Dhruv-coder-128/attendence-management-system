import { supabase, isSupabaseConfigured } from './supabase';

/**
 * Default Academy Branding & Configuration
 */
export const DEFAULT_ACADEMY_SETTINGS = {
  academy_name: 'Ruparel Attendance ERP Academy',
  branch_name: 'Central Campus — Main Wing',
  address: '123 Education Hub, MG Road, Mumbai, Maharashtra 400001',
  phone: '+91 98765 43210',
  email: 'contact@ruparel.edu',
  logo_url: '',
  tagline: 'Excellence in Higher Secondary & College Education • Estd. 2018',
  academic_year: 'AY 2026-27 (Term 1)',
  min_attendance_threshold: 75,
  late_grace_minutes: 15,
};

/**
 * Retrieves cached settings from localStorage synchronously with default fallbacks
 */
export function getStoredAcademySettings() {
  if (typeof window === 'undefined') return DEFAULT_ACADEMY_SETTINGS;
  try {
    const raw = localStorage.getItem('erp_academy_branding');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_ACADEMY_SETTINGS, ...parsed };
    }
  } catch {
    // Fallback to legacy individual keys if present
  }

  return {
    ...DEFAULT_ACADEMY_SETTINGS,
    academy_name: localStorage.getItem('erp_institute_name') || DEFAULT_ACADEMY_SETTINGS.academy_name,
    branch_name: localStorage.getItem('erp_campus_name') || DEFAULT_ACADEMY_SETTINGS.branch_name,
    academic_year: localStorage.getItem('erp_academic_year') || DEFAULT_ACADEMY_SETTINGS.academic_year,
    min_attendance_threshold: Number(localStorage.getItem('erp_min_attendance')) || DEFAULT_ACADEMY_SETTINGS.min_attendance_threshold,
    late_grace_minutes: Number(localStorage.getItem('erp_late_grace')) || DEFAULT_ACADEMY_SETTINGS.late_grace_minutes,
  };
}

/**
 * Saves settings to localStorage
 */
export function saveSettingsToLocal(settings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('erp_academy_branding', JSON.stringify(settings));
    // Also update legacy keys for backward compatibility
    if (settings.academy_name) localStorage.setItem('erp_institute_name', settings.academy_name);
    if (settings.branch_name) localStorage.setItem('erp_campus_name', settings.branch_name);
    if (settings.academic_year) localStorage.setItem('erp_academic_year', settings.academic_year);
    if (settings.min_attendance_threshold) localStorage.setItem('erp_min_attendance', String(settings.min_attendance_threshold));
    if (settings.late_grace_minutes) localStorage.setItem('erp_late_grace', String(settings.late_grace_minutes));
  } catch (err) {
    console.warn('Failed to save settings to localStorage:', err);
  }
}

/**
 * Fetches academy settings from Supabase public.academy_settings table
 * Falls back gracefully to localStorage if table does not exist or network is offline
 */
export async function fetchAcademySettings() {
  const localSettings = getStoredAcademySettings();

  if (!supabase || !isSupabaseConfigured) {
    return localSettings;
  }

  try {
    const { data, error } = await supabase
      .from('academy_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data) {
      const merged = {
        ...DEFAULT_ACADEMY_SETTINGS,
        ...data,
      };
      saveSettingsToLocal(merged);
      return merged;
    }
  } catch (err) {
    console.warn('Could not fetch academy settings from Supabase, using local defaults:', err.message);
  }

  return localSettings;
}

/**
 * Persists academy settings to Supabase and syncs to localStorage
 */
export async function updateAcademySettings(newSettings) {
  const merged = {
    ...getStoredAcademySettings(),
    ...newSettings,
    updated_at: new Date().toISOString(),
  };

  // Sync to local storage immediately
  saveSettingsToLocal(merged);

  if (!supabase || !isSupabaseConfigured) {
    return { ok: true, data: merged };
  }

  try {
    const { data, error } = await supabase
      .from('academy_settings')
      .upsert({
        id: 'default',
        academy_name: merged.academy_name,
        branch_name: merged.branch_name,
        address: merged.address,
        phone: merged.phone,
        email: merged.email,
        logo_url: merged.logo_url || '',
        tagline: merged.tagline,
        academic_year: merged.academic_year,
        min_attendance_threshold: Number(merged.min_attendance_threshold) || 75,
        late_grace_minutes: Number(merged.late_grace_minutes) || 15,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.warn('Supabase academy_settings upsert warning:', error.message);
      // Return ok: true since localStorage is updated, but attach note
      return { ok: true, data: merged, warning: error.message };
    }

    return { ok: true, data };
  } catch (err) {
    console.warn('Error updating academy settings in Supabase:', err);
    return { ok: true, data: merged, warning: err.message };
  }
}
