import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Award,
  Plus,
  RefreshCw,
  Search,
  Edit,
  Trash2,
  Calendar,
  BookOpen,
  Send,
  Printer,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Sparkles,
  Users,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import ReportCardModal from '../components/exams/ReportCardModal';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  fetchExams,
  saveExam,
  deleteExam,
  fetchExamBatchMarks,
  saveExamMarks,
  computeExamResult,
} from '../lib/examService';
import { sendExamResultsTelegram } from '../lib/telegramClient';

export default function ExamsPage() {
  const [exams, setExams] = useState([]);
  const [courses, setCourses] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('All');
  const [selectedBatchId, setSelectedBatchId] = useState('All');
  const [selectedType, setSelectedType] = useState('All');

  // Create / Edit Modal State
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);
  const [examToEdit, setExamToEdit] = useState(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [examToDelete, setExamToDelete] = useState(null);
  const [examFormError, setExamFormError] = useState('');

  const initialExamForm = {
    name: '',
    exam_type: 'Unit Test',
    course_id: '',
    batch_id: '',
    subject: '',
    exam_date: new Date().toISOString().split('T')[0],
    total_marks: 100,
    passing_marks: 35,
    academic_year: '2026-27',
    description: '',
  };
  const [examFormData, setExamFormData] = useState(initialExamForm);

  // Batch Marks Entry State
  const [activeMarksExam, setActiveMarksExam] = useState(null);
  const [marksRows, setMarksRows] = useState([]);
  const [marksLoading, setMarksLoading] = useState(false);
  const [isSavingMarks, setIsSavingMarks] = useState(false);
  const [isDispatchingTelegram, setIsDispatchingTelegram] = useState(false);

  // Report Card Modal State
  const [reportCardStudent, setReportCardStudent] = useState(null);
  const [reportCardExam, setReportCardExam] = useState(null);
  const [reportCardMark, setReportCardMark] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Fetch Courses, Batches, and Exams
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSupabaseConfigured && supabase) {
        const [cRes, bRes] = await Promise.all([
          supabase.from('courses').select('id, name, code, level').order('name'),
          supabase.from('batches').select('id, name, code, course_id, timing').order('name'),
        ]);
        if (cRes.data) setCourses(cRes.data);
        if (bRes.data) setBatches(bRes.data);
      }

      const examList = await fetchExams({
        courseId: selectedCourseId,
        batchId: selectedBatchId,
        examType: selectedType,
      });
      setExams(examList);
    } catch (err) {
      console.error('Error loading exams data:', err);
      setError(err.message || 'Failed to load examinations from database.');
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, selectedBatchId, selectedType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Create Exam
  const handleOpenCreateExam = () => {
    setExamFormError('');
    setExamToEdit(null);
    setExamFormData({
      ...initialExamForm,
      course_id: courses[0]?.id || '',
      batch_id: batches[0]?.id || '',
    });
    setIsExamModalOpen(true);
  };

  // Open Edit Exam
  const handleOpenEditExam = (exam) => {
    setExamFormError('');
    setExamToEdit(exam);
    setExamFormData({
      name: exam.name || '',
      exam_type: exam.exam_type || 'Unit Test',
      course_id: exam.course_id || (courses[0]?.id || ''),
      batch_id: exam.batch_id || '',
      subject: exam.subject || '',
      exam_date: exam.exam_date || new Date().toISOString().split('T')[0],
      total_marks: exam.total_marks || 100,
      passing_marks: exam.passing_marks || 35,
      academic_year: exam.academic_year || '2026-27',
      description: exam.description || '',
    });
    setIsExamModalOpen(true);
  };

  // Save Exam (Create / Edit)
  const handleSaveExam = async (e) => {
    e.preventDefault();
    setExamFormError('');

    if (!examFormData.name.trim()) {
      setExamFormError('Exam title is required.');
      return;
    }
    if (!examFormData.course_id) {
      setExamFormError('Please select a course for this examination.');
      return;
    }
    if (Number(examFormData.passing_marks) > Number(examFormData.total_marks)) {
      setExamFormError('Passing marks cannot exceed maximum total marks.');
      return;
    }

    setIsSavingExam(true);
    try {
      await saveExam({
        ...examFormData,
        id: examToEdit?.id,
      });
      showToast(examToEdit ? 'Exam updated successfully!' : 'Examination created successfully!');
      setIsExamModalOpen(false);
      loadData();
    } catch (err) {
      setExamFormError(err.message || 'Failed to save examination record.');
    } finally {
      setIsSavingExam(false);
    }
  };

  // Confirm Delete Exam
  const handleConfirmDelete = async () => {
    if (!examToDelete) return;
    try {
      await deleteExam(examToDelete.id);
      showToast(`Deleted examination ${examToDelete.name}`);
      setExamToDelete(null);
      loadData();
    } catch (err) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Open Batch Marks Entry
  const handleOpenMarksEntry = async (exam) => {
    setActiveMarksExam(exam);
    setMarksLoading(true);
    try {
      const rows = await fetchExamBatchMarks(exam.id, exam.batch_id, exam.course_id);
      setMarksRows(rows);
    } catch (err) {
      console.error('Failed to load marks rows:', err);
    } finally {
      setMarksLoading(false);
    }
  };

  // Update a student's marks row in memory
  const handleMarkChange = (studentId, field, value) => {
    setMarksRows((prev) =>
      prev.map((row) => {
        if (row.student_id !== studentId) return row;
        if (field === 'is_absent') {
          return {
            ...row,
            is_absent: value,
            marks_obtained: value ? '' : row.marks_obtained,
          };
        }
        if (field === 'marks_obtained') {
          // Validate range: 0 <= value <= total_marks
          let num = value === '' ? '' : Number(value);
          if (num !== '' && num > Number(activeMarksExam?.total_marks || 100)) {
            num = Number(activeMarksExam?.total_marks || 100);
          }
          if (num !== '' && num < 0) {
            num = 0;
          }
          return {
            ...row,
            marks_obtained: num,
            is_absent: false,
          };
        }
        return { ...row, [field]: value };
      })
    );
  };

  // Save All Marks in Batch
  const handleSaveAllMarks = async () => {
    if (!activeMarksExam) return;
    setIsSavingMarks(true);
    try {
      const res = await saveExamMarks(activeMarksExam.id, marksRows);
      showToast(`Saved marks for ${res.count} student(s) successfully!`);
      // Reload rows to sync IDs
      const updated = await fetchExamBatchMarks(
        activeMarksExam.id,
        activeMarksExam.batch_id,
        activeMarksExam.course_id
      );
      setMarksRows(updated);
    } catch (err) {
      alert('Failed to save marks: ' + err.message);
    } finally {
      setIsSavingMarks(false);
    }
  };

  // Dispatch Telegram Results for Exam
  const handleDispatchTelegram = async (exam) => {
    if (!confirm(`Send official Telegram exam result notifications for "${exam.name}" to all verified guardians?`)) {
      return;
    }
    setIsDispatchingTelegram(true);
    try {
      let currentMarks = marksRows;
      if (!activeMarksExam || activeMarksExam.id !== exam.id || currentMarks.length === 0) {
        currentMarks = await fetchExamBatchMarks(exam.id, exam.batch_id, exam.course_id);
      }

      const res = await sendExamResultsTelegram({
        examId: exam.id,
        examData: exam,
        marksData: currentMarks,
      });

      if (res.success) {
        showToast(res.message);
      } else {
        showToast(res.error || 'Failed to dispatch exam notifications.');
      }
    } catch (err) {
      showToast('Error dispatching notifications: ' + err.message);
    } finally {
      setIsDispatchingTelegram(false);
    }
  };

  // Computed summary metrics for the active marks batch
  const batchStats = useMemo(() => {
    if (!activeMarksExam || marksRows.length === 0) {
      return { total: 0, graded: 0, passed: 0, failed: 0, absent: 0, avgPct: 0 };
    }
    const total = marksRows.length;
    let graded = 0;
    let passed = 0;
    let failed = 0;
    let absent = 0;
    let totalScore = 0;
    let scoredCount = 0;

    marksRows.forEach((row) => {
      if (row.is_absent) {
        absent++;
        graded++;
      } else if (row.marks_obtained !== '' && row.marks_obtained !== null) {
        graded++;
        const score = Number(row.marks_obtained);
        totalScore += score;
        scoredCount++;
        if (score >= Number(activeMarksExam.passing_marks || 35)) {
          passed++;
        } else {
          failed++;
        }
      }
    });

    const max = Number(activeMarksExam.total_marks || 100);
    const avgScore = scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : 0;
    const avgPct = max > 0 ? Math.round((avgScore / max) * 100) : 0;

    return { total, graded, passed, failed, absent, avgScore, avgPct };
  }, [marksRows, activeMarksExam]);

  // Client-side search filtering
  const filteredExams = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return exams.filter((e) => {
      const matchSearch =
        !q ||
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.subject && e.subject.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q));

      const matchCourse = selectedCourseId === 'All' || e.course_id === selectedCourseId;
      const matchBatch = selectedBatchId === 'All' || e.batch_id === selectedBatchId;
      const matchType = selectedType === 'All' || e.exam_type === selectedType;

      return matchSearch && matchCourse && matchBatch && matchType;
    });
  }, [exams, searchTerm, selectedCourseId, selectedBatchId, selectedType]);

  // Batches for the modal form filtered by selected course
  const formBatches = useMemo(() => {
    if (!examFormData.course_id) return batches;
    return batches.filter((b) => b.course_id === examFormData.course_id);
  }, [batches, examFormData.course_id]);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Exams</h1>
          <p className="page-description">
            Schedule examinations, record batch marks, and generate student report cards
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenCreateExam}>
            Create Exam
          </Button>
        </div>
      </div>

      {/* Toast Feedback */}
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
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Banner */}
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
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} />
          <div>{error}</div>
        </div>
      )}

      {/* Filters Bar */}
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
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-light)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search exam by title, subject, or syllabus..."
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

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

        <div style={{ width: '150px' }}>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="form-select"
          >
            <option value="All">All Types</option>
            <option value="Unit Test">Unit Test</option>
            <option value="Mid-Term">Mid-Term</option>
            <option value="Prelim">Prelim</option>
            <option value="Final">Final</option>
            <option value="Quiz">Quiz</option>
          </select>
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          <strong>{filteredExams.length}</strong> {filteredExams.length === 1 ? 'exam' : 'exams'}
        </div>
      </div>

      {/* Main Exams Table */}
      <div className="table-container">
        <div className="erp-table-scroll">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Exam Title &amp; Subject</th>
                <th>Type</th>
                <th>Course &amp; Cohort</th>
                <th>Exam Date</th>
                <th>Marks Scheme</th>
                <th>Term</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading examinations...</div>
                  </td>
                </tr>
              ) : filteredExams.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Award size={36} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      No Examinations Scheduled
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px', maxWidth: '380px', margin: '4px auto 16px' }}>
                      Create your first unit test or term examination schedule to record marks and dispatch guardian reports.
                    </div>
                    <Button variant="primary" size="sm" icon={Plus} onClick={handleOpenCreateExam}>
                      Create Examination
                    </Button>
                  </td>
                </tr>
              ) : (
                filteredExams.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                        {exam.name}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Subject: <strong>{exam.subject || 'All Subjects'}</strong>
                        {exam.description ? ` • ${exam.description}` : ''}
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
                            exam.exam_type === 'Final'
                              ? '#fef3c7'
                              : exam.exam_type === 'Mid-Term'
                              ? '#e0f2fe'
                              : '#f1f5f9',
                          color:
                            exam.exam_type === 'Final'
                              ? '#92400e'
                              : exam.exam_type === 'Mid-Term'
                              ? '#0369a1'
                              : 'var(--navy-900)',
                        }}
                      >
                        {exam.exam_type}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-900)' }}>
                        {exam.courses?.code || 'All Courses'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {exam.batches?.name || 'Whole Stream Cohort'}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} color="var(--navy-700)" />
                        {exam.exam_date}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        Max: <strong>{exam.total_marks}</strong> &bull; Pass: {exam.passing_marks}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {exam.academic_year || '2026-27'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={FileSpreadsheet}
                          onClick={() => handleOpenMarksEntry(exam)}
                          title="Enter Batch Student Marks"
                        >
                          Marks Entry
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          icon={Send}
                          onClick={() => handleDispatchTelegram(exam)}
                          disabled={isDispatchingTelegram}
                          title="Dispatch Results via Telegram to Guardians"
                        >
                          Telegram
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          icon={Edit}
                          onClick={() => handleOpenEditExam(exam)}
                          title="Edit Examination"
                        >
                          Edit
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          icon={Trash2}
                          onClick={() => setExamToDelete(exam)}
                          title="Delete Examination"
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

      {/* CREATE / EDIT EXAM MODAL */}
      <Modal
        isOpen={isExamModalOpen}
        onClose={() => setIsExamModalOpen(false)}
        title={examToEdit ? 'Edit Examination Schedule' : 'Create New Examination'}
        subtitle="Schedule tests, term exams, and academic assessments"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsExamModalOpen(false)} disabled={isSavingExam}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveExam} disabled={isSavingExam}>
              {isSavingExam ? 'Saving...' : examToEdit ? 'Save Changes' : 'Schedule Exam'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveExam}>
          {examFormError && (
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
              <span>{examFormError}</span>
            </div>
          )}

          <Input
            label="Examination Title"
            value={examFormData.name}
            onChange={(e) => setExamFormData({ ...examFormData, name: e.target.value })}
            placeholder="e.g. Term 1 Unit Test — Advanced Mathematics"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Examination Type"
              value={examFormData.exam_type}
              onChange={(e) => setExamFormData({ ...examFormData, exam_type: e.target.value })}
              options={['Unit Test', 'Mid-Term', 'Prelim', 'Final', 'Quiz', 'Other']}
            />

            <Input
              label="Subject / Academic Topic"
              value={examFormData.subject}
              onChange={(e) => setExamFormData({ ...examFormData, subject: e.target.value })}
              placeholder="e.g. Physics, DBMS, Accounts"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Course Stream"
              value={examFormData.course_id}
              onChange={(e) =>
                setExamFormData({
                  ...examFormData,
                  course_id: e.target.value,
                  batch_id: '',
                })
              }
              options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
              placeholder="Select course..."
              required
            />

            <Select
              label="Cohort Batch (Optional)"
              value={examFormData.batch_id}
              onChange={(e) => setExamFormData({ ...examFormData, batch_id: e.target.value })}
              options={formBatches.map((b) => ({ value: b.id, label: `${b.code} — ${b.name}` }))}
              placeholder="All Batches in Stream..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Input
              label="Exam Date"
              type="date"
              value={examFormData.exam_date}
              onChange={(e) => setExamFormData({ ...examFormData, exam_date: e.target.value })}
              required
            />

            <Input
              label="Total Marks"
              type="number"
              min="1"
              value={examFormData.total_marks}
              onChange={(e) => setExamFormData({ ...examFormData, total_marks: e.target.value })}
              required
            />

            <Input
              label="Passing Marks"
              type="number"
              min="0"
              value={examFormData.passing_marks}
              onChange={(e) => setExamFormData({ ...examFormData, passing_marks: e.target.value })}
              required
            />
          </div>

          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--navy-900)', marginBottom: '4px' }}>
              Exam Description / Syllabus Notes (Optional)
            </label>
            <textarea
              className="form-input"
              rows={2}
              value={examFormData.description}
              onChange={(e) => setExamFormData({ ...examFormData, description: e.target.value })}
              placeholder="e.g. Topics: Units 1-4, Theory & Practical exercises..."
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE MODAL */}
      <Modal
        isOpen={Boolean(examToDelete)}
        onClose={() => setExamToDelete(null)}
        title="Confirm Examination Deletion"
        subtitle="PostgreSQL Cascade Delete"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setExamToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
              Delete Exam
            </Button>
          </>
        }
      >
        {examToDelete && (
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Are you sure you want to delete examination <strong>{examToDelete.name}</strong>?
            All entered student marks and records for this assessment will be removed.
          </div>
        )}
      </Modal>

      {/* BATCH-WISE MARKS ENTRY MODAL */}
      {activeMarksExam && (
        <Modal
          isOpen={Boolean(activeMarksExam)}
          onClose={() => setActiveMarksExam(null)}
          title={`Marks Entry — ${activeMarksExam.name}`}
          subtitle={`Subject: ${activeMarksExam.subject || 'All Subjects'} • Max Marks: ${activeMarksExam.total_marks} • Pass: ${activeMarksExam.passing_marks}`}
          maxWidth="940px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {batchStats.graded} of {batchStats.total} graded &bull; Class Avg: <strong>{batchStats.avgPct}%</strong>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Send}
                  onClick={() => handleDispatchTelegram(activeMarksExam)}
                  disabled={isDispatchingTelegram || batchStats.graded === 0}
                  title="Dispatch results to verified guardians on Telegram"
                >
                  {isDispatchingTelegram ? 'Dispatching...' : 'Dispatch Telegram Results'}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveMarksExam(null)}
                  disabled={isSavingMarks}
                >
                  Close
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveAllMarks}
                  disabled={isSavingMarks || marksRows.length === 0}
                >
                  {isSavingMarks ? 'Saving...' : 'Save All Marks'}
                </Button>
              </div>
            </div>
          }
        >
          <div>
            {/* Quick Summary Ribbon */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '8px',
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                fontSize: '11px',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total Students</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  {batchStats.total}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Graded Count</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-900)' }}>
                  {batchStats.graded}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--status-present)' }}>Passed</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-present)' }}>
                  {batchStats.passed}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--status-absent)' }}>Failed</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-absent)' }}>
                  {batchStats.failed}
                </div>
              </div>

              <div>
                <span style={{ color: '#d97706' }}>Absent</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#d97706' }}>
                  {batchStats.absent}
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)' }}>Class Average</span>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  {batchStats.avgPct}%
                </div>
              </div>
            </div>

            {/* Marks Entry Table */}
            {marksLoading ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                <RefreshCw size={22} className="animate-spin" style={{ marginBottom: '8px' }} />
                <div>Loading cohort student roster...</div>
              </div>
            ) : marksRows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                <Users size={32} style={{ marginBottom: '8px' }} />
                <div>No active students assigned to this course or batch.</div>
              </div>
            ) : (
              <div style={{ maxHeight: '55vh', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}>
                <table className="erp-table" style={{ margin: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: '#f8fafc' }}>
                    <tr>
                      <th style={{ width: '110px' }}>Adm No</th>
                      <th>Student Name</th>
                      <th style={{ width: '60px' }}>Roll</th>
                      <th style={{ width: '110px' }}>Marks Scored</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Absent?</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>%</th>
                      <th style={{ width: '60px', textAlign: 'center' }}>Grade</th>
                      <th style={{ width: '90px' }}>Status</th>
                      <th>Teacher Remarks</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {marksRows.map((row) => {
                      const evalRes = computeExamResult(
                        row.marks_obtained,
                        activeMarksExam.passing_marks,
                        activeMarksExam.total_marks,
                        row.is_absent
                      );

                      return (
                        <tr key={row.student_id}>
                          <td>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600 }}>
                              {row.admission_no}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                              {row.full_name}
                            </div>
                          </td>
                          <td style={{ fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                            {row.roll_no}
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              max={activeMarksExam.total_marks}
                              step="0.5"
                              disabled={row.is_absent}
                              value={row.marks_obtained !== null ? row.marks_obtained : ''}
                              onChange={(e) =>
                                handleMarkChange(row.student_id, 'marks_obtained', e.target.value)
                              }
                              placeholder="0-100"
                              className="form-input"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                fontFamily: 'var(--font-mono)',
                                fontWeight: 700,
                                textAlign: 'center',
                                backgroundColor: row.is_absent ? '#f1f5f9' : '#ffffff',
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={row.is_absent}
                              onChange={(e) =>
                                handleMarkChange(row.student_id, 'is_absent', e.target.checked)
                              }
                              style={{ cursor: 'pointer' }}
                              title="Mark student as absent"
                            />
                          </td>
                          <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600 }}>
                            {evalRes.percentage !== null ? `${evalRes.percentage}%` : '—'}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '12px' }}>
                            {evalRes.grade}
                          </td>
                          <td>
                            <Badge status={evalRes.badge}>
                              {evalRes.status}
                            </Badge>
                          </td>
                          <td>
                            <input
                              type="text"
                              value={row.remarks || ''}
                              onChange={(e) =>
                                handleMarkChange(row.student_id, 'remarks', e.target.value)
                              }
                              placeholder="Optional remarks..."
                              className="form-input"
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Printer}
                              onClick={() => {
                                setReportCardStudent({
                                  id: row.student_id,
                                  full_name: row.full_name,
                                  admission_no: row.admission_no,
                                  roll_no: row.roll_no,
                                  courses: activeMarksExam.courses,
                                  batches: activeMarksExam.batches,
                                });
                                setReportCardExam(activeMarksExam);
                                setReportCardMark(row);
                              }}
                              title="Preview and Print Report Card"
                            >
                              Print
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* PRINTABLE REPORT CARD MODAL */}
      {reportCardStudent && (
        <ReportCardModal
          isOpen={Boolean(reportCardStudent)}
          onClose={() => {
            setReportCardStudent(null);
            setReportCardExam(null);
            setReportCardMark(null);
          }}
          student={reportCardStudent}
          exam={reportCardExam}
          marksRecord={reportCardMark}
        />
      )}
    </div>
  );
}
