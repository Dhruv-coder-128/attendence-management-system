import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Clock,
  MapPin,
  User,
  BookOpen,
  Layers,
  Edit,
  Trash2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Upload,
} from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import BulkImportModal from '../components/importer/BulkImportModal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Courses & Batches Management Page — Real Supabase Integration
 */
export default function BatchesPage({ onRefreshCounts }) {
  const [batches, setBatches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('All');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [batchToEdit, setBatchToEdit] = useState(null);
  const [batchToDelete, setBatchToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form State
  const initialForm = {
    code: '',
    name: '',
    course_id: '',
    academic_year: '2026-27',
    shift: 'Morning',
    timing: '07:30 AM – 10:30 AM',
    classroom: 'Room 101',
    max_capacity: 60,
  };
  const [formData, setFormData] = useState(initialForm);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Fetch batches and courses from Supabase
  const fetchData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Fetch courses
      const { data: coursesData, error: coursesErr } = await supabase
        .from('courses')
        .select('id, name, code, level')
        .order('name');
      if (coursesErr) throw coursesErr;

      // 2. Fetch batches with joined courses and student count
      const { data: batchesData, error: batchesErr } = await supabase
        .from('batches')
        .select(`
          id,
          code,
          name,
          course_id,
          academic_year,
          shift,
          timing,
          classroom,
          max_capacity,
          is_active,
          created_at,
          courses:course_id ( id, name, code, level ),
          students:students ( count )
        `)
        .order('created_at', { ascending: false });

      if (batchesErr) throw batchesErr;

      setCourses(coursesData || []);
      setBatches(batchesData || []);
    } catch (err) {
      console.error('Error fetching batches:', err);
      setError(err.message || 'Failed to load batches from Supabase.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (b.name && b.name.toLowerCase().includes(search)) ||
        (b.code && b.code.toLowerCase().includes(search)) ||
        (b.classroom && b.classroom.toLowerCase().includes(search)) ||
        (b.courses?.name && b.courses.name.toLowerCase().includes(search));

      const matchCourse =
        selectedCourseId === 'All' || b.course_id === selectedCourseId;

      return matchSearch && matchCourse;
    });
  }, [batches, searchTerm, selectedCourseId]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setModalError('');
    setFormData({
      ...initialForm,
      course_id: courses[0]?.id || '',
    });
    setIsCreateModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (batch) => {
    setModalError('');
    setBatchToEdit(batch);
    setFormData({
      code: batch.code || '',
      name: batch.name || '',
      course_id: batch.course_id || (courses[0]?.id || ''),
      academic_year: batch.academic_year || '2026-27',
      shift: batch.shift || 'Morning',
      timing: batch.timing || '',
      classroom: batch.classroom || '',
      max_capacity: batch.max_capacity || 60,
    });
  };

  // Save Batch (Create or Edit)
  const handleSaveBatch = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.name.trim()) {
      setModalError('Batch name is required.');
      return;
    }
    if (!formData.code.trim()) {
      setModalError('Batch code is required.');
      return;
    }
    if (!formData.course_id) {
      setModalError('Please select a course.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        name: formData.name.trim(),
        code: formData.code.trim().toUpperCase(),
        course_id: formData.course_id,
        academic_year: formData.academic_year.trim() || '2026-27',
        shift: formData.shift,
        timing: formData.timing.trim() || null,
        classroom: formData.classroom.trim() || null,
        max_capacity: Number(formData.max_capacity) || 60,
      };

      if (batchToEdit) {
        // UPDATE
        const { error: updateErr } = await supabase
          .from('batches')
          .update(payload)
          .eq('id', batchToEdit.id);

        if (updateErr) throw updateErr;

        showToast(`Batch ${payload.name} updated successfully!`);
        setBatchToEdit(null);
      } else {
        // INSERT
        const { error: insertErr } = await supabase
          .from('batches')
          .insert([payload]);

        if (insertErr) throw insertErr;

        showToast(`Batch ${payload.name} created successfully!`);
        setIsCreateModalOpen(false);
      }

      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Save batch error:', err);
      if (err.message?.includes('duplicate key') || err.message?.includes('batches_code_key')) {
        setModalError('A batch with this code already exists. Please use a unique code.');
      } else {
        setModalError(err.message || 'Failed to save batch to Supabase.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Batch
  const handleConfirmDelete = async () => {
    if (!batchToDelete) return;
    setIsSubmitting(true);

    try {
      const { error: deleteErr } = await supabase
        .from('batches')
        .delete()
        .eq('id', batchToDelete.id);

      if (deleteErr) throw deleteErr;

      showToast(`Batch ${batchToDelete.name} deleted.`);
      setBatchToDelete(null);
      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Delete batch error:', err);
      if (err.message?.includes('foreign key constraint') || err.message?.includes('students_batch_id_fkey')) {
        alert('Cannot delete this batch because it still contains enrolled students. Reassign or remove students first.');
      } else {
        alert('Failed to delete batch: ' + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses &amp; Academic Batches</h1>
          <p className="page-description">
            Cohort Allocations &bull; Connected to Supabase PostgreSQL (<code>public.batches</code>)
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
            variant="outline"
            size="md"
            icon={Upload}
            onClick={() => setIsImportModalOpen(true)}
          >
            Bulk Import
          </Button>

          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={handleOpenCreate}
          >
            Create Batch
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
            placeholder="Search batches by code, name, classroom, or course..."
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

        <div style={{ width: '220px' }}>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="form-select"
          >
            <option value="All">All Academic Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <strong>{filteredBatches.length}</strong> {filteredBatches.length === 1 ? 'batch' : 'batches'}
        </div>
      </div>

      {/* Batches Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>Batch Code</th>
                <th>Batch Name &amp; Course</th>
                <th>Shift &amp; Timings</th>
                <th>Classroom / Hall</th>
                <th style={{ width: '140px' }}>Capacity Utilization</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading batches from Supabase...</div>
                  </td>
                </tr>
              ) : filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Layers size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {batches.length === 0
                        ? 'No Batches Found in Supabase Database'
                        : 'No matching batches found'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '400px', margin: '4px auto 16px' }}>
                      {batches.length === 0
                        ? 'Your public.batches table is currently empty. Click below to create your first academic cohort.'
                        : 'Try adjusting your search query or clearing the course filter.'}
                    </div>
                    {batches.length === 0 && (
                      <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenCreate}>
                        Create First Batch
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch) => {
                  const enrolledCount = batch.students?.[0]?.count || 0;
                  const ratio = Math.round((enrolledCount / batch.max_capacity) * 100);

                  return (
                    <tr key={batch.id}>
                      <td>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '12px',
                            fontWeight: 700,
                            backgroundColor: 'var(--navy-900)',
                            color: '#fff',
                            padding: '2px 7px',
                            borderRadius: '4px',
                          }}
                        >
                          {batch.code}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {batch.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {batch.courses?.code} &bull; {batch.courses?.name}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px', fontWeight: 500 }}>
                          {batch.timing || 'Schedule pending'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {batch.shift} &bull; {batch.academic_year}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
                          <MapPin size={12} color="var(--gold-dark)" />
                          <span>{batch.classroom || 'TBD'}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <strong>{enrolledCount} / {batch.max_capacity}</strong>
                            <span style={{ color: 'var(--text-muted)' }}>{ratio}%</span>
                          </div>
                          <div
                            style={{
                              width: '100%',
                              height: '5px',
                              backgroundColor: 'var(--border-subtle)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.min(ratio, 100)}%`,
                                height: '100%',
                                backgroundColor: ratio >= 90 ? 'var(--gold-primary)' : 'var(--navy-700)',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge status={batch.is_active ? 'Present' : 'Pending'}>
                          {batch.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Edit}
                            onClick={() => handleOpenEdit(batch)}
                            title="Edit Batch"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setBatchToDelete(batch)}
                            title="Delete Batch"
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

      {/* CREATE / EDIT BATCH MODAL */}
      <Modal
        isOpen={isCreateModalOpen || Boolean(batchToEdit)}
        onClose={() => {
          setIsCreateModalOpen(false);
          setBatchToEdit(null);
        }}
        title={batchToEdit ? 'Edit Batch Cohort' : 'Create New Academic Batch'}
        subtitle="Saved directly to Supabase PostgreSQL table (public.batches)"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsCreateModalOpen(false);
                setBatchToEdit(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveBatch}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : batchToEdit ? 'Save Changes' : 'Create Batch'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveBatch}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
            <Input
              label="Batch Code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              placeholder="FYBCA-A"
              required
            />
            <Input
              label="Batch Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="FY-BCA Morning Batch A"
              required
            />
          </div>

          <Select
            label="Belongs to Course"
            value={formData.course_id}
            onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
            options={courses.map((c) => ({
              value: c.id,
              label: `${c.code} — ${c.name} (${c.level})`,
            }))}
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Academic Shift"
              value={formData.shift}
              onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
              options={['Morning', 'Afternoon', 'Evening']}
            />
            <Input
              label="Academic Year"
              value={formData.academic_year}
              onChange={(e) => setFormData({ ...formData, academic_year: e.target.value })}
              placeholder="2026-27"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Session Timings"
              value={formData.timing}
              onChange={(e) => setFormData({ ...formData, timing: e.target.value })}
              placeholder="07:30 AM – 11:30 AM"
            />
            <Input
              label="Classroom / Hall"
              value={formData.classroom}
              onChange={(e) => setFormData({ ...formData, classroom: e.target.value })}
              placeholder="Lab Alpha / Room 201"
            />
          </div>

          <Input
            label="Maximum Student Capacity"
            type="number"
            value={formData.max_capacity}
            onChange={(e) => setFormData({ ...formData, max_capacity: e.target.value })}
            placeholder="60"
            required
          />
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(batchToDelete)}
        onClose={() => setBatchToDelete(null)}
        title="Confirm Batch Deletion"
        subtitle="Supabase Row Deletion"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBatchToDelete(null)}
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
              {isSubmitting ? 'Deleting...' : 'Delete Batch'}
            </Button>
          </>
        }
      >
        {batchToDelete && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Are you sure you want to delete batch <strong>{batchToDelete.name}</strong> (<code>{batchToDelete.code}</code>)?
            </div>
            <div
              style={{
                marginTop: '12px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                borderRadius: '6px',
                border: '1px solid var(--status-absent-border)',
                fontSize: '12px',
                color: 'var(--status-absent)',
              }}
            >
              <strong>Warning:</strong> Deleting a batch requires that no students or attendance records reference it. This action cannot be undone.
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialEntity="batches"
        onImportSuccess={() => {
          fetchData();
          if (onRefreshCounts) onRefreshCounts();
          showToast('Batches bulk import completed successfully!');
        }}
      />
    </div>
  );
}
