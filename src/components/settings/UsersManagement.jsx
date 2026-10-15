import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Shield,
  UserCheck,
  UserX,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Key,
  Trash2,
  Lock,
  UserPlus,
  Edit2,
  Check,
  X,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Select from '../common/Select';
import { supabase } from '../../lib/supabase';
import {
  MODULE_PERMISSIONS,
  fetchUsersList,
  createUserAccount,
  updateUserRole,
  updateUserPermissions,
  toggleUserActive,
  deleteUserAccount,
} from '../../lib/authService';

export default function UsersManagement({ currentUserProfile }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successNotice, setSuccessNotice] = useState(null);

  // Add User Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'moderator',
    permissions: {},
  });
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Edit Permissions Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editedPermissions, setEditedPermissions] = useState({});
  const [isUpdatingPermissions, setIsUpdatingPermissions] = useState(false);

  const isCallerOwner = currentUserProfile?.role === 'owner';

  // Get current session token
  const getAuthToken = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) return session.access_token;
      const { data: refreshData } = await supabase.auth.refreshSession();
      return refreshData?.session?.access_token || '';
    } catch {
      return '';
    }
  };

  // Load users list
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetchUsersList(token);
      if (res.ok && res.users) {
        setUsers(res.users);
      } else {
        setError(res.error || 'Failed to load user accounts.');
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message || 'Network error fetching users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccessNotice(msg);
      setTimeout(() => setSuccessNotice(null), 4000);
    }
  };

  // Handle Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setModalError(null);
    if (!newUserData.email || !newUserData.password) {
      setModalError('Please provide both email and an initial password.');
      return;
    }
    if (newUserData.password.length < 6) {
      setModalError('Password must be at least 6 characters long.');
      return;
    }

    setIsCreating(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setModalError('Authentication session not found. Please refresh the page and try again.');
        return;
      }
      const res = await createUserAccount(token, newUserData);
      if (res.ok) {
        showNotification(res.message || 'Staff member created successfully.');
        setIsAddModalOpen(false);
        setModalError(null);
        setNewUserData({
          email: '',
          password: '',
          full_name: '',
          role: 'moderator',
          permissions: {},
        });
        await loadUsers();
      } else {
        setModalError(res.error || 'Failed to create staff account.');
        showNotification(res.error || 'Failed to create user.', true);
      }
    } catch (err) {
      setModalError(err.message || 'Error creating staff member.');
      showNotification(err.message || 'Error creating user.', true);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Role Change
  const handleRoleChange = async (userId, newRole) => {
    try {
      const token = await getAuthToken();
      const res = await updateUserRole(token, userId, newRole);
      if (res.ok) {
        showNotification(res.message || 'Role updated.');
        await loadUsers();
      } else {
        showNotification(res.error || 'Failed to update role.', true);
      }
    } catch (err) {
      showNotification(err.message || 'Error updating role.', true);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (userId, currentStatus) => {
    try {
      const token = await getAuthToken();
      const res = await toggleUserActive(token, userId, !currentStatus);
      if (res.ok) {
        showNotification(res.message || 'Status updated.');
        await loadUsers();
      } else {
        showNotification(res.error || 'Failed to update status.', true);
      }
    } catch (err) {
      showNotification(err.message || 'Error updating status.', true);
    }
  };

  // Handle Open Permissions Modal
  const openPermissionsModal = (user) => {
    setEditingUser(user);
    const existing = user.permissions || {};
    const initialized = {};
    MODULE_PERMISSIONS.forEach((p) => {
      initialized[p.key] = existing[p.key] !== undefined ? existing[p.key] : false;
    });
    setEditedPermissions(initialized);
  };

  // Handle Save Permissions
  const handleSavePermissions = async () => {
    if (!editingUser) return;
    setIsUpdatingPermissions(true);
    try {
      const token = await getAuthToken();
      const res = await updateUserPermissions(token, editingUser.id, editedPermissions);
      if (res.ok) {
        showNotification(res.message || 'Permissions updated successfully.');
        setEditingUser(null);
        await loadUsers();
      } else {
        showNotification(res.error || 'Failed to update permissions.', true);
      }
    } catch (err) {
      showNotification(err.message || 'Error saving permissions.', true);
    } finally {
      setIsUpdatingPermissions(false);
    }
  };

  // Handle Delete User
  const handleDeleteUser = async (user) => {
    if (user.role === 'owner') {
      alert('The Owner account is protected and cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to remove user ${user.email}? This action cannot be undone.`)) {
      return;
    }
    try {
      const token = await getAuthToken();
      const res = await deleteUserAccount(token, user.id);
      if (res.ok) {
        showNotification(res.message || 'User removed successfully.');
        await loadUsers();
      } else {
        showNotification(res.error || 'Failed to remove user.', true);
      }
    } catch (err) {
      showNotification(err.message || 'Error removing user.', true);
    }
  };

  return (
    <div className="erp-card" style={{ padding: '20px', marginTop: '24px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={20} color="var(--navy-900)" />
            <h2
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '16px',
                fontWeight: 700,
                color: 'var(--navy-950)',
              }}
            >
              Staff &amp; Role-Based Access Control
            </h2>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Manage staff accounts, assign roles (Owner, Admin, Moderator), and configure granular permissions
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={loadUsers}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={UserPlus}
            onClick={() => setIsAddModalOpen(true)}
          >
            Add Team Member
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {successNotice && (
        <div
          style={{
            marginBottom: '14px',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            color: 'var(--status-present)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{successNotice}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            marginBottom: '14px',
            padding: '10px 14px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            color: 'var(--status-absent)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="erp-table-scroll">
        <table className="erp-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>System Role</th>
              <th>Status</th>
              <th>Permissions</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Loading staff accounts...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  No staff members registered.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isOwnerAccount = u.role === 'owner';
                const grantedPermsCount = Object.values(u.permissions || {}).filter(Boolean).length;

                return (
                  <tr key={u.id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {u.full_name || 'Staff User'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {u.email}
                        </div>
                      </div>
                    </td>

                    <td>
                      {isOwnerAccount ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '12px',
                            backgroundColor: 'var(--navy-900)',
                            color: 'var(--gold-primary)',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.02em',
                          }}
                        >
                          <ShieldCheck size={12} /> Owner (Full Access)
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            backgroundColor: '#ffffff',
                            color: 'var(--navy-950)',
                            fontWeight: 500,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="moderator">Moderator</option>
                          <option value="admin">Admin</option>
                          {isCallerOwner && <option value="owner">Owner</option>}
                        </select>
                      )}
                    </td>

                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: u.is_active ? 'var(--status-present-bg)' : '#f1f5f9',
                          color: u.is_active ? 'var(--status-present)' : 'var(--text-muted)',
                          border: `1px solid ${u.is_active ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                        }}
                      >
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    <td>
                      {isOwnerAccount ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          All 13 Modules Granted
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPermissionsModal(u)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            color: 'var(--navy-700)',
                            background: 'none',
                            border: '1px dashed var(--navy-300)',
                            borderRadius: '4px',
                            padding: '3px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          <Edit2 size={11} /> {grantedPermsCount} of 13 Allowed
                        </button>
                      )}
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      {isOwnerAccount ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            fontStyle: 'italic',
                            padding: '4px 8px',
                          }}
                        >
                          Protected Account
                        </span>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u.id, u.is_active)}
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              borderRadius: '4px',
                              border: '1px solid var(--border-subtle)',
                              backgroundColor: u.is_active ? '#fff' : 'var(--status-present-bg)',
                              color: u.is_active ? 'var(--text-secondary)' : 'var(--status-present)',
                              cursor: 'pointer',
                            }}
                          >
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            style={{
                              padding: '4px 6px',
                              borderRadius: '4px',
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: 'var(--status-absent)',
                              cursor: 'pointer',
                            }}
                            title="Remove User"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL 1: ADD USER */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Staff Member"
        description="Create an account with role-based access for your tuition academy team"
      >
        <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Input
            label="Full Name"
            placeholder="e.g. Rahul Sharma"
            value={newUserData.full_name}
            onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
            required
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. rahul@ruparel.edu"
            value={newUserData.email}
            onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
            required
          />

          <Input
            label="Initial Password"
            type="password"
            placeholder="Minimum 6 characters"
            value={newUserData.password}
            onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
            required
          />

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--navy-900)',
                marginBottom: '4px',
              }}
            >
              System Role
            </label>
            <select
              value={newUserData.role}
              onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: '13px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: '#ffffff',
                color: 'var(--navy-950)',
              }}
            >
              <option value="moderator">Moderator (Attendance &amp; Roll Call Marking)</option>
              <option value="admin">Admin (Operational Management &amp; Batches)</option>
              {isCallerOwner && <option value="owner">Owner (Full System Administration)</option>}
            </select>
          </div>

          {modalError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                color: 'var(--status-absent)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{modalError}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={isCreating}
            >
              {isCreating ? 'Creating Account...' : 'Create Staff Member'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: EDIT PERMISSIONS */}
      <Modal
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title={`Edit Permissions: ${editingUser?.full_name || editingUser?.email}`}
        description="Toggle specific module privileges for this staff member"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              maxHeight: '340px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '6px',
            }}
          >
            {MODULE_PERMISSIONS.map((perm) => {
              const isChecked = Boolean(editedPermissions[perm.key]);
              return (
                <label
                  key={perm.key}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: isChecked ? '#f8fafc' : '#ffffff',
                    border: `1px solid ${isChecked ? 'var(--navy-200)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) =>
                      setEditedPermissions({
                        ...editedPermissions,
                        [perm.key]: e.target.checked,
                      })
                    }
                    style={{ marginTop: '2px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {perm.label}
                      <span
                        style={{
                          marginLeft: '6px',
                          fontSize: '10px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: '#e2e8f0',
                          color: '#475569',
                          fontWeight: 500,
                        }}
                      >
                        {perm.module}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {perm.desc}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  const allTrue = {};
                  MODULE_PERMISSIONS.forEach((p) => {
                    allTrue[p.key] = true;
                  });
                  setEditedPermissions(allTrue);
                }}
                style={{
                  fontSize: '11px',
                  color: 'var(--navy-700)',
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => {
                  const allFalse = {};
                  MODULE_PERMISSIONS.forEach((p) => {
                    allFalse[p.key] = false;
                  });
                  setEditedPermissions(allFalse);
                }}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Clear All
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                disabled={isUpdatingPermissions}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSavePermissions}
                disabled={isUpdatingPermissions}
              >
                {isUpdatingPermissions ? 'Saving...' : 'Save Permissions'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
