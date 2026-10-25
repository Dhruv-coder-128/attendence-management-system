import React, { useState, useEffect, useMemo } from 'react';
import {
  CalendarCheck,
  CreditCard,
  Award,
  Users,
  Printer,
  FileSpreadsheet,
  FileText,
  Search,
  CheckCircle2,
  RefreshCw,
  TrendingUp,
  X,
  MessageCircle,
  Eye,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Pagination from '../components/common/Pagination';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getStoredAcademySettings } from '../lib/academySettings';
import { extractStandardAndSection } from '../lib/classHierarchyHelper';

/**
 * Enterprise Reports & Analytics Hub (v3.0)
 * Sellable, Personalized ERP Reporting Suite:
 * - Mathematical Invariant: Present + Late + Absent + Pending === Total Enrolled
 * - Zero-Student Cohort Isolation (Never shows phantom 20 students)
 * - Interactive Cohort Student Roll Call Modal with WhatsApp Alerts
 * - Fee Ledger with Direct WhatsApp Payment Reminders
 * - Board/Government Ready Official Print Dossier with School Letterhead
 */
const TODAY_ISO = new Date().toISOString().split('T')[0];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('attendance'); // 'attendance' | 'fees' | 'exams' | 'directory'
  const [selectedDate, setSelectedDate] = useState(TODAY_ISO);
  const [selectedBatch, setSelectedBatch] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [attendanceFilter, setAttendanceFilter] = useState('all'); // 'all' | 'high' | 'critical' | 'pending'
  const [loading, setLoading] = useState(true);

  // Drilldown Modal State
  const [selectedCohortModal, setSelectedCohortModal] = useState(null);
  const [cohortSearchTerm, setCohortSearchTerm] = useState('');

  // Sectional Pagination State (10 or 20 records per section)
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [modalPage, setModalPage] = useState(1);
  const [modalPageSize, setModalPageSize] = useState(10);

  // Database Data
  const [students, setStudents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [courses, setCourses] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [feeRecords, setFeeRecords] = useState([]);
  const [exams, setExams] = useState([]);
  const [examResults, setExamResults] = useState([]);
  const [parents, setParents] = useState([]);
  const [parentStudents, setParentStudents] = useState([]);

  const academySettings = getStoredAcademySettings();
  const schoolName = academySettings.academy_name || 'SMS — Student Management System';
  const schoolAddress = academySettings.address || 'Academic Campus & Learning Center';
  const schoolPhone = academySettings.phone || '+91 98765 43210';

  // Load authoritative data
  const loadReportsData = async () => {
    setLoading(true);
    try {
      if (isSupabaseConfigured && supabase) {
        const [
          { data: stData },
          { data: bData },
          { data: cData },
          { data: pData },
          { data: psData },
          { data: fData },
          { data: eData },
          { data: erData },
          { data: attData },
        ] = await Promise.all([
          supabase.from('students').select('*').order('full_name'),
          supabase.from('batches').select('*').order('name'),
          supabase.from('courses').select('*').order('name'),
          supabase.from('parents').select('*').order('full_name'),
          supabase.from('parent_students').select('*'),
          supabase.from('fee_records').select('*'),
          supabase.from('exams').select('*').order('date', { ascending: false }),
          supabase.from('exam_results').select('*'),
          supabase.from('attendance').select('*').eq('date', selectedDate),
        ]);

        setStudents(stData || []);
        setBatches(bData || []);
        setCourses(cData || []);
        setParents(pData || []);
        setParentStudents(psData || []);
        setFeeRecords(fData || []);
        setExams(eData || []);
        setExamResults(erData || []);
        setAttendanceRecords(attData || []);
      } else {
        setStudents([]);
        setBatches([]);
      }
    } catch (err) {
      console.warn('Reports data fetch error:', err);
      setStudents([]);
      setBatches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportsData();
  }, [selectedDate]);

  // Reset pagination to page 1 whenever filters, search, or active tab change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedBatch, searchTerm, attendanceFilter, selectedDate]);

  // Reset modal pagination to page 1 when modal cohort or modal search changes
  useEffect(() => {
    setModalPage(1);
  }, [selectedCohortModal, cohortSearchTerm]);

  // Lookup maps
  const batchLookup = useMemo(() => {
    const map = new Map();
    batches.forEach((b) => {
      map.set(b.id, b);
      if (b.code) map.set(b.code, b);
    });
    return map;
  }, [batches]);

  const studentLookup = useMemo(() => {
    const map = new Map();
    students.forEach((s) => {
      map.set(s.id, s);
      if (s.admission_no) map.set(s.admission_no, s);
    });
    return map;
  }, [students]);

  // Quick Date Helpers
  const setTodayDate = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const setYesterdayDate = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // 1. ATTENDANCE REPORT DATA COMPILATION (MATHEMATICALLY DEDUPLICATED & ISOLATED)
  const attendanceReportData = useMemo(() => {
    return batches.map((batch) => {
      const { standard, section } = extractStandardAndSection(batch);
      const bId = String(batch.id || '').trim();
      const bCode = String(batch.code || '').trim().toUpperCase();
      const bName = String(batch.name || '').trim().toLowerCase();

      // Find all students strictly belonging to this cohort
      const batchStudents = students.filter((s) => {
        const sBatchId = String(s.batch_id || '').trim();
        const sBatchCode = String(s.batch_code || '').trim().toUpperCase();
        const sBatchName = String(s.batch_name || '').trim().toLowerCase();

        if (bId && sBatchId && bId === sBatchId) return true;
        if (bCode && sBatchCode && bCode === sBatchCode) return true;
        if (bName && sBatchName && bName === sBatchName) return true;
        return false;
      });

      // Strict enrollment: If empty custom cohort, totalEnrolled is 0, NEVER default to 20!
      const totalEnrolled = batchStudents.length;

      // Extract all attendance records associated with this batch on selectedDate
      const rawRecords = attendanceRecords.filter((a) => {
        const aBatchId = String(a.batch_id || '').trim();
        const aBatchCode = String(a.batch_code || '').trim().toUpperCase();
        const aBatchName = String(a.batch_name || '').trim().toLowerCase();

        if (bId && aBatchId && bId === aBatchId) return true;
        if (bCode && aBatchCode && bCode === aBatchCode) return true;
        if (bName && aBatchName && bName === aBatchName) return true;
        return false;
      });

      // Deduplicate attendance records: Strictly 1 status per student per date with timestamp authority
      const dedupMap = new Map();
      rawRecords.forEach((rec) => {
        const studentKey = String(
          rec.student_id || rec.admission_no || rec.students?.admission_no || ''
        ).trim().toUpperCase();
        if (!studentKey) return;
        const existing = dedupMap.get(studentKey);
        const recTime = new Date(rec.updated_at || rec.created_at || rec.time_in || 0).getTime();
        const existingTime = existing ? new Date(existing.updated_at || existing.created_at || existing.time_in || 0).getTime() : -1;
        if (!existing || recTime >= existingTime) {
          dedupMap.set(studentKey, rec);
        }
      });

      let present = 0;
      let late = 0;
      let absent = 0;

      // Track individual student statuses for interactive drilldown
      const studentRoster = batchStudents.map((st, idx) => {
        const sId = String(st.id || '').trim().toUpperCase();
        const sAdm = String(st.admission_no || '').trim().toUpperCase();
        const rec = dedupMap.get(sId) || dedupMap.get(sAdm);
        const status = rec ? rec.status : 'Pending';

        if (status === 'Present') present++;
        else if (status === 'Late') late++;
        else if (status === 'Absent') absent++;

        return {
          id: st.id || `st-${idx}`,
          admissionNo: st.admission_no || st.id,
          rollNo: st.roll_no || `${idx + 1}`,
          fullName: st.full_name || st.name || 'Student',
          phone: st.phone || '',
          status,
          timeIn: rec?.time_in ? rec.time_in : (rec?.created_at ? new Date(rec.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'),
          remarks: rec?.remarks || '',
        };
      });

      const marked = present + late + absent;
      const pending = Math.max(0, totalEnrolled - marked);
      const rate = totalEnrolled > 0
        ? Math.min(100, Math.round(((present + late * 0.5) / totalEnrolled) * 100))
        : 0;

      return {
        batchId: batch.id,
        batchCode: batch.code,
        batchName: batch.name,
        standard,
        section,
        timing: batch.timing || '08:00 AM – 11:00 AM',
        classroom: batch.classroom || 'Room 101',
        totalEnrolled,
        present,
        late,
        absent,
        pending,
        attendanceRate: rate,
        isComplete: totalEnrolled > 0 && marked >= totalEnrolled,
        roster: studentRoster,
      };
    });
  }, [batches, students, attendanceRecords]);

  // Filtered attendance data
  const filteredAttendanceData = useMemo(() => {
    return attendanceReportData.filter((b) => {
      if (selectedBatch !== 'All' && b.batchId !== selectedBatch && b.batchCode !== selectedBatch) {
        return false;
      }
      if (attendanceFilter === 'high' && b.attendanceRate < 80) return false;
      if (attendanceFilter === 'critical' && (b.attendanceRate >= 50 || b.totalEnrolled === 0)) return false;
      if (attendanceFilter === 'pending' && b.pending === 0) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        b.batchName.toLowerCase().includes(term) ||
        b.batchCode.toLowerCase().includes(term) ||
        b.standard.toLowerCase().includes(term)
      );
    });
  }, [attendanceReportData, selectedBatch, searchTerm, attendanceFilter]);

  // 2. FINANCIAL & FEES REPORT DATA COMPILATION
  const feeReportData = useMemo(() => {
    return students.map((s) => {
      const batch = batchLookup.get(s.batch_id) || batchLookup.get(s.batch_code);
      const { standard, section } = extractStandardAndSection(batch);

      const feeRec = feeRecords.find((f) => f.student_id === s.id);
      const totalFee = feeRec ? Number(feeRec.total_amount) : Number(s.tuition_fee) || 25000;
      const paidFee = feeRec ? Number(feeRec.paid_amount) : Number(s.fee_paid) || 0;
      const balanceDue = Math.max(0, totalFee - paidFee);

      let status = 'Pending';
      if (balanceDue === 0 && totalFee > 0) status = 'Paid';
      else if (paidFee > 0) status = 'Partial';

      return {
        studentId: s.id,
        admissionNo: s.admission_no || s.id,
        fullName: s.full_name || s.name || '',
        rollNo: s.roll_no || '-',
        batchName: batch?.name || 'General Batch',
        standard,
        section,
        phone: s.phone || '',
        totalFee,
        paidFee,
        balanceDue,
        status,
        dueDate: feeRec?.due_date || '2026-11-30',
      };
    });
  }, [students, batchLookup, feeRecords]);

  const filteredFeeData = useMemo(() => {
    return feeReportData.filter((item) => {
      if (selectedBatch !== 'All' && !item.batchName.includes(selectedBatch)) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.fullName.toLowerCase().includes(term) ||
        item.admissionNo.toLowerCase().includes(term) ||
        item.standard.toLowerCase().includes(term)
      );
    });
  }, [feeReportData, selectedBatch, searchTerm]);

  // 3. EXAMS & MARKS REPORT DATA COMPILATION
  const examReportData = useMemo(() => {
    if (examResults.length > 0) {
      return examResults.map((r) => {
        const student = studentLookup.get(r.student_id);
        const exam = exams.find((e) => e.id === r.exam_id);
        const batch = batchLookup.get(student?.batch_id);
        const marks = Number(r.marks_obtained) || 0;
        const maxMarks = Number(exam?.max_marks) || 100;
        const percentage = Math.round((marks / maxMarks) * 100);
        let grade = 'A';
        if (percentage < 40) grade = 'F';
        else if (percentage < 60) grade = 'C';
        else if (percentage < 75) grade = 'B';

        return {
          id: r.id,
          studentName: student?.full_name || 'Student',
          admissionNo: student?.admission_no || '',
          rollNo: student?.roll_no || '-',
          batchName: batch?.name || 'Standard Batch',
          examTitle: exam?.title || 'Mid-Term Assessment',
          subject: exam?.subject || 'Core Subject',
          marks,
          maxMarks,
          percentage,
          grade,
          status: percentage >= 40 ? 'Pass' : 'Fail',
        };
      });
    }

    return [];
  }, [examResults, exams, students, studentLookup, batchLookup]);

  const filteredExamData = useMemo(() => {
    return examReportData.filter((item) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.studentName.toLowerCase().includes(term) ||
        item.admissionNo.toLowerCase().includes(term) ||
        item.subject.toLowerCase().includes(term)
      );
    });
  }, [examReportData, searchTerm]);

  // 4. MASTER STUDENT & GUARDIAN DIRECTORY DATA COMPILATION
  const directoryReportData = useMemo(() => {
    return students.map((s) => {
      const batch = batchLookup.get(s.batch_id) || batchLookup.get(s.batch_code);
      const { standard, section } = extractStandardAndSection(batch);

      const ps = parentStudents.find((link) => link.student_id === s.id);
      const parent = ps ? parents.find((p) => p.id === ps.parent_id) : null;

      return {
        admissionNo: s.admission_no || s.id,
        rollNo: s.roll_no || '-',
        fullName: s.full_name || s.name || '',
        standard,
        division: section,
        batchName: batch?.name || `${standard} - Div ${section}`,
        gender: s.gender || 'Other',
        studentPhone: s.phone || 'N/A',
        guardianName: parent?.full_name || 'Registered Guardian',
        guardianPhone: parent?.phone || s.phone || 'N/A',
        relationship: ps?.relationship || parent?.relationship || 'Parent',
        telegramLinked: Boolean(parent?.telegram_chat_id || parent?.is_verified),
      };
    });
  }, [students, batchLookup, parentStudents, parents]);

  const filteredDirectoryData = useMemo(() => {
    return directoryReportData.filter((item) => {
      if (selectedBatch !== 'All' && !item.batchName.includes(selectedBatch)) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        item.fullName.toLowerCase().includes(term) ||
        item.admissionNo.toLowerCase().includes(term) ||
        item.guardianName.toLowerCase().includes(term) ||
        item.standard.toLowerCase().includes(term)
      );
    });
  }, [directoryReportData, selectedBatch, searchTerm]);

  // Paginated Data Slices for 10/20 record sections
  const paginatedAttendanceData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAttendanceData.slice(start, start + pageSize);
  }, [filteredAttendanceData, currentPage, pageSize]);

  const paginatedFeeData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredFeeData.slice(start, start + pageSize);
  }, [filteredFeeData, currentPage, pageSize]);

  const paginatedExamData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredExamData.slice(start, start + pageSize);
  }, [filteredExamData, currentPage, pageSize]);

  const paginatedDirectoryData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDirectoryData.slice(start, start + pageSize);
  }, [filteredDirectoryData, currentPage, pageSize]);

  // Modal Roster Search and Pagination
  const filteredModalRoster = useMemo(() => {
    if (!selectedCohortModal?.roster) return [];
    if (!cohortSearchTerm.trim()) return selectedCohortModal.roster;
    const t = cohortSearchTerm.toLowerCase();
    return selectedCohortModal.roster.filter(
      (s) =>
        s.fullName.toLowerCase().includes(t) ||
        s.admissionNo.toLowerCase().includes(t) ||
        s.rollNo.toLowerCase().includes(t)
    );
  }, [selectedCohortModal, cohortSearchTerm]);

  const paginatedModalRoster = useMemo(() => {
    const start = (modalPage - 1) * modalPageSize;
    return filteredModalRoster.slice(start, start + modalPageSize);
  }, [filteredModalRoster, modalPage, modalPageSize]);

  // EXPORT ENGINE: EXCEL (.xlsx)
  const exportToExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      let records = [];
      let sheetName = 'Report';
      let fileName = `sms_${activeTab}_report_${selectedDate}.xlsx`;

      if (activeTab === 'attendance') {
        sheetName = 'Attendance Summary';
        records = filteredAttendanceData.map((d) => ({
          'Batch Code': d.batchCode,
          'Standard': d.standard,
          'Division': d.section,
          'Batch Name': d.batchName,
          'Schedule': d.timing,
          'Room': d.classroom,
          'Total Students': d.totalEnrolled,
          'Present': d.present,
          'Late': d.late,
          'Absent': d.absent,
          'Pending Roll Call': d.pending,
          'Attendance %': `${d.attendanceRate}%`,
        }));
      } else if (activeTab === 'fees') {
        sheetName = 'Tuition Fee Ledger';
        records = filteredFeeData.map((d) => ({
          'Admission No': d.admissionNo,
          'Roll No': d.rollNo,
          'Student Name': d.fullName,
          'Standard': d.standard,
          'Division': d.section,
          'Total Fee (INR)': d.totalFee,
          'Paid Amount (INR)': d.paidFee,
          'Balance Due (INR)': d.balanceDue,
          'Payment Status': d.status,
          'Due Date': d.dueDate,
          'Student Phone': d.phone,
        }));
      } else if (activeTab === 'exams') {
        sheetName = 'Examination Marksheet';
        records = filteredExamData.map((d) => ({
          'Admission No': d.admissionNo,
          'Roll No': d.rollNo,
          'Student Name': d.studentName,
          'Examination': d.examTitle,
          'Subject': d.subject,
          'Marks Obtained': d.marks,
          'Maximum Marks': d.maxMarks,
          'Percentage': `${d.percentage}%`,
          'Grade': d.grade,
          'Result': d.status,
        }));
      } else {
        sheetName = 'Student Directory';
        records = filteredDirectoryData.map((d) => ({
          'Admission No': d.admissionNo,
          'Roll No': d.rollNo,
          'Student Name': d.fullName,
          'Standard': d.standard,
          'Division': d.division,
          'Batch': d.batchName,
          'Gender': d.gender,
          'Student Phone': d.studentPhone,
          'Guardian Name': d.guardianName,
          'Guardian Phone': d.guardianPhone,
          'Relationship': d.relationship,
          'Telegram Linked': d.telegramLinked ? 'YES' : 'NO',
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(records);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      XLSX.writeFile(workbook, fileName);
    } catch (err) {
      console.error('Excel Export error:', err);
      alert('Could not export to Excel: ' + err.message);
    }
  };

  // EXPORT ENGINE: CSV
  const exportToCSV = () => {
    let rows = [];
    if (activeTab === 'attendance') {
      rows = filteredAttendanceData.map((d) => [
        d.batchCode,
        d.standard,
        d.section,
        d.batchName,
        d.totalEnrolled,
        d.present,
        d.late,
        d.absent,
        d.pending,
        `${d.attendanceRate}%`,
      ]);
      rows.unshift(['Batch Code', 'Standard', 'Division', 'Batch Name', 'Enrolled', 'Present', 'Late', 'Absent', 'Pending', 'Attendance %']);
    } else if (activeTab === 'fees') {
      rows = filteredFeeData.map((d) => [
        d.admissionNo,
        d.rollNo,
        d.fullName,
        d.standard,
        d.section,
        d.totalFee,
        d.paidFee,
        d.balanceDue,
        d.status,
      ]);
      rows.unshift(['Admission No', 'Roll No', 'Student Name', 'Standard', 'Division', 'Total Fee', 'Paid', 'Due', 'Status']);
    } else if (activeTab === 'exams') {
      rows = filteredExamData.map((d) => [
        d.admissionNo,
        d.rollNo,
        d.studentName,
        d.examTitle,
        d.subject,
        d.marks,
        d.maxMarks,
        d.grade,
        d.status,
      ]);
      rows.unshift(['Admission No', 'Roll No', 'Student Name', 'Exam', 'Subject', 'Marks', 'Max Marks', 'Grade', 'Status']);
    } else {
      rows = filteredDirectoryData.map((d) => [
        d.admissionNo,
        d.rollNo,
        d.fullName,
        d.standard,
        d.division,
        d.guardianName,
        d.guardianPhone,
        d.telegramLinked ? 'Linked' : 'Pending',
      ]);
      rows.unshift(['Admission No', 'Roll No', 'Student Name', 'Standard', 'Division', 'Guardian Name', 'Guardian Phone', 'Telegram']);
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sms_${activeTab}_report_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // PRINT DOSSIER
  const handlePrint = () => {
    window.print();
  };

  // WhatsApp Fee Reminder Trigger
  const sendWhatsAppFeeReminder = (student) => {
    const phone = (student.phone || '').replace(/\D/g, '');
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;
    const text = encodeURIComponent(
      `Respected Parent, this is an official fee reminder from ${schoolName}. The tuition fee balance for ${student.fullName} (Roll: ${student.rollNo}, Admission: ${student.admissionNo}) is Rs. ${student.balanceDue.toLocaleString('en-IN')}, due by ${student.dueDate}. Kindly clear the balance at your earliest convenience. Thank you.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, '_blank');
  };

  // WhatsApp Single Student Attendance Notice Trigger
  const sendWhatsAppAttendanceNotice = (student, cohort) => {
    const phone = (student.phone || '').replace(/\D/g, '');
    const cleanPhone = phone.length === 10 ? `91${phone}` : phone;
    const statusText = student.status === 'Present' ? 'PRESENT' : student.status === 'Late' ? 'LATE' : 'ABSENT';
    const text = encodeURIComponent(
      `Dear Parent, attendance update from ${schoolName} for ${selectedDate}: Your child ${student.fullName} (${cohort.batchName}) has been marked ${statusText} for today's session.`
    );
    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${text}`, '_blank');
  };

  // Institutional Overall Metrics Summary
  const totalStudentsCount = students.length || 0;
  const totalBatchesCount = batches.length || 0;
  const totalPresentToday = attendanceReportData.reduce((acc, b) => acc + b.present, 0);
  const totalLateToday = attendanceReportData.reduce((acc, b) => acc + b.late, 0);
  const totalAbsentToday = attendanceReportData.reduce((acc, b) => acc + b.absent, 0);
  const totalEnrolledAcrossBatches = attendanceReportData.reduce((acc, b) => acc + b.totalEnrolled, 0);
  const overallAttendanceRate = totalEnrolledAcrossBatches > 0
    ? Math.round(((totalPresentToday + totalLateToday * 0.5) / totalEnrolledAcrossBatches) * 100)
    : 0;

  const totalCollectedFees = feeReportData.reduce((acc, f) => acc + f.paidFee, 0);
  const totalOutstandingFees = feeReportData.reduce((acc, f) => acc + f.balanceDue, 0);

  // Best & Critical Performing Cohorts
  const activeCohortsWithStudents = attendanceReportData.filter((b) => b.totalEnrolled > 0);
  const topCohort = activeCohortsWithStudents.length > 0
    ? [...activeCohortsWithStudents].sort((a, b) => b.attendanceRate - a.attendanceRate)[0]
    : null;
  const lowCohort = activeCohortsWithStudents.length > 0
    ? [...activeCohortsWithStudents].sort((a, b) => a.attendanceRate - b.attendanceRate)[0]
    : null;

  return (
    <div style={{ paddingBottom: '60px' }}>
      {/* PRINT-ONLY OFFICIAL INSTITUTIONAL HEADER */}
      <div className="print-only-header" style={{ display: 'none', marginBottom: '24px' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '12px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {schoolName}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#475569' }}>
            {schoolAddress} · Helpline: {schoolPhone}
          </p>
          <div style={{ marginTop: '8px', fontSize: '14px', fontWeight: 800, textDecoration: 'underline' }}>
            OFFICIAL DAILY ACADEMIC &amp; INSTITUTIONAL AUDIT DOSSIER — {selectedDate}
          </div>
        </div>
      </div>

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title" style={{ margin: 0 }}>Reports &amp; Analytics Hub</h1>
            <span
              style={{
                backgroundColor: '#e0e7ff',
                color: '#4338ca',
                fontSize: '11px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                fontFamily: 'monospace',
              }}
            >
              Enterprise v3.0
            </span>
          </div>
          <p className="page-description" style={{ marginTop: '4px' }}>
            Sellable, authoritative institutional reporting across Attendance, Financial Collections, Examination Scores, and Directory Dossiers
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={handlePrint}
            title="Print Official Dossier"
          >
            Print Dossier
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={FileText}
            onClick={exportToCSV}
            title="Export comma-separated values"
          >
            Export CSV
          </Button>

          <Button
            variant="gold"
            size="sm"
            icon={FileSpreadsheet}
            onClick={exportToExcel}
            title="Download formatted Excel workbook"
          >
            Export Excel (.xlsx)
          </Button>
        </div>
      </div>

      {/* EXECUTIVE INSTITUTIONAL HEALTH BAR */}
      <div
        className="erp-card"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          padding: '18px 24px',
          borderRadius: '16px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
        }}
      >
        <div style={{ minWidth: '220px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Institutional Roll Call Health
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '4px' }}>
            <span style={{ fontSize: '28px', fontWeight: 900, color: '#38bdf8' }}>
              {overallAttendanceRate}%
            </span>
            <span style={{ fontSize: '13px', color: '#cbd5e1' }}>
              ({totalPresentToday} Present · {totalLateToday} Late · {totalAbsentToday} Absent)
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            Audited for {selectedDate} across {totalBatchesCount} configured cohorts
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {topCohort && (
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '8px 14px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '10px', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>
                ★ Best Performing
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '2px' }}>
                {topCohort.batchName} ({topCohort.attendanceRate}%)
              </div>
            </div>
          )}

          {lowCohort && lowCohort.attendanceRate < 75 && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '8px 14px',
                borderRadius: '12px',
              }}
            >
              <div style={{ fontSize: '10px', color: '#f87171', fontWeight: 700, textTransform: 'uppercase' }}>
                ⚠ Low Attendance Alert
              </div>
              <div style={{ fontSize: '13px', fontWeight: 800, marginTop: '2px', color: '#fca5a5' }}>
                {lowCohort.batchName} ({lowCohort.attendanceRate}%)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top Level Metric Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div className="erp-card" style={{ padding: '16px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Total Enrolled</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {totalStudentsCount}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#eff6ff', borderRadius: '10px', color: '#2563eb' }}>
              <Users size={20} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Active across {totalBatchesCount} cohorts
          </div>
        </div>

        <div className="erp-card" style={{ padding: '16px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Present Today</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
                {totalPresentToday}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#ecfdf5', borderRadius: '10px', color: '#059669' }}>
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Date: {selectedDate}
          </div>
        </div>

        <div className="erp-card" style={{ padding: '16px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Fee Collection</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', marginTop: '4px' }}>
                ₹{totalCollectedFees.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#f0fdf4', borderRadius: '10px', color: '#16a34a' }}>
              <CreditCard size={20} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Real-time ledger receipts
          </div>
        </div>

        <div className="erp-card" style={{ padding: '16px', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Outstanding Dues</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', marginTop: '4px' }}>
                ₹{totalOutstandingFees.toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{ padding: '8px', backgroundColor: '#fef2f2', borderRadius: '10px', color: '#dc2626' }}>
              <TrendingUp size={20} />
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
            Pending fee collection
          </div>
        </div>
      </div>

      {/* Report Module Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '20px',
          paddingBottom: '2px',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={() => setActiveTab('attendance')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'attendance' ? '#ffffff' : 'transparent',
            color: activeTab === 'attendance' ? '#4f46e5' : '#64748b',
            fontWeight: activeTab === 'attendance' ? 800 : 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'attendance' ? '3px solid #4f46e5' : 'none',
          }}
        >
          <CalendarCheck size={16} />
          <span>Attendance Reports</span>
        </button>

        <button
          onClick={() => setActiveTab('fees')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'fees' ? '#ffffff' : 'transparent',
            color: activeTab === 'fees' ? '#4f46e5' : '#64748b',
            fontWeight: activeTab === 'fees' ? 800 : 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'fees' ? '3px solid #4f46e5' : 'none',
          }}
        >
          <CreditCard size={16} />
          <span>Financial &amp; Fee Ledger</span>
        </button>

        <button
          onClick={() => setActiveTab('exams')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'exams' ? '#ffffff' : 'transparent',
            color: activeTab === 'exams' ? '#4f46e5' : '#64748b',
            fontWeight: activeTab === 'exams' ? 800 : 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'exams' ? '3px solid #4f46e5' : 'none',
          }}
        >
          <Award size={16} />
          <span>Examinations &amp; Scores</span>
        </button>

        <button
          onClick={() => setActiveTab('directory')}
          style={{
            padding: '10px 18px',
            borderRadius: '8px 8px 0 0',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: activeTab === 'directory' ? '#ffffff' : 'transparent',
            color: activeTab === 'directory' ? '#4f46e5' : '#64748b',
            fontWeight: activeTab === 'directory' ? 800 : 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: activeTab === 'directory' ? '3px solid #4f46e5' : 'none',
          }}
        >
          <Users size={16} />
          <span>Master Student Directory</span>
        </button>
      </div>

      {/* Global Filter Bar */}
      <div
        className="erp-card"
        style={{
          padding: '14px 16px',
          backgroundColor: '#ffffff',
          marginBottom: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search report by name, admission no, or standard..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '32px' }}
          />
        </div>

        {activeTab === 'attendance' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={setTodayDate}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: selectedDate === TODAY_ISO ? '#e0e7ff' : '#f8fafc',
                color: selectedDate === TODAY_ISO ? '#4338ca' : '#475569',
                cursor: 'pointer',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={setYesterdayDate}
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              Yesterday
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="form-input"
              style={{ width: '145px' }}
            />
          </div>
        )}

        <div style={{ width: '190px' }}>
          <select
            value={selectedBatch}
            onChange={(e) => setSelectedBatch(e.target.value)}
            className="form-select"
          >
            <option value="All">All Batches &amp; Standards</option>
            {batches.map((b) => (
              <option key={b.id || b.code} value={b.id || b.code}>
                {b.code} — {b.name}
              </option>
            ))}
          </select>
        </div>

        {activeTab === 'attendance' && (
          <div style={{ width: '170px' }}>
            <select
              value={attendanceFilter}
              onChange={(e) => setAttendanceFilter(e.target.value)}
              className="form-select"
            >
              <option value="all">All Rates</option>
              <option value="high">High (≥ 80%)</option>
              <option value="critical">Critical (&lt; 50%)</option>
              <option value="pending">Pending Roll Call</option>
            </select>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, padding: '0 6px' }}>Section:</span>
          <button
            type="button"
            onClick={() => { setPageSize(10); setCurrentPage(1); }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: pageSize === 10 ? '#ffffff' : 'transparent',
              color: pageSize === 10 ? '#0f172a' : '#64748b',
              boxShadow: pageSize === 10 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            10 / page
          </button>
          <button
            type="button"
            onClick={() => { setPageSize(20); setCurrentPage(1); }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              backgroundColor: pageSize === 20 ? '#ffffff' : 'transparent',
              color: pageSize === 20 ? '#0f172a' : '#64748b',
              boxShadow: pageSize === 20 ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            20 / page
          </button>
        </div>

        <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadReportsData} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* TAB CONTENT 1: ATTENDANCE */}
      {activeTab === 'attendance' && (
        <div className="erp-card" style={{ backgroundColor: '#ffffff', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                Daily Attendance Roll Call Dossier — {selectedDate}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Standard and division level roll call metrics reported for {schoolName}. Click any cohort row to inspect student roster.
              </div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4338ca', backgroundColor: '#e0e7ff', padding: '4px 10px', borderRadius: '8px' }}>
              {filteredAttendanceData.length} Cohorts Active
            </span>
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Batch / Standard</th>
                  <th>Division</th>
                  <th>Schedule</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Present</th>
                  <th style={{ textAlign: 'center' }}>Late</th>
                  <th style={{ textAlign: 'center' }}>Absent</th>
                  <th style={{ textAlign: 'center' }}>Pending</th>
                  <th>Attendance %</th>
                  <th style={{ textAlign: 'center' }}>Inspect</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendanceData.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No cohort records match the selected date or search filter.
                    </td>
                  </tr>
                ) : (
                  paginatedAttendanceData.map((row) => (
                    <tr
                      key={row.batchCode || row.batchId}
                      onClick={() => setSelectedCohortModal(row)}
                      style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                      className="hover-row"
                    >
                      <td>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 800,
                                fontSize: '11px',
                                backgroundColor: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              {row.batchCode}
                            </span>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{row.batchName}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Standard: {row.standard}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            backgroundColor: '#e0e7ff',
                            color: '#4338ca',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 800,
                          }}
                        >
                          Div {row.section}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '12px' }}>{row.timing}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{row.classroom}</div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.totalEnrolled}</td>
                      <td style={{ textAlign: 'center', color: '#059669', fontWeight: 700 }}>{row.present}</td>
                      <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 600 }}>{row.late}</td>
                      <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{row.absent}</td>
                      <td style={{ textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
                        {row.pending > 0 ? (
                          <span style={{ color: '#d97706', backgroundColor: '#fef3c7', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                            {row.pending}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div
                            style={{
                              flex: 1,
                              height: '7px',
                              backgroundColor: '#e2e8f0',
                              borderRadius: '4px',
                              overflow: 'hidden',
                              minWidth: '60px',
                            }}
                          >
                            <div
                              style={{
                                width: `${row.attendanceRate}%`,
                                height: '100%',
                                backgroundColor:
                                  row.attendanceRate >= 75 ? '#10b981' : row.attendanceRate >= 50 ? '#f59e0b' : '#ef4444',
                              }}
                            />
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 800, minWidth: '36px' }}>{row.attendanceRate}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCohortModal(row);
                          }}
                          style={{
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#334155',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Eye size={12} />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filteredAttendanceData.length / pageSize))}
            totalItems={filteredAttendanceData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      )}

      {/* TAB CONTENT 2: FEES */}
      {activeTab === 'fees' && (
        <div className="erp-card" style={{ backgroundColor: '#ffffff', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                Tuition Fee Collection &amp; Outstanding Dues Ledger
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Student-wise financial balance report with one-click WhatsApp fee payment reminders
              </div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669', backgroundColor: '#ecfdf5', padding: '4px 10px', borderRadius: '8px' }}>
              Total Balance Due: ₹{totalOutstandingFees.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Standard / Batch</th>
                  <th>Total Fee</th>
                  <th>Paid Amount</th>
                  <th>Balance Due</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredFeeData.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No fee records match the selected filters.
                    </td>
                  </tr>
                ) : (
                  paginatedFeeData.map((row) => (
                  <tr key={row.admissionNo || row.studentId}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.fullName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {row.admissionNo} · Roll: {row.rollNo}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{row.standard}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Division {row.section}</div>
                    </td>
                    <td style={{ fontWeight: 600 }}>₹{row.totalFee.toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, color: '#059669' }}>₹{row.paidFee.toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 700, color: row.balanceDue > 0 ? '#dc2626' : '#64748b' }}>
                      ₹{row.balanceDue.toLocaleString('en-IN')}
                    </td>
                    <td>
                      <Badge
                        status={row.status === 'Paid' ? 'Present' : row.status === 'Partial' ? 'Late' : 'Absent'}
                      >
                        {row.status}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>{row.dueDate}</td>
                    <td style={{ textAlign: 'center' }}>
                      {row.balanceDue > 0 ? (
                        <button
                          type="button"
                          onClick={() => sendWhatsAppFeeReminder(row)}
                          style={{
                            border: '1px solid #10b981',
                            backgroundColor: '#ecfdf5',
                            color: '#059669',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Send polite fee payment reminder via WhatsApp"
                        >
                          <MessageCircle size={12} />
                          <span>WhatsApp</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>✓ Cleared</span>
                      )}
                    </td>
                  </tr>
                )))
              }
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filteredFeeData.length / pageSize))}
            totalItems={filteredFeeData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      )}

      {/* TAB CONTENT 3: EXAMS */}
      {activeTab === 'exams' && (
        <div className="erp-card" style={{ backgroundColor: '#ffffff', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              Academic Examinations &amp; Marksheet Dossier
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Subject scorecards, percentage calculations, and letter grades
            </div>
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Examination</th>
                  <th>Subject</th>
                  <th style={{ textAlign: 'center' }}>Marks</th>
                  <th style={{ textAlign: 'center' }}>Percentage</th>
                  <th style={{ textAlign: 'center' }}>Grade</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {filteredExamData.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No examination marks match the selected search criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedExamData.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.studentName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {row.admissionNo} · Roll: {row.rollNo}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', fontWeight: 600 }}>{row.examTitle}</td>
                    <td style={{ fontSize: '12px', color: '#475569' }}>{row.subject}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {row.marks} / {row.maxMarks}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.percentage}%</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          backgroundColor: row.percentage >= 75 ? '#ecfdf5' : '#fef3c7',
                          color: row.percentage >= 75 ? '#065f46' : '#92400e',
                          fontWeight: 800,
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {row.grade}
                      </span>
                    </td>
                    <td>
                      <Badge status={row.status === 'Pass' ? 'Present' : 'Absent'}>
                        {row.status}
                      </Badge>
                    </td>
                  </tr>
                )))
              }
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filteredExamData.length / pageSize))}
            totalItems={filteredExamData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      )}

      {/* TAB CONTENT 4: DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="erp-card" style={{ backgroundColor: '#ffffff', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
              Master Student &amp; Guardian Directory Dossier
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              Complete institutional roster with verified guardian phone numbers and Telegram connectivity
            </div>
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student Full Name</th>
                  <th>Class / Standard</th>
                  <th>Student Contact</th>
                  <th>Guardian Information</th>
                  <th>Relationship</th>
                  <th>Telegram Link</th>
                </tr>
              </thead>
              <tbody>
                {filteredDirectoryData.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: '#64748b' }}>
                      No student directory records match the search filter.
                    </td>
                  </tr>
                ) : (
                  paginatedDirectoryData.map((row) => (
                  <tr key={row.admissionNo}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.fullName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                        {row.admissionNo} · Roll: {row.rollNo}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{row.standard}</div>
                      <span
                        style={{
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          fontSize: '10px',
                          fontWeight: 800,
                        }}
                      >
                        Division {row.division}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: '#475569' }}>
                      {row.studentPhone !== 'N/A' ? (
                        <a href={`tel:${row.studentPhone}`} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>
                          {row.studentPhone}
                        </a>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{row.guardianName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {row.guardianPhone !== 'N/A' ? (
                          <a href={`tel:${row.guardianPhone}`} style={{ color: '#475569', textDecoration: 'none' }}>
                            {row.guardianPhone}
                          </a>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: '#475569' }}>{row.relationship}</td>
                    <td>
                      {row.telegramLinked ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#059669',
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckCircle2 size={11} /> Linked
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#d97706',
                            backgroundColor: '#fef3c7',
                            border: '1px solid #fde68a',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontWeight: 600,
                          }}
                        >
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                )))
              }
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={Math.max(1, Math.ceil(filteredDirectoryData.length / pageSize))}
            totalItems={filteredDirectoryData.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      )}

      {/* INTERACTIVE COHORT STUDENT ROLL CALL MODAL */}
      {selectedCohortModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSelectedCohortModal(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                background: 'linear-gradient(to right, #f8fafc, #f1f5f9)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 800,
                      fontSize: '12px',
                      backgroundColor: '#e0e7ff',
                      color: '#4338ca',
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    {selectedCohortModal.batchCode}
                  </span>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {selectedCohortModal.batchName}
                  </h2>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                  Standard {selectedCohortModal.standard} · Division {selectedCohortModal.section} · Date: {selectedDate}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedCohortModal(null)}
                style={{
                  border: 'none',
                  backgroundColor: '#e2e8f0',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick KPI stats in modal */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '8px',
                padding: '12px 24px',
                backgroundColor: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                textAlign: 'center',
              }}
            >
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>ENROLLED</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{selectedCohortModal.totalEnrolled}</div>
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#ecfdf5' }}>
                <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>PRESENT</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669' }}>{selectedCohortModal.present}</div>
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#fffbeb' }}>
                <div style={{ fontSize: '10px', color: '#d97706', fontWeight: 700 }}>LATE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#d97706' }}>{selectedCohortModal.late}</div>
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#fff1f2' }}>
                <div style={{ fontSize: '10px', color: '#e11d48', fontWeight: 700 }}>ABSENT</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#e11d48' }}>{selectedCohortModal.absent}</div>
              </div>
              <div style={{ padding: '6px', borderRadius: '8px', backgroundColor: '#eff6ff' }}>
                <div style={{ fontSize: '10px', color: '#2563eb', fontWeight: 700 }}>RATE</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#2563eb' }}>{selectedCohortModal.attendanceRate}%</div>
              </div>
            </div>

            {/* Filter inside modal */}
            <div style={{ padding: '12px 24px', borderBottom: '1px solid #f1f5f9' }}>
              <input
                type="text"
                placeholder="Search student by name or roll number..."
                value={cohortSearchTerm}
                onChange={(e) => setCohortSearchTerm(e.target.value)}
                className="form-input"
                style={{ width: '100%', fontSize: '13px' }}
              />
            </div>

            {/* Modal Body / Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
              {selectedCohortModal.roster.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b' }}>
                  <Users size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>
                    No Students Enrolled in this Cohort
                  </div>
                  <div style={{ fontSize: '12px', marginTop: '4px' }}>
                    Assign students to this division from the Student Management directory.
                  </div>
                </div>
              ) : (
                <table className="erp-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Roll</th>
                      <th>Student Name</th>
                      <th>Admission No</th>
                      <th style={{ textAlign: 'center' }}>Status</th>
                      <th style={{ textAlign: 'center' }}>Time In</th>
                      <th style={{ textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredModalRoster.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                          No students match "{cohortSearchTerm}".
                        </td>
                      </tr>
                    ) : (
                      paginatedModalRoster.map((st) => (
                        <tr key={st.id}>
                          <td style={{ fontWeight: 700, color: '#64748b' }}>{st.rollNo}</td>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>{st.fullName}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px', color: '#475569' }}>
                            {st.admissionNo}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: 800,
                                backgroundColor:
                                  st.status === 'Present'
                                    ? '#ecfdf5'
                                    : st.status === 'Late'
                                    ? '#fffbeb'
                                    : st.status === 'Absent'
                                    ? '#fff1f2'
                                    : '#fef3c7',
                                color:
                                  st.status === 'Present'
                                    ? '#059669'
                                    : st.status === 'Late'
                                    ? '#b45309'
                                    : st.status === 'Absent'
                                    ? '#e11d48'
                                    : '#d97706',
                                border: `1px solid ${
                                  st.status === 'Present'
                                    ? '#a7f3d0'
                                    : st.status === 'Late'
                                    ? '#fde68a'
                                    : st.status === 'Absent'
                                    ? '#fecdd3'
                                    : '#fcd34d'
                                }`,
                              }}
                            >
                              {st.status}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', fontSize: '12px', color: '#64748b' }}>
                            {st.timeIn}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => sendWhatsAppAttendanceNotice(st, selectedCohortModal)}
                              style={{
                                border: 'none',
                                background: '#f0fdf4',
                                color: '#16a34a',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              title="Send attendance update to parent via WhatsApp"
                            >
                              <MessageCircle size={12} />
                              <span>Notify</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Modal Pagination */}
            {filteredModalRoster.length > modalPageSize && (
              <Pagination
                currentPage={modalPage}
                totalPages={Math.max(1, Math.ceil(filteredModalRoster.length / modalPageSize))}
                totalItems={filteredModalRoster.length}
                pageSize={modalPageSize}
                onPageChange={setModalPage}
              />
            )}

            {/* Modal Footer */}
            <div
              style={{
                padding: '14px 24px',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
              }}
            >
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Showing {filteredModalRoster.length} student(s) in this cohort
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedCohortModal(null)}>
                Close Dossier
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY OFFICIAL FOOTER & STAMP BLOCKS */}
      <div className="print-only-footer" style={{ display: 'none', marginTop: '48px', paddingTop: '24px', borderTop: '1px solid #cbd5e1' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 20px' }}>
          <div style={{ textAlign: 'center', width: '180px' }}>
            <div style={{ borderBottom: '1px solid #0f172a', height: '50px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>Prepared By / Teacher</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Roll Call Invigilator</div>
          </div>

          <div style={{ textAlign: 'center', width: '180px' }}>
            <div
              style={{
                width: '100px',
                height: '50px',
                border: '2px dashed #94a3b8',
                borderRadius: '8px',
                margin: '0 auto 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: '#94a3b8',
                fontWeight: 700,
              }}
            >
              SEAL / STAMP
            </div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>Institution Seal</div>
          </div>

          <div style={{ textAlign: 'center', width: '180px' }}>
            <div style={{ borderBottom: '1px solid #0f172a', height: '50px', marginBottom: '8px' }}></div>
            <div style={{ fontSize: '12px', fontWeight: 800 }}>Principal / Director</div>
            <div style={{ fontSize: '10px', color: '#64748b' }}>Authorized Signatory</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '10px', color: '#94a3b8', marginTop: '24px' }}>
          Generated by SMS Student Management Enterprise System · Verification ID: SMS-AUDIT-{selectedDate}
        </div>
      </div>
    </div>
  );
}
