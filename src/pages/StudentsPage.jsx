import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Eye,
  Edit,
  Trash2,
  Phone,
  Mail,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Search,
  BookOpen,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Layers,
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
 * Students Directory Page — Connected directly to Supabase PostgreSQL
 */
export default function StudentsPage({ onRefreshCounts }) {
  // Supabase Data State
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('All');
  const [selectedBatchId, setSelectedBatchId] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Modal States
  const [activeViewStudent, setActiveViewStudent] = useState(null);
  const [studentToEdit, setStudentToEdit] = useState(null);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  // Form State for Add / Edit
  const initialFormState = {
    full_name: '',
    admission_no: '',
    roll_no: '',
    course_id: '',
    batch_id: '',
    phone: '',
    email: '',
    gender: 'Male',
    dob: '',
    enrollment_date: new Date().toISOString().split('T')[0],
    blood_group: 'O+',
    status: 'active',
    address: '',
  };
  const [formData, setFormData] = useState(initialFormState);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch Students, Courses, and Batches from Supabase
  const fetchData = async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Please check .env.local.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch Courses
      const { data: coursesData, error: coursesErr } = await supabase
        .from('courses')
        .select('id, name, code, level')
        .order('name');
      if (coursesErr) throw coursesErr;

      // Fetch Batches
      const { data: batchesData, error: batchesErr } = await supabase
        .from('batches')
        .select('id, name, code, course_id, timing, classroom')
        .order('name');
      if (batchesErr) throw batchesErr;

      // Fetch Students with relational joins to Course and Batch
      const { data: studentsData, error: studentsErr } = await supabase
        .from('students')
        .select(`
          id,
          admission_no,
          full_name,
          roll_no,
          course_id,
          batch_id,
          gender,
          dob,
          email,
          phone,
          blood_group,
          address,
          enrollment_date,
          status,
          created_at,
          courses:course_id ( id, name, code, level ),
          batches:batch_id ( id, name, code, timing, classroom )
        `)
        .order('created_at', { ascending: false });

      if (studentsErr) throw studentsErr;

      setCourses(coursesData || []);
      setBatches(batchesData || []);
      setStudents(studentsData || []);
    } catch (err) {
      console.error('Error fetching student data:', err);
      setError(err.message || 'Failed to load students from Supabase database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to initialize default starter batches if batches table is empty
  const handleInitializeDefaultBatches = async () => {
    if (courses.length === 0) {
      alert('Please wait for courses to load.');
      return;
    }

    try {
      setIsSubmitting(true);
      const bcaCourse = courses.find((c) => c.code === 'FY-BCA') || courses[0];
      const sciCourse = courses.find((c) => c.code === '11TH-SCI') || courses[0];

      const starterBatches = [
        {
          course_id: bcaCourse.id,
          name: 'FY-BCA Morning Batch A',
          code: 'FYBCA-A',
          timing: '07:30 AM – 11:30 AM',
          classroom: 'Lab Alpha (Room 201)',
          max_capacity: 60,
        },
        {
          course_id: sciCourse.id,
          name: '11th Science Morning Batch S1',
          code: '11SCI-S1',
          timing: '08:00 AM – 12:00 PM',
          classroom: 'Lecture Hall 1',
          max_capacity: 60,
        },
      ];

      const { data, error: insertErr } = await supabase.from('batches').insert(starterBatches).select();
      if (insertErr) throw insertErr;

      showToast('Starter batches created successfully!');
      await fetchData();
    } catch (err) {
      alert('Failed to initialize batches: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Client-side Search and Filtering
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      // Keyword Search
      const search = searchTerm.toLowerCase().trim();
      const matchSearch =
        !search ||
        (student.full_name && student.full_name.toLowerCase().includes(search)) ||
        (student.admission_no && student.admission_no.toLowerCase().includes(search)) ||
        (student.roll_no && student.roll_no.toLowerCase().includes(search)) ||
        (student.phone && student.phone.includes(search)) ||
        (student.email && student.email.toLowerCase().includes(search));

      // Course Filter
      const matchCourse =
        selectedCourseId === 'All' || student.course_id === selectedCourseId;

      // Batch Filter
      const matchBatch =
        selectedBatchId === 'All' || student.batch_id === selectedBatchId;

      // Status Filter
      const matchStatus =
        selectedStatus === 'All' || student.status === selectedStatus;

      return matchSearch && matchCourse && matchBatch && matchStatus;
    });
  }, [students, searchTerm, selectedCourseId, selectedBatchId, selectedStatus]);

  // Open Add Modal
  const handleOpenAdd = () => {
    setModalError('');
    setFormData({
      ...initialFormState,
      course_id: courses[0]?.id || '',
      batch_id: batches[0]?.id || '',
      admission_no: `RUP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    });
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (student) => {
    setModalError('');
    setStudentToEdit(student);
    setFormData({
      full_name: student.full_name || '',
      admission_no: student.admission_no || '',
      roll_no: student.roll_no || '',
      course_id: student.course_id || (courses[0]?.id || ''),
      batch_id: student.batch_id || (batches[0]?.id || ''),
      phone: student.phone || '',
      email: student.email || '',
      gender: student.gender || 'Male',
      dob: student.dob || '',
      enrollment_date: student.enrollment_date || new Date().toISOString().split('T')[0],
      blood_group: student.blood_group || 'O+',
      status: student.status || 'active',
      address: student.address || '',
    });
  };

  // Save Student (Add or Edit)
  const handleSaveStudent = async (e) => {
    e.preventDefault();
    setModalError('');

    if (!formData.full_name.trim()) {
      setModalError('Student full name is required.');
      return;
    }
    if (!formData.admission_no.trim()) {
      setModalError('Admission number / Student ID is required.');
      return;
    }
    if (!formData.course_id) {
      setModalError('Please select a course.');
      return;
    }
    if (!formData.batch_id) {
      setModalError('Please select a batch.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        full_name: formData.full_name.trim(),
        admission_no: formData.admission_no.trim(),
        roll_no: formData.roll_no.trim() || null,
        course_id: formData.course_id,
        batch_id: formData.batch_id,
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        gender: formData.gender,
        dob: formData.dob || null,
        enrollment_date: formData.enrollment_date || new Date().toISOString().split('T')[0],
        blood_group: formData.blood_group || null,
        status: formData.status,
        address: formData.address.trim() || null,
      };

      if (studentToEdit) {
        // UPDATE existing student in Supabase
        const { error: updateErr } = await supabase
          .from('students')
          .update(payload)
          .eq('id', studentToEdit.id);

        if (updateErr) throw updateErr;

        showToast(`Student record for ${payload.full_name} updated successfully!`);
        setStudentToEdit(null);
      } else {
        // INSERT new student in Supabase
        const { error: insertErr } = await supabase
          .from('students')
          .insert([payload]);

        if (insertErr) throw insertErr;

        showToast(`Student ${payload.full_name} enrolled successfully in Supabase!`);
        setIsAddModalOpen(false);
      }

      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Save student error:', err);
      if (err.message?.includes('duplicate key') || err.message?.includes('students_admission_no_key')) {
        setModalError('A student with this Admission Number already exists. Please use a unique ID.');
      } else {
        setModalError(err.message || 'Failed to save student record to Supabase.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Student
  const handleConfirmDelete = async () => {
    if (!studentToDelete) return;
    setIsSubmitting(true);

    try {
      const { error: deleteErr } = await supabase
        .from('students')
        .delete()
        .eq('id', studentToDelete.id);

      if (deleteErr) throw deleteErr;

      showToast(`Student ${studentToDelete.full_name} deleted from database.`);
      setStudentToDelete(null);
      await fetchData();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      console.error('Delete student error:', err);
      alert('Failed to delete student: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Batches filtered by chosen course for the Form
  const availableBatchesForCourse = useMemo(() => {
    if (!formData.course_id) return batches;
    return batches.filter((b) => b.course_id === formData.course_id);
  }, [batches, formData.course_id]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Student Directory</h1>
          <p className="page-description">
            Live Student Registry &bull; Connected to Supabase PostgreSQL (<code>public.students</code>)
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
            onClick={handleOpenAdd}
          >
            Add Student
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

      {/* If No Batches in DB prompt */}
      {!loading && batches.length === 0 && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#92400e' }}>
            <Layers size={18} />
            <span>
              <strong>Note:</strong> No academic batches found in <code>public.batches</code> table. Students require an assigned batch.
            </span>
          </div>
          <Button
            variant="gold"
            size="sm"
            onClick={handleInitializeDefaultBatches}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Initialize Starter Batches'}
          </Button>
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
        {/* Search */}
        <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-light)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by student name, admission no, roll no, or phone..."
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

        {/* Course Filter */}
        <div style={{ width: '180px' }}>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="form-select"
          >
            <option value="All">All Courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Batch Filter */}
        <div style={{ width: '180px' }}>
          <select
            value={selectedBatchId}
            onChange={(e) => setSelectedBatchId(e.target.value)}
            className="form-select"
          >
            <option value="All">All Batches</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div style={{ width: '140px' }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="form-select"
          >
            <option value="All">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="graduated">Graduated</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <strong>{filteredStudents.length}</strong> {filteredStudents.length === 1 ? 'student' : 'students'}
        </div>
      </div>

      {/* Main Student Data Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Admission No</th>
                <th>Student Name</th>
                <th>Course &amp; Batch</th>
                <th>Roll No</th>
                <th>Contact Phone</th>
                <th>Admission Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading records from Supabase...</div>
                  </td>
                </tr>
              ) : filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <UserCheck size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      {students.length === 0
                        ? 'No Student Records in Supabase Database'
                        : 'No matching student records found'}
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '400px', margin: '4px auto 16px' }}>
                      {students.length === 0
                        ? 'Your PostgreSQL table (public.students) is currently empty. Click below to add your first student record.'
                        : 'Try adjusting your search keyword or clearing the course and batch filters.'}
                    </div>
                    {students.length === 0 && (
                      <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenAdd}>
                        Add First Student
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredStudents.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: 'var(--navy-900)' }}>
                        {student.admission_no}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                        {student.full_name}
                      </div>
                      {student.email && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {student.email}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-800)' }}>
                        {student.courses?.code || 'Unassigned Course'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {student.batches?.name || 'Unassigned Batch'}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      {student.roll_no || '—'}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {student.phone ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={11} color="var(--navy-700)" /> {student.phone}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-light)' }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {student.enrollment_date || '—'}
                    </td>
                    <td>
                      <Badge
                        status={
                          student.status === 'active'
                            ? 'Present'
                            : student.status === 'suspended'
                            ? 'Absent'
                            : 'Pending'
                        }
                      >
                        {student.status}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Eye}
                          onClick={() => setActiveViewStudent(student)}
                          title="View Profile Dossier"
                        >
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Edit}
                          onClick={() => handleOpenEdit(student)}
                          title="Edit Student"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={Trash2}
                          onClick={() => setStudentToDelete(student)}
                          title="Delete Student"
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* VIEW STUDENT DOSSIER MODAL */}
      <Modal
        isOpen={Boolean(activeViewStudent)}
        onClose={() => setActiveViewStudent(null)}
        title="Student Profile Dossier"
        subtitle={activeViewStudent ? `${activeViewStudent.full_name} (${activeViewStudent.admission_no})` : ''}
        footer={
          <Button variant="outline" size="sm" onClick={() => setActiveViewStudent(null)}>
            Close Dossier
          </Button>
        }
      >
        {activeViewStudent && (
          <div>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                padding: '16px',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-light)',
                  border: '2px solid var(--gold-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {activeViewStudent.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  {activeViewStudent.full_name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {activeViewStudent.courses?.name || 'Course'} &bull; {activeViewStudent.batches?.name || 'Batch'}
                </div>
                <div style={{ marginTop: '6px' }}>
                  <Badge
                    status={activeViewStudent.status === 'active' ? 'Present' : 'Pending'}
                  >
                    {activeViewStudent.status}
                  </Badge>
                </div>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                fontSize: '13px',
              }}
            >
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Admission Number / Student ID
                </span>
                <strong style={{ fontFamily: 'var(--font-mono)' }}>{activeViewStudent.admission_no}</strong>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Roll Number
                </span>
                <span>{activeViewStudent.roll_no || 'Not assigned'}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Academic Course
                </span>
                <span>{activeViewStudent.courses?.name || '—'}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Batch &amp; Timings
                </span>
                <span>{activeViewStudent.batches?.name || '—'} ({activeViewStudent.batches?.timing || 'Standard'})</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Primary Contact Phone
                </span>
                <span>{activeViewStudent.phone || '—'}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Student Email
                </span>
                <span>{activeViewStudent.email || '—'}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Gender &amp; Date of Birth
                </span>
                <span>{activeViewStudent.gender || '—'} {activeViewStudent.dob ? `(${activeViewStudent.dob})` : ''}</span>
              </div>

              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Admission Date &amp; Blood Group
                </span>
                <span>{activeViewStudent.enrollment_date || '—'} &bull; {activeViewStudent.blood_group || 'O+'}</span>
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Residential Address
                </span>
                <span>{activeViewStudent.address || 'Not provided'}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ADD / EDIT STUDENT MODAL */}
      <Modal
        isOpen={isAddModalOpen || Boolean(studentToEdit)}
        onClose={() => {
          setIsAddModalOpen(false);
          setStudentToEdit(null);
        }}
        title={studentToEdit ? 'Edit Student Record' : 'Register New Student Admission'}
        subtitle="Saved directly to Supabase PostgreSQL table (public.students)"
        maxWidth="640px"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAddModalOpen(false);
                setStudentToEdit(null);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSaveStudent}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving to Supabase...' : studentToEdit ? 'Save Changes' : 'Confirm Admission'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveStudent}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Student Full Name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="e.g. Aarav Karthikeyan"
              required
            />

            <Input
              label="Admission Number / Student ID"
              value={formData.admission_no}
              onChange={(e) => setFormData({ ...formData, admission_no: e.target.value })}
              placeholder="e.g. RUP-2026-0101"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Academic Course"
              value={formData.course_id}
              onChange={(e) => {
                const newCourseId = e.target.value;
                const matchingBatches = batches.filter((b) => b.course_id === newCourseId);
                setFormData({
                  ...formData,
                  course_id: newCourseId,
                  batch_id: matchingBatches[0]?.id || (batches[0]?.id || ''),
                });
              }}
              options={courses.map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name}`,
              }))}
              required
            />

            <Select
              label="Assigned Batch"
              value={formData.batch_id}
              onChange={(e) => setFormData({ ...formData, batch_id: e.target.value })}
              options={
                availableBatchesForCourse.length > 0
                  ? availableBatchesForCourse.map((b) => ({
                      value: b.id,
                      label: `${b.code} — ${b.name}`,
                    }))
                  : batches.map((b) => ({
                      value: b.id,
                      label: `${b.code} — ${b.name}`,
                    }))
              }
              placeholder={batches.length === 0 ? 'No batches available' : 'Select Batch...'}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Roll Number (Optional)"
              value={formData.roll_no}
              onChange={(e) => setFormData({ ...formData, roll_no: e.target.value })}
              placeholder="e.g. 24"
            />

            <Input
              label="Contact Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+91 98401 23450"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Student Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="student@ruparel.edu"
            />

            <Input
              label="Admission Date"
              type="date"
              value={formData.enrollment_date}
              onChange={(e) => setFormData({ ...formData, enrollment_date: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Select
              label="Gender"
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              options={['Male', 'Female', 'Other']}
            />

            <Select
              label="Blood Group"
              value={formData.blood_group}
              onChange={(e) => setFormData({ ...formData, blood_group: e.target.value })}
              options={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']}
            />

            <Select
              label="Status"
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'graduated', label: 'Graduated' },
              ]}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Residential Address</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="e.g. Matunga West, Mumbai"
            />
          </div>
        </form>
      </Modal>

      {/* DELETE CONFIRMATION MODAL */}
      <Modal
        isOpen={Boolean(studentToDelete)}
        onClose={() => setStudentToDelete(null)}
        title="Confirm Student Removal"
        subtitle="Supabase Row Deletion"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStudentToDelete(null)}
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
              {isSubmitting ? 'Deleting...' : 'Delete Student Record'}
            </Button>
          </>
        }
      >
        {studentToDelete && (
          <div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Are you sure you want to delete student <strong>{studentToDelete.full_name}</strong> (Admission ID: <code>{studentToDelete.admission_no}</code>)?
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
              <strong>Warning:</strong> This will permanently delete the student from your Supabase <code>public.students</code> table and cascade-remove any associated attendance or parent links. This action cannot be undone.
            </div>
          </div>
        )}
      </Modal>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialEntity="students"
        onImportSuccess={() => {
          fetchData();
          if (onRefreshCounts) onRefreshCounts();
          showToast('Bulk student import completed successfully!');
        }}
      />
    </div>
  );
}
