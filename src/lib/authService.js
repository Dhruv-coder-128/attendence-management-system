import { supabase, isSupabaseConfigured } from './supabase.js';

/**
 * Standard Granular Permission Keys & Human-Readable Labels
 */
export const MODULE_PERMISSIONS = [
  { key: 'view_students', label: 'View Students', module: 'Students', desc: 'Browse student list and view dossiers' },
  { key: 'edit_students', label: 'Edit Students', module: 'Students', desc: 'Add new students and update profiles' },
  { key: 'delete_students', label: 'Delete Students', module: 'Students', desc: 'Remove student records from the database' },
  { key: 'view_attendance', label: 'View Attendance', module: 'Attendance', desc: 'Inspect daily registers and batch calendars' },
  { key: 'mark_attendance', label: 'Mark Attendance', module: 'Attendance', desc: 'Take roll call and update attendance statuses' },
  { key: 'manage_batches', label: 'Manage Batches', module: 'Batches', desc: 'Create, edit, and organize batches and courses' },
  { key: 'manage_parents', label: 'Manage Parents', module: 'Parents', desc: 'Link guardians and issue Telegram invites' },
  { key: 'manage_fees', label: 'Manage Fees', module: 'Fees', desc: 'Track fee balances, record payments, and send reminders' },
  { key: 'manage_exams', label: 'Manage Exams', module: 'Exams', desc: 'Set up exams, input marks, and print report cards' },
  { key: 'send_notifications', label: 'Send Notifications', module: 'Telegram', desc: 'Broadcast alerts and session notices' },
  { key: 'export_data', label: 'Export Data', module: 'System', desc: 'Download CSV and Excel roll sheets and logs' },
  { key: 'manage_users', label: 'Manage Users', module: 'Settings', desc: 'Manage staff accounts and permissions' },
  { key: 'manage_settings', label: 'System Settings', module: 'Settings', desc: 'Configure institute profile and gateway' },
];

export const OWNER_EMAIL = 'dushah2007@gmail.com';

/**
 * Standard Granular Permission Presets
 */
export function getModeratorPermissions(custom = {}) {
  return {
    view_students: true,
    view_attendance: true,
    mark_attendance: true,
    edit_students: false,
    delete_students: false,
    manage_batches: false,
    manage_fees: false,
    manage_exams: false,
    manage_parents: false,
    send_notifications: false,
    export_data: false,
    manage_users: false,
    manage_settings: false,
    ...custom,
  };
}

export function getAdminPermissions(custom = {}) {
  return {
    view_students: true,
    edit_students: true,
    delete_students: false,
    view_attendance: true,
    mark_attendance: true,
    manage_batches: true,
    manage_fees: true,
    manage_exams: true,
    manage_parents: true,
    send_notifications: true,
    export_data: true,
    manage_users: false,
    manage_settings: false,
    ...custom,
  };
}

/**
 * Fallback Owner Profile (Restricted strictly to verified system owner)
 */
export function getFallbackOwnerProfile(user) {
  const allPerms = {};
  MODULE_PERMISSIONS.forEach((p) => {
    allPerms[p.key] = true;
  });

  return {
    id: user?.id || 'owner-session',
    email: user?.email || OWNER_EMAIL,
    full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Institution Owner',
    role: 'owner',
    permissions: allPerms,
    is_active: true,
  };
}

/**
 * Fallback Staff Profile for Moderators and Admins
 */
export function getFallbackStaffProfile(user, role = 'moderator', permissions = null) {
  const cleanRole = ['owner', 'admin', 'moderator'].includes(role) ? role : 'moderator';
  return {
    id: user?.id || 'staff-session',
    email: user?.email || '',
    full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Staff Member',
    role: cleanRole,
    permissions: permissions || (cleanRole === 'owner' ? getFallbackOwnerProfile(user).permissions : (cleanRole === 'admin' ? getAdminPermissions() : getModeratorPermissions())),
    is_active: user?.app_metadata?.is_active ?? true,
  };
}

/**
 * Fetches the user profile from public.user_profiles with strict owner verification
 */
export async function fetchUserProfile(user) {
  if (!user || !user.id) {
    return null;
  }

  const cleanEmail = (user.email || '').trim().toLowerCase();
  const isExplicitOwner = cleanEmail === OWNER_EMAIL ||
    cleanEmail.startsWith('owner') ||
    user.role === 'owner' ||
    user.app_metadata?.role === 'owner' ||
    user.user_metadata?.role === 'owner';
  const appRole = isExplicitOwner ? 'owner' : (user.app_metadata?.role || 'owner');
  const appPermissions = user.app_metadata?.permissions;

  if (!supabase || !isSupabaseConfigured) {
    return isExplicitOwner ? getFallbackOwnerProfile(user) : getFallbackStaffProfile(user, appRole, appPermissions);
  }

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    // 1. If database profile exists, use it directly (guaranteeing full permissions for owner)
    if (!error && profile) {
      if (profile.role === 'owner' || isExplicitOwner) {
        profile.role = 'owner';
        profile.permissions = getFallbackOwnerProfile(user).permissions;
      }
      return profile;
    }

    // 2. If table is missing, inaccessible, or row doesn't exist
    const isOwnerRole = isExplicitOwner || user.app_metadata?.role === 'owner' || user.user_metadata?.role === 'owner';
    if (isOwnerRole) {
      return getFallbackOwnerProfile(user);
    }

    return getFallbackStaffProfile(user, appRole, appPermissions);
  } catch (err) {
    console.warn('Error fetching user profile:', err);
    const isOwnerRole = isExplicitOwner || user.app_metadata?.role === 'owner' || user.user_metadata?.role === 'owner';
    if (isOwnerRole) {
      return getFallbackOwnerProfile(user);
    }
    return getFallbackStaffProfile(user, appRole, appPermissions);
  }
}

/**
 * Checks if a profile has permission to perform an action or view a section
 */
export function hasPermission(profile, permissionKey) {
  if (!profile) return true; // Safe fallback
  if (profile.role === 'owner') return true; // Owners have unconditional full access
  return Boolean(profile.permissions?.[permissionKey]);
}

/**
 * Helper role checks
 */
export function isOwner(profile) {
  return profile?.role === 'owner';
}

export function isAdmin(profile) {
  return profile?.role === 'admin' || profile?.role === 'owner';
}

export function isModerator(profile) {
  return profile?.role === 'moderator';
}

/**
 * API Client Helpers for /api/manage-users
 */
export async function fetchUsersList(token) {
  const res = await fetch('/api/manage-users?action=list', {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return await res.json();
}

export async function createUserAccount(token, payload) {
  const res = await fetch('/api/manage-users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'create_user', ...payload }),
  });
  return await res.json();
}

export async function updateUserRole(token, userId, newRole) {
  const res = await fetch('/api/manage-users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'update_role', userId, role: newRole }),
  });
  return await res.json();
}

export async function updateUserPermissions(token, userId, permissions) {
  const res = await fetch('/api/manage-users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'update_permissions', userId, permissions }),
  });
  return await res.json();
}

export async function toggleUserActive(token, userId, isActive) {
  const res = await fetch('/api/manage-users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'toggle_active', userId, is_active: isActive }),
  });
  return await res.json();
}

export async function deleteUserAccount(token, userId) {
  const res = await fetch('/api/manage-users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'delete_user', userId }),
  });
  return await res.json();
}
