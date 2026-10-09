import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Phone,
  Mail,
  UserCheck,
  Plus,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Users,
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Parent Directory — Connected directly to Supabase public.parents & public.parent_students
 */
export default function ParentsPage() {
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [channelFilter, setChannelFilter] = useState('All');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [parentToEdit, setParentToEdit] = useState(null);
  const [parentToDelete, setParentToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form State
  const initialForm = {
    full_name: '',
    phone: '',
    email: '',
    relationship: 'Father',
    preferred_notification_channel: 'telegram',
    student_id: '', // for junction linking
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Fetch Parents with linked students, and student options
  const fetchData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Students for dropdown
      const { data: studentsData, error: stErr } = await supabase
        .from('students')
        .select('id, full_name, admission_no')
        .order('full_name');
      if (stErr) throw stErr;

      // 2. Fetch Parents with joined parent_students and students
      const { data: parentsData, error: prErr } = await supabase
        .from('parents')
        .select(`
          id,
          full_name,
          phone,
          email,
          relationship,
          preferred_notification_channel,
          is_verified,
          created_at,
          parent_students:parent_students (
            id,
            relationship,
            is_primary_contact,
            students:student_id ( id, full_name, admission_no )
          )
        `)
        .order('full_name');

      if (prErr) throw prErr;

      setStudents(studentsData || []);
      setParents(parentsData || []);
    } catch (err) {
      console.error('Error fetching parents:', err);
      setError(err.message || 'Failed to load parents from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Parents
  const filteredParents = useMemo(() => {
    return parents.filter((p) => {
      const search = searchTerm.toLowerCase().trim();
      const wardNames = (p.parent_students || [])
        .map((ps) => ps.students?.full_name?.toLowerCase() || '')
        .join(' ');

      const matchSearch =
        !search ||
        (p.full_name && p.full_name.toLowerCase().includes(search)) ||
        (p.phone && p.phone.includes(search)) ||
        (p.email && p.email.toLowerCase().includes(search)) ||
        wardNames.includes(search);

      const matchChannel =
        channelFilter === 'All' || p.preferred_notification_channel === channelFilter;

      return matchSearch && matchChannel;
    });
  }, [parents, searchTerm, channelFilter]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setModalError('');
    setFormData({
      ...initialForm,
      student_id: students[0]?.id || '',
    });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (parent) => {
    setModalError('');
    setParentToEdit(parent);
    setFormData({
      full_name: parent.full_name || '',
      phone: parent.phone || '',
      email: parent.email || '',
      relationship: parent.relationship || 'Parent',
      preferred_notification_channel: parent.preferred_notification_channel || 'telegram',
      student_id: parent.parent_students?.[0]?.students?.id || '',
    });
  };

  // Save Parent (Add or Edit)
  const handleSaveParent = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.full_name.trim()) {
      setModalError('Parent/Guardian full name is required.');
      return;
    }
    if (!formData.phone.trim()) {
      setModalError('Contact phone number is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const parentPayload = {
        full_name: formData.full_name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || null,
        relationship: formData.relationship,
        preferred_notification_channel: formData.preferred_notification_channel,
      };

      if (parentToEdit) {
        // UPDATE parent
        const { error: updateErr } = await supabase
          .from('parents')
          .update(parentPayload)
          .eq('id', parentToEdit.id);

        if (updateErr) throw updateErr;

        showToast(`Guardian details for ${parentPayload.full_name} updated!`);
        setParentToEdit(null);
      } else {
        // INSERT parent
        const { data: newParent, error: insertErr } = await supabase
          .from('parents')
          .insert([parentPayload])
          .select()
          .single();

        if (insertErr) throw insertErr;

        // If a student was selected, link in parent_students junction
        if (formData.student_id && newParent) {
          const junctionPayload = {
            parent_id: newParent.id,
            student_id: formData.student_id,
            relationship: formData.relationship,
            is_primary_contact: true,
          };

          await supabase.from('parent_students').insert([junctionPayload]);
        }

        showToast(`Guardian ${parentPayload.full_name} registered successfully!`);
        setIsAddModalOpen(false);
      }

      await fetchData();
    } catch (err) {
      console.error('Save parent error:', err);
      setModalError(err.message || 'Failed to save guardian record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Parent
  const handleConfirmDelete = async () => {
    if (!parentToDelete) return;
    setIsSubmitting(true);

    try {
      const { error: delErr } = await supabase
        .from('parents')
        .delete()
        .eq('id', parentToDelete.id);

      if (delErr) throw delErr;

      showToast(`Guardian ${parentToDelete.full_name} deleted.`);
      setParentToDelete(null);
      await fetchData();
    } catch (err) {
      console.error('Delete parent error:', err);
      alert('Failed to delete parent: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Parent Communications Directory</h1>
          <p className="page-description">
            Registered Guardian Contacts &bull; Connected to Supabase PostgreSQL (<code>public.parents</code>)
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleOpenAdd}
          >
            Register Guardian
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '16px',
            padding: '10px 16px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '6px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Database Error Banner */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            borderRadius: '6px',
            color: 'var(--status-absent)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong>Database Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div
        className="erp-card"
        style={{
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          backgroundColor: '#ffffff',
        }}
      >
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-light)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search guardians by name, phone, email, or student ward..."
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

        <div style={{ width: '200px' }}>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="form-select"
          >
            <option value="All">All Notification Channels</option>
            <option value="telegram">Telegram</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <strong>{filteredParents.length}</strong> {filteredParents.length === 1 ? 'guardian' : 'guardians'}
        </div>
      </div>

      {/* Parents Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Parent / Guardian</th>
                <th>Relationship</th>
                <th>Linked Student Wards</th>
                <th>Contact Phone</th>
                <th>Preferred Channel</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading guardians from Supabase...</div>
                  </td>
                </tr>
              ) : filteredParents.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Users size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {parents.length === 0
                        ? 'No Guardian Records in Supabase Database'
                        : 'No matching guardians found'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '420px', margin: '4px auto 16px' }}>
                      {parents.length === 0
                        ? 'Your public.parents table is currently empty. Click below to register guardian details and link student wards.'
                        : 'Try adjusting your search query or clearing the channel filter.'}
                    </div>
                    {parents.length === 0 && (
                      <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenAdd}>
                        Register First Guardian
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredParents.map((parent) => {
                  const linkedWards = (parent.parent_students || [])
                    .map((ps) => ps.students)
                    .filter(Boolean);

                  return (
                    <tr key={parent.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {parent.full_name}
                        </div>
                        {parent.email && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {parent.email}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', fontWeight: 500 }}>
                          {parent.relationship}
                        </span>
                      </td>
                      <td>
                        {linkedWards.length === 0 ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-light)', fontStyle: 'italic' }}>
                            No student linked
                          </span>
                        ) : (
                          linkedWards.map((w) => (
                            <div key={w.id} style={{ fontSize: '12px', color: 'var(--navy-900)' }}>
                              <strong>{w.full_name}</strong>{' '}
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                ({w.admission_no})
                              </span>
                            </div>
                          ))
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                          <Phone size={12} color="var(--navy-700)" />
                          <span>{parent.phone}</span>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            backgroundColor:
                              parent.preferred_notification_channel === 'telegram'
                                ? '#e0f2fe'
                                : parent.preferred_notification_channel === 'whatsapp'
                                ? '#dcfce7'
                                : '#f1f5f9',
                            color:
                              parent.preferred_notification_channel === 'telegram'
                                ? '#0369a1'
                                : parent.preferred_notification_channel === 'whatsapp'
                                ? '#15803d'
                                : '#475569',
                            textTransform: 'capitalize',
                          }}
                        >
                          {parent.preferred_notification_channel}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Edit}
                            onClick={() => handleOpenEdit(parent)}
                            title="Edit Guardian"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setParentToDelete(parent)}
                            title="Delete Guardian"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PARENT MODAL */}
      <Modal
        isOpen={isAddModalOpen || Boolean(parentToEdit)}
        onClose={() => {
          setIsAddModalOpen(false);
          setParentToEdit(null);
        }}
        title={parentToEdit ? 'Edit Guardian Details' : 'Register New Parent / Guardian'}
        subtitle="Saved directly to Supabase public.parents"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddModalOpen(false);
                setParentToEdit(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveParent}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : parentToEdit ? 'Save Changes' : 'Confirm Registration'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveParent}>
          {modalError && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                borderRadius: '6px',
                color: 'var(--status-absent)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{modalError}</span>
            </div>
          )}

          <Input
            label="Guardian Full Name"
            value={formData.full_name}
            onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            placeholder="e.g. Karthikeyan Natarajan"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Primary Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98401 23400"
              required
            />

            <Input
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="parent@domain.com"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Relationship to Student"
              value={formData.relationship}
              onChange={(e) => setFormData({ ...formData, relationship: e.target.value })}
              options={['Father', 'Mother', 'Guardian', 'Other']}
            />

            <Select
              label="Preferred Alert Channel"
              value={formData.preferred_notification_channel}
              onChange={(e) => setFormData({ ...formData, preferred_notification_channel: e.target.value })}
              options={[
                { value: 'telegram', label: 'Telegram Bot' },
                { value: 'sms', label: 'SMS' },
                { value: 'whatsapp', label: 'WhatsApp' },
                { value: 'email', label: 'Email' },
              ]}
            />
          </div>

          {!parentToEdit && (
            <Select
              label="Link to Student Ward (Optional)"
              value={formData.student_id}
              onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
              options={students.map((s) => ({
                value: s.id,
                label: `${s.full_name} (${s.admission_no})`,
              }))}
              placeholder="Select student to link..."
            />
          )}
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(parentToDelete)}
        onClose={() => setParentToDelete(null)}
        title="Confirm Guardian Deletion"
        subtitle="Supabase Row Deletion"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setParentToDelete(null)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Deleting...' : 'Delete Guardian'}
            </Button>
          </>
        }
      >
        {parentToDelete && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete guardian <strong>{parentToDelete.full_name}</strong> ({parentToDelete.phone})?
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
