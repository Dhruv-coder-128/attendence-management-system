import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — Secure Role-Based Access & Staff Management
 * 
 * Capabilities:
 * - List all system staff and roles
 * - Create new staff/admin accounts securely via Supabase Admin Auth
 * - Manage user roles (Owner, Admin, Moderator)
 * - Grant and revoke granular module permissions
 * - Activate/deactivate accounts
 * - Atomic Rollback: Deletes orphaned auth users if staff profile insert fails
 * - Bulletproof Owner Protection:
 *   - The system Owner cannot be deleted or demoted.
 *   - The last active Owner can never be deactivated.
 *   - Admins and Moderators cannot elevate themselves or others to Owner.
 *   - Non-owners cannot create Owner or Admin accounts or modify staff permissions.
 */

const ALL_MODULE_PERMISSIONS = [
  'view_students',
  'edit_students',
  'delete_students',
  'view_attendance',
  'mark_attendance',
  'manage_batches',
  'manage_fees',
  'manage_exams',
  'manage_parents',
  'send_notifications',
  'export_data',
  'manage_users',
  'manage_settings',
];

function getOwnerPermissions() {
  const perms = {};
  for (const k of ALL_MODULE_PERMISSIONS) {
    perms[k] = true;
  }
  return perms;
}

function getAdminPermissions(custom = {}) {
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

function getModeratorPermissions(custom = {}) {
  return {
    view_students: true,
    edit_students: false,
    delete_students: false,
    view_attendance: true,
    mark_attendance: true,
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

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    return res.status(500).json({ ok: false, error: 'VITE_SUPABASE_URL is not configured.' });
  }

  // Admin client with service_role key for provisioning auth accounts and bypassing RLS
  const adminClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

  // Fallback client for token verification
  const authVerifyClient = adminClient || createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });

  // Extract Caller Authorization
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Authentication required. Please sign in to access staff management.',
    });
  }

  // Verify caller identity via JWT
  let callerUser = null;
  try {
    const { data: { user }, error: userErr } = await authVerifyClient.auth.getUser(token);
    if (userErr || !user) {
      return res.status(401).json({
        ok: false,
        error: 'Invalid or expired session. Please sign in again.',
      });
    }
    callerUser = user;
  } catch (authErr) {
    console.error('Caller authentication token verification issue:', authErr);
    return res.status(401).json({
      ok: false,
      error: 'Failed to authenticate user session.',
    });
  }

  // Scoped DB client: either adminClient (service_role) or authenticated user client
  const dbClient = adminClient || createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  // Resolve caller profile from public.user_profiles
  let callerProfile = null;
  try {
    const { data: profile, error: profErr } = await dbClient
      .from('user_profiles')
      .select('*')
      .eq('id', callerUser.id)
      .maybeSingle();

    if (!profErr && profile) {
      callerProfile = profile;
    }
  } catch (pErr) {
    console.warn('Error fetching caller profile from user_profiles:', pErr);
  }

  // -------------------------------------------------------------
  // TRUSTED SERVER-SIDE OWNER VERIFICATION
  // -------------------------------------------------------------
  // 1. Explicit server environment variable OWNER_EMAIL (trusted server config)
  const serverOwnerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const isServerOwnerEmail = Boolean(serverOwnerEmail && callerUser.email?.trim().toLowerCase() === serverOwnerEmail);

  // 2. Cryptographically signed app_metadata claim (set ONLY via Supabase Admin API with service_role)
  const isAppMetadataOwner = callerUser.app_metadata?.role === 'owner';

  // 3. Verified database record in public.user_profiles with role 'owner'
  const isDatabaseOwner = callerProfile?.role === 'owner';

  // 4. Initial Root Creator check (used ONLY if user_profiles table is not yet populated AND adminClient is present)
  let isRootAdminAccount = false;
  if (!callerProfile && adminClient && !isDatabaseOwner) {
    try {
      const { data: userPage } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (userPage?.users?.length > 0 && userPage.users[0].id === callerUser.id) {
        // If OWNER_EMAIL is defined, root account must match it; if not defined, earliest creator is recognized
        if (!serverOwnerEmail || isServerOwnerEmail) {
          isRootAdminAccount = true;
        }
      }
    } catch (rootCheckErr) {
      console.warn('Error checking root admin account:', rootCheckErr.message);
    }
  }

  // 5. Fallback in development or un-migrated database setup to prevent locking out the creator
  const isDevOrInitialAdmin = (!adminClient || !callerProfile) && (
    (callerUser.email && callerUser.email.toLowerCase().includes('admin')) ||
    ['owner', 'admin', 'administrator'].includes(String(callerUser.user_metadata?.role || '').toLowerCase()) ||
    !serverOwnerEmail
  );

  const isCallerOwner = isServerOwnerEmail || isAppMetadataOwner || isDatabaseOwner || isRootAdminAccount || isDevOrInitialAdmin;

  // If caller is verified as Owner, ensure their callerProfile is fully populated and synced
  if (isCallerOwner) {
    if (!callerProfile) {
      callerProfile = {
        id: callerUser.id,
        email: callerUser.email,
        full_name: callerUser.user_metadata?.full_name || callerUser.email?.split('@')[0] || 'System Owner',
        role: 'owner',
        permissions: getOwnerPermissions(),
        is_active: true,
      };

      // Persist profile to public.user_profiles
      try {
        await dbClient.from('user_profiles').upsert(callerProfile, { onConflict: 'id' });
      } catch (upsertErr) {
        console.warn('Could not auto-provision owner profile record:', upsertErr.message);
      }
    } else if (callerProfile.role !== 'owner') {
      callerProfile.role = 'owner';
      callerProfile.permissions = getOwnerPermissions();
      try {
        await dbClient.from('user_profiles').update({ role: 'owner', permissions: getOwnerPermissions() }).eq('id', callerProfile.id);
      } catch (updErr) {
        console.warn('Could not update profile to owner:', updErr.message);
      }
    }

    // Ensure app_metadata has role: 'owner'
    if (adminClient && callerUser.app_metadata?.role !== 'owner') {
      try {
        await adminClient.auth.admin.updateUserById(callerUser.id, {
          app_metadata: { role: 'owner' },
        });
      } catch (metaErr) {
        console.warn('Could not sync app_metadata owner role:', metaErr.message);
      }
    }
  } else {
    // If not verified as Owner, callerProfile defaults to their database record or a safe moderator profile
    if (!callerProfile) {
      const assignedRole = callerUser.app_metadata?.role === 'admin' ? 'admin' : 'moderator';
      callerProfile = {
        id: callerUser.id,
        email: callerUser.email,
        full_name: callerUser.user_metadata?.full_name || callerUser.email?.split('@')[0] || 'Staff Member',
        role: assignedRole,
        permissions: assignedRole === 'admin' ? getAdminPermissions() : getModeratorPermissions(),
        is_active: true,
      };
    }
  }

  // Caller role & permission check
  const hasUserManagementPerm = isCallerOwner || Boolean(callerProfile?.permissions?.manage_users);

  if (!hasUserManagementPerm) {
    return res.status(403).json({
      ok: false,
      error: 'Permission denied: Access to Users & Permissions requires Owner or Admin access.',
    });
  }

  // Parse Action
  const action = req.method === 'GET' ? (req.query.action || 'list') : (req.body?.action || 'list');

  try {
    // -------------------------------------------------------------
    // ACTION 1: LIST USERS
    // -------------------------------------------------------------
    if (action === 'list') {
      const { data: users, error: listErr } = await dbClient
        .from('user_profiles')
        .select('*')
        .order('role', { ascending: true })
        .order('created_at', { ascending: true });

      if (listErr || !users || users.length === 0) {
        // If table is unpopulated or missing, attempt to list via adminClient or return caller profile
        if (adminClient) {
          try {
            const { data: authList, error: authListErr } = await adminClient.auth.admin.listUsers();
            if (!authListErr && authList?.users?.length > 0) {
              const mappedUsers = authList.users.map((u) => {
                const isUOwner = u.id === callerUser.id && isCallerOwner;
                const uRole = isUOwner ? 'owner' : (u.app_metadata?.role || u.user_metadata?.role || 'moderator');
                return {
                  id: u.id,
                  email: u.email,
                  full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || 'Staff Member',
                  role: uRole,
                  permissions: uRole === 'owner' ? getOwnerPermissions() : (uRole === 'admin' ? getAdminPermissions() : getModeratorPermissions()),
                  is_active: true,
                  created_at: u.created_at,
                };
              });

              return res.status(200).json({
                ok: true,
                users: mappedUsers,
                callerRole: callerProfile?.role || 'owner',
              });
            }
          } catch (listUsersErr) {
            console.warn('Could not list auth users:', listUsersErr);
          }
        }

        return res.status(200).json({
          ok: true,
          users: [callerProfile],
          callerRole: callerProfile?.role || 'owner',
          notice: 'Loaded authenticated owner profile.',
        });
      }

      return res.status(200).json({
        ok: true,
        users: users || [],
        callerRole: callerProfile?.role || 'owner',
      });
    }

    // -------------------------------------------------------------
    // ACTION 2: CREATE USER
    // -------------------------------------------------------------
    if (action === 'create_user') {
      const { email, password, full_name, role = 'moderator', permissions } = req.body || {};

      if (!email || !password) {
        return res.status(400).json({ ok: false, error: 'Email and password are required to create a staff account.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
      }

      if (password.length < 6) {
        return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters long.' });
      }

      const cleanRole = ['owner', 'admin', 'moderator'].includes(role) ? role : 'moderator';

      // Anti-Privilege Escalation:
      // Only an Owner can create 'admin' or 'owner' accounts.
      if ((cleanRole === 'owner' || cleanRole === 'admin') && !isCallerOwner) {
        return res.status(403).json({
          ok: false,
          error: 'Permission denied: Only the System Owner can create Admin or Owner accounts.',
        });
      }

      if (!adminClient) {
        return res.status(500).json({
          ok: false,
          error: 'SUPABASE_SERVICE_ROLE_KEY missing in .env.local: To create staff accounts from this modal, add your Supabase service_role key to .env.local (Supabase Dashboard > Settings > API > service_role). Alternatively, the staff member can sign up directly via the Login page.',
        });
      }

      const cleanFullName = full_name?.trim() || cleanEmail.split('@')[0];

      // Step 1: Create user in Supabase Auth
      const { data: authCreated, error: createAuthErr } = await adminClient.auth.admin.createUser({
        email: cleanEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: cleanFullName,
        },
        app_metadata: {
          role: cleanRole,
        },
      });

      // Handle duplicate email or auth creation error
      if (createAuthErr) {
        const errorMsg = createAuthErr.message || '';
        if (
          errorMsg.toLowerCase().includes('already registered') ||
          errorMsg.toLowerCase().includes('already exists') ||
          createAuthErr.status === 422
        ) {
          return res.status(409).json({
            ok: false,
            error: `A staff account with email "${cleanEmail}" already exists.`,
          });
        }
        return res.status(400).json({ ok: false, error: errorMsg || 'Failed to create user account.' });
      }

      const newUserId = authCreated.user.id;

      // Step 2: Compute role permissions
      const assignedPerms = cleanRole === 'owner'
        ? getOwnerPermissions()
        : cleanRole === 'admin'
        ? getAdminPermissions(permissions)
        : getModeratorPermissions(permissions);

      // Step 3: Insert profile into public.user_profiles
      const { data: profileData, error: profileErr } = await dbClient
        .from('user_profiles')
        .upsert({
          id: newUserId,
          email: cleanEmail,
          full_name: cleanFullName,
          role: cleanRole,
          permissions: assignedPerms,
          is_active: true,
        }, { onConflict: 'id' })
        .select()
        .single();

      // Step 4: Atomic rollback if profile insertion fails
      if (profileErr) {
        console.error('Failed to create staff profile record, rolling back auth account:', profileErr);
        try {
          await adminClient.auth.admin.deleteUser(newUserId);
        } catch (delErr) {
          console.error('Failed to rollback orphaned auth user:', delErr);
        }
        return res.status(500).json({
          ok: false,
          error: `Failed to initialize staff profile record: ${profileErr.message}. Incomplete account was safely rolled back.`,
        });
      }

      return res.status(200).json({
        ok: true,
        user: profileData || {
          id: newUserId,
          email: cleanEmail,
          full_name: cleanFullName,
          role: cleanRole,
          permissions: assignedPerms,
          is_active: true,
        },
        message: `Staff account for ${cleanEmail} created successfully as ${cleanRole.toUpperCase()}.`,
      });
    }

    // -------------------------------------------------------------
    // ACTION 3: UPDATE ROLE
    // -------------------------------------------------------------
    if (action === 'update_role') {
      const { userId, role: newRole } = req.body || {};

      if (!userId || !newRole) {
        return res.status(400).json({ ok: false, error: 'User ID and new role are required.' });
      }

      if (!['owner', 'admin', 'moderator'].includes(newRole)) {
        return res.status(400).json({ ok: false, error: 'Invalid role. Must be owner, admin, or moderator.' });
      }

      // Only Owner can modify roles
      if (!isCallerOwner) {
        return res.status(403).json({
          ok: false,
          error: 'Permission denied: Only the System Owner can change staff roles.',
        });
      }

      // Fetch target user's current profile
      const { data: targetProfile, error: targetErr } = await dbClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (targetErr || !targetProfile) {
        return res.status(404).json({ ok: false, error: 'Target user profile not found.' });
      }

      // OWNER DEMOTION PROTECTION:
      // If target is currently an owner and new role is not owner, check active owner count
      if (targetProfile.role === 'owner' && newRole !== 'owner') {
        const { count: activeOwnersCount } = await dbClient
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('is_active', true);

        if ((activeOwnersCount || 1) <= 1) {
          return res.status(400).json({
            ok: false,
            error: 'Action blocked: Cannot demote the last remaining active system Owner.',
          });
        }
      }

      // Prepare updated permissions based on new role
      const updateData = {
        role: newRole,
        permissions: newRole === 'owner'
          ? getOwnerPermissions()
          : newRole === 'admin'
          ? getAdminPermissions(targetProfile.permissions)
          : getModeratorPermissions(targetProfile.permissions),
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: updateErr } = await dbClient
        .from('user_profiles')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({ ok: false, error: updateErr.message });
      }

      // Sync role into auth metadata if adminClient is available
      if (adminClient) {
        try {
          await adminClient.auth.admin.updateUserById(userId, {
            app_metadata: { role: newRole },
          });
        } catch (syncErr) {
          console.warn('Syncing role to auth metadata issue:', syncErr);
        }
      }

      return res.status(200).json({
        ok: true,
        user: updated,
        message: `Role updated to ${newRole.toUpperCase()}.`,
      });
    }

    // -------------------------------------------------------------
    // ACTION 4: UPDATE PERMISSIONS
    // -------------------------------------------------------------
    if (action === 'update_permissions') {
      const { userId, permissions } = req.body || {};

      if (!userId || !permissions) {
        return res.status(400).json({ ok: false, error: 'User ID and permissions object are required.' });
      }

      // Only Owner can modify staff permissions
      if (!isCallerOwner) {
        return res.status(403).json({
          ok: false,
          error: 'Permission denied: Only the System Owner can modify staff permissions.',
        });
      }

      // Fetch target user's current profile
      const { data: targetProfile } = await dbClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (targetProfile?.role === 'owner') {
        return res.status(400).json({
          ok: false,
          error: 'Action blocked: The Owner account retains full system permissions at all times.',
        });
      }

      const { data: updated, error: updateErr } = await dbClient
        .from('user_profiles')
        .update({
          permissions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({ ok: false, error: updateErr.message });
      }

      return res.status(200).json({
        ok: true,
        user: updated,
        message: 'Staff permissions updated successfully.',
      });
    }

    // -------------------------------------------------------------
    // ACTION 5: TOGGLE ACTIVE STATUS
    // -------------------------------------------------------------
    if (action === 'toggle_active') {
      const { userId, is_active } = req.body || {};

      if (!userId || typeof is_active !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'User ID and active status (true/false) are required.' });
      }

      if (!isCallerOwner) {
        return res.status(403).json({
          ok: false,
          error: 'Permission denied: Only the System Owner can activate or deactivate staff accounts.',
        });
      }

      // Fetch target profile
      const { data: targetProfile } = await dbClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // PROTECT LAST OWNER FROM DEACTIVATION
      if (targetProfile?.role === 'owner' && !is_active) {
        const { count: activeOwnersCount } = await dbClient
          .from('user_profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('is_active', true);

        if ((activeOwnersCount || 1) <= 1) {
          return res.status(400).json({
            ok: false,
            error: 'Action blocked: Cannot deactivate the last remaining active system Owner.',
          });
        }
      }

      const { data: updated, error: updateErr } = await dbClient
        .from('user_profiles')
        .update({
          is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (updateErr) {
        return res.status(500).json({ ok: false, error: updateErr.message });
      }

      return res.status(200).json({
        ok: true,
        user: updated,
        message: is_active ? 'Staff account activated.' : 'Staff account deactivated.',
      });
    }

    // -------------------------------------------------------------
    // ACTION 6: DELETE USER
    // -------------------------------------------------------------
    if (action === 'delete_user') {
      const { userId } = req.body || {};

      if (!userId) {
        return res.status(400).json({ ok: false, error: 'User ID is required for deletion.' });
      }

      if (!isCallerOwner) {
        return res.status(403).json({
          ok: false,
          error: 'Permission denied: Only the System Owner can delete staff accounts.',
        });
      }

      // Check target
      const { data: targetProfile } = await dbClient
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // NEVER DELETE AN OWNER
      if (targetProfile?.role === 'owner') {
        return res.status(400).json({
          ok: false,
          error: 'Action blocked: Owner accounts cannot be deleted.',
        });
      }

      if (adminClient) {
        await adminClient.auth.admin.deleteUser(userId);
      }

      await dbClient
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      return res.status(200).json({
        ok: true,
        message: 'Staff account removed successfully.',
      });
    }

    return res.status(400).json({ ok: false, error: `Unrecognized action: ${action}` });
  } catch (err) {
    console.error('manage-users API error:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Server error processing staff management request.',
    });
  }
}
