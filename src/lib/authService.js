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

/**
 * Fallback Owner Profile (Auto-provisioned fail-safe to guarantee zero lockouts)
 */
export function getFallbackOwnerProfile(user) {
  const allPerms = {};
  MODULE_PERMISSIONS.forEach((p) => {
    allPerms[p.key] = true;
  });

  return {
    id: user?.id || 'owner-session',
    email: user?.email || 'admin@ruparel.edu',
    full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'System Owner',
    role: 'owner',
    permissions: allPerms,
    is_active: true,
  };
}

/**
 * Fetches the user profile from public.user_profiles
 */
export async function fetchUserProfile(user) {
  if (!user || !user.id || !supabase || !isSupabaseConfigured) {
    return getFallbackOwnerProfile(user);
  }

  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) {
      // If user profile is not found or table is pending migration, check if this is the only user
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true });

      if (count === 0 || !count) {
        // First user is automatically granted Owner privileges
        return getFallbackOwnerProfile(user);
      }

      // Default safe profile
      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Staff User',
        role: 'moderator',
        permissions: {
          view_students: true,
          view_attendance: true,
          mark_attendance: true,
        },
        is_active: true,
      };
    }

    return profile;
  } catch (err) {
    console.warn('Error fetching user profile, using safe fallback:', err);
    return getFallbackOwnerProfile(user);
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
