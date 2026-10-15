import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Download,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Users,
  TrendingDown,
  ShieldCheck,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  exportMonthlyRegisterToExcel,
  exportMonthlyRegisterToCSV,
} from '../../lib/attendanceExporter';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function MonthlyAttendanceRegister({
  batches = [],
  selectedBatchId,
  onSelectBatch,
  onRefreshCounts,
}) {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(currentDate.getMonth()); // 0-11

  // Data States
  const [students, setStudents] = useState([]);
  const [monthlyAttendanceMap, setMonthlyAttendanceMap] = useState({}); // { [studentId]: { [dateKey]: status } }
  const [sessionDates, setSessionDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'defaulters' | 'high'

  // Student Dossier Modal
  const [selectedStudentForDossier, setSelectedStudentForDossier] = useState(null);

  // Minimum Attendance Threshold from Settings (default 75)
  const threshold = useMemo(() => {
    const val = parseInt(localStorage.getItem('erp_min_attendance'), 10);
    return !isNaN(val) && val > 0 ? val : 75;
  }, []);

  const instituteName = useMemo(() => {
    return localStorage.getItem('erp_institute_name') || 'SMS — Student Management System';
  }, []);

  // Compute number of days in selected month and year
  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
  }, [selectedYear, selectedMonthIndex]);

  const activeBatch = useMemo(() => {
    return batches.find((b) => b.id === selectedBatchId) || batches[0];
  }, [batches, selectedBatchId]);

  // Fetch Monthly Attendance Data from Supabase
  const fetchMonthlyData = useCallback(async () => {
    if (!selectedBatchId || !supabase || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const mStr = String(selectedMonthIndex + 1).padStart(2, '0');
    const startDate = `${selectedYear}-${mStr}-01`;
    const lastDayStr = String(daysInMonth).padStart(2, '0');
    const endDate = `${selectedYear}-${mStr}-${lastDayStr}`;

    try {
      // 1. Fetch Students in batch with linked guardian
      const { data: studentsData, error: sErr } = await supabase
        .from('students')
        .select(`
          id,
          admission_no,
          full_name,
          roll_no,
          status,
          parent_students (
            id,
            relationship,
            is_primary_contact,
            parents:parent_id (
              id,
              full_name,
              phone,
              email,
              telegram_chat_id,
              is_verified
            )
          )
        `)
        .eq('batch_id', selectedBatchId)
        .order('admission_no');

      if (sErr) throw sErr;

      // 2. Fetch all attendance records for batch in this date range
      const { data: attendanceData, error: aErr } = await supabase
        .from('attendance')
        .select('id, student_id, date, status, time_in, remarks, session_name')
        .eq('batch_id', selectedBatchId)
        .gte('date', startDate)
        .lte('date', endDate);

      if (aErr) throw aErr;

      // 3. Map attendance by student_id and date
      const map = {};
      const uniqueDates = new Set();

      (attendanceData || []).forEach((record) => {
        if (!map[record.student_id]) {
          map[record.student_id] = {};
        }
        map[record.student_id][record.date] = record.status;
        uniqueDates.add(record.date);
      });

      const sortedSessionDates = Array.from(uniqueDates).sort();

      setStudents(studentsData || []);
      setMonthlyAttendanceMap(map);
      setSessionDates(sortedSessionDates);
    } catch (err) {
      console.error('Failed to load monthly attendance:', err);
      setError(err.message || 'Error fetching monthly records from Supabase.');
    } finally {
      setLoading(false);
    }
  }, [selectedBatchId, selectedYear, selectedMonthIndex, daysInMonth]);

  useEffect(() => {
    fetchMonthlyData();
  }, [fetchMonthlyData]);

  // Compute Per-Student Statistics
  const studentMetrics = useMemo(() => {
    const totalSessions = sessionDates.length;

    return students.map((student) => {
      const studentMap = monthlyAttendanceMap[student.id] || {};
      let presentCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let excusedCount = 0;

      sessionDates.forEach((dateKey) => {
        const status = studentMap[dateKey];
        if (status === 'Present') presentCount++;
        else if (status === 'Late') lateCount++;
        else if (status === 'Absent') absentCount++;
        else if (status === 'Excused') excusedCount++;
      });

      const attendedSessions = presentCount + lateCount;
      const attendancePct = totalSessions > 0 ? Math.round((attendedSessions / totalSessions) * 100) : 100;
      const isDefaulter = totalSessions > 0 && attendancePct < threshold;

      return {
        student,
        totalSessions,
        presentCount,
        lateCount,
        absentCount,
        excusedCount,
        attendedSessions,
        attendancePct,
        isDefaulter,
      };
    });
  }, [students, monthlyAttendanceMap, sessionDates, threshold]);

  // Filtered Students
  const filteredMetrics = useMemo(() => {
    return studentMetrics.filter((item) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.student.full_name?.toLowerCase().includes(q);
        const matchAdm = item.student.admission_no?.toLowerCase().includes(q);
        const matchRoll = item.student.roll_no?.toLowerCase().includes(q);
        if (!matchName && !matchAdm && !matchRoll) return false;
      }

      // 2. Filter Mode
      if (filterMode === 'defaulters') {
        return item.isDefaulter;
      }
      if (filterMode === 'high') {
        return item.attendancePct >= 90;
      }

      return true;
    });
  }, [studentMetrics, searchQuery, filterMode]);

  // Aggregate Batch KPI Metrics
  const summaryKPIs = useMemo(() => {
    const totalEnrolled = students.length;
    const totalSessionsHeld = sessionDates.length;

    if (totalEnrolled === 0 || totalSessionsHeld === 0) {
      return {
        totalEnrolled,
        totalSessionsHeld,
        avgAttendanceRate: 0,
        regularCount: totalEnrolled,
        defaulterCount: 0,
      };
    }

    let sumPct = 0;
    let defaulters = 0;

    studentMetrics.forEach((m) => {
      sumPct += m.attendancePct;
      if (m.isDefaulter) defaulters++;
    });

    const avgAttendanceRate = Math.round(sumPct / totalEnrolled);
    const regularCount = totalEnrolled - defaulters;

    return {
      totalEnrolled,
      totalSessionsHeld,
      avgAttendanceRate,
      regularCount,
      defaulterCount: defaulters,
    };
  }, [students, sessionDates, studentMetrics]);

  // Export Handlers
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      await exportMonthlyRegisterToExcel({
        batch: activeBatch,
        year: selectedYear,
        monthIndex: selectedMonthIndex,
        monthName: MONTH_NAMES[selectedMonthIndex],
        daysInMonth,
        sessionDates,
        students,
        monthlyAttendanceMap,
        threshold,
        academyName: instituteName,
      });
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to generate Excel register: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportCSV = () => {
    try {
      exportMonthlyRegisterToCSV({
        batch: activeBatch,
        year: selectedYear,
        monthIndex: selectedMonthIndex,
        monthName: MONTH_NAMES[selectedMonthIndex],
        daysInMonth,
        sessionDates,
        students,
        monthlyAttendanceMap,
        threshold,
      });
    } catch (err) {
      console.error('CSV Export failed:', err);
      alert('Failed to generate CSV: ' + err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Month & Cohort Controls Toolbar */}
      <div
        className="erp-card"
        style={{
          padding: '16px 20px',
          backgroundColor: '#ffffff',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 450px' }}>
          {/* Cohort Selector */}
          <div style={{ minWidth: '220px' }}>
            <label className="form-label" style={{ marginBottom: '4px' }}>
              Academic Cohort
            </label>
            <select
              value={selectedBatchId}
              onChange={(e) => onSelectBatch(e.target.value)}
              className="form-select"
            >
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name} ({b.timing || 'Schedule TBD'})
                </option>
              ))}
            </select>
          </div>

          {/* Month Selector */}
          <div style={{ minWidth: '150px' }}>
            <label className="form-label" style={{ marginBottom: '4px' }}>
              Calendar Month
            </label>
            <select
              value={selectedMonthIndex}
              onChange={(e) => setSelectedMonthIndex(parseInt(e.target.value, 10))}
              className="form-select"
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div style={{ width: '100px' }}>
            <label className="form-label" style={{ marginBottom: '4px' }}>
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="form-select"
            >
              <option value={selectedYear - 1}>{selectedYear - 1}</option>
              <option value={selectedYear}>{selectedYear}</option>
              <option value={selectedYear + 1}>{selectedYear + 1}</option>
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchMonthlyData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={handleExportCSV}
            disabled={loading || students.length === 0}
          >
            Export CSV
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={FileSpreadsheet}
            onClick={handleExportExcel}
            disabled={loading || isExporting || students.length === 0}
          >
            {isExporting ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
          </Button>
        </div>
      </div>

      {/* Database Error Banner */}
      {error && (
        <div
          style={{
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
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>
            <strong>Database Query Notice:</strong> {error}
          </span>
        </div>
      )}

      {/* 2. Executive Analytics Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '14px',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderTop: '3px solid var(--navy-900)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Cohort Enrollment
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--navy-950)', marginTop: '4px' }}>
            {summaryKPIs.totalEnrolled} Students
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {activeBatch?.classroom || 'Classroom TBD'} &bull; {activeBatch?.timing || 'Regular'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderTop: '3px solid var(--gold-primary)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Sessions Conducted
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--gold-dark)', marginTop: '4px' }}>
            {summaryKPIs.totalSessionsHeld} Days
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            In {MONTH_NAMES[selectedMonthIndex]} {selectedYear}
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderTop: '3px solid #0369a1',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Average Attendance Rate
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#0369a1', marginTop: '4px' }}>
            {summaryKPIs.avgAttendanceRate}%
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Cumulative cohort average
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#ffffff',
            padding: '14px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-subtle)',
            borderTop: '3px solid var(--status-present)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
            Regular Students
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-present)', marginTop: '4px' }}>
            {summaryKPIs.regularCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Meeting &ge; {threshold}% standard
          </div>
        </div>

        <div
          style={{
            backgroundColor: summaryKPIs.defaulterCount > 0 ? 'var(--status-absent-bg)' : '#ffffff',
            padding: '14px 16px',
            borderRadius: '6px',
            border: `1px solid ${summaryKPIs.defaulterCount > 0 ? 'var(--status-absent-border)' : 'var(--border-subtle)'}`,
            borderTop: '3px solid var(--status-absent)',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--status-absent)', textTransform: 'uppercase', fontWeight: 600 }}>
            Attendance Defaulters
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-absent)', marginTop: '4px' }}>
            {summaryKPIs.defaulterCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--status-absent)', marginTop: '2px' }}>
            Below minimum &lt; {threshold}% requirement
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div
        className="erp-card"
        style={{
          padding: '12px 18px',
          backgroundColor: '#ffffff',
          display: 'flex',
          gap: '14px',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
          />
          <input
            type="text"
            placeholder="Search student or roll no..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: '32px', height: '34px', fontSize: '13px' }}
          />
        </div>

        {/* Filter Segmented Control */}
        <div style={{ display: 'inline-flex', borderRadius: '5px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filterMode === 'all' ? 'var(--navy-900)' : '#ffffff',
              color: filterMode === 'all' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            All Students ({studentMetrics.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('defaulters')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderLeft: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              backgroundColor: filterMode === 'defaulters' ? 'var(--status-absent)' : '#ffffff',
              color: filterMode === 'defaulters' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            ⚠️ Defaulters &lt; {threshold}% ({summaryKPIs.defaulterCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('high')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 600,
              border: 'none',
              borderLeft: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              backgroundColor: filterMode === 'high' ? 'var(--status-present)' : '#ffffff',
              color: filterMode === 'high' ? '#ffffff' : 'var(--text-secondary)',
            }}
          >
            ⭐ High (&ge; 90%)
          </button>
        </div>
      </div>

      {/* 4. Monthly Attendance Grid Register */}
      <div className="table-container">
        <div className="erp-table-scroll" style={{ maxHeight: '680px' }}>
          <table className="erp-table" style={{ fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th style={{ width: '40px', position: 'sticky', left: 0, zIndex: 11, backgroundColor: '#f8fafc' }}>
                  #
                </th>
                <th style={{ width: '90px', position: 'sticky', left: '40px', zIndex: 11, backgroundColor: '#f8fafc' }}>
                  Roll No
                </th>
                <th style={{ minWidth: '180px', position: 'sticky', left: '130px', zIndex: 11, backgroundColor: '#f8fafc' }}>
                  Student Name
                </th>

                {/* Day Columns 1..N */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(selectedYear, selectedMonthIndex, day);
                  const weekdayShort = WEEKDAY_SHORT[dateObj.getDay()];
                  const isSunday = dateObj.getDay() === 0;
                  const dayStr = String(day).padStart(2, '0');
                  const mStr = String(selectedMonthIndex + 1).padStart(2, '0');
                  const dateKey = `${selectedYear}-${mStr}-${dayStr}`;
                  const isSessionDay = sessionDates.includes(dateKey);

                  return (
                    <th
                      key={day}
                      style={{
                        textAlign: 'center',
                        padding: '6px 4px',
                        minWidth: '32px',
                        backgroundColor: isSunday ? '#f1f5f9' : isSessionDay ? '#f0f9ff' : '#f8fafc',
                        borderLeft: '1px solid var(--border-subtle)',
                      }}
                      title={`${day} ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear} (${weekdayShort}) ${isSessionDay ? '— Session Held' : ''}`}
                    >
                      <div style={{ fontSize: '10px', color: isSunday ? '#94a3b8' : 'var(--text-muted)' }}>
                        {weekdayShort}
                      </div>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: isSessionDay ? '#0369a1' : isSunday ? '#94a3b8' : 'var(--navy-950)',
                        }}
                      >
                        {day}
                      </div>
                      {isSessionDay && (
                        <div
                          style={{
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            backgroundColor: '#0284c7',
                            margin: '2px auto 0',
                          }}
                        />
                      )}
                    </th>
                  );
                })}

                {/* Cumulative Totals Columns */}
                <th style={{ textAlign: 'center', minWidth: '60px', backgroundColor: '#f8fafc' }}>
                  Held
                </th>
                <th style={{ textAlign: 'center', minWidth: '55px', backgroundColor: '#f8fafc', color: 'var(--status-present)' }}>
                  P
                </th>
                <th style={{ textAlign: 'center', minWidth: '55px', backgroundColor: '#f8fafc', color: 'var(--status-late)' }}>
                  L
                </th>
                <th style={{ textAlign: 'center', minWidth: '55px', backgroundColor: '#f8fafc', color: 'var(--status-absent)' }}>
                  A
                </th>
                <th style={{ textAlign: 'center', minWidth: '70px', backgroundColor: '#f8fafc' }}>
                  Rate %
                </th>
                <th style={{ textAlign: 'center', minWidth: '100px', backgroundColor: '#f8fafc' }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={daysInMonth + 9} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ marginBottom: '8px' }} />
                    <div>Loading monthly register for {MONTH_NAMES[selectedMonthIndex]} {selectedYear}...</div>
                  </td>
                </tr>
              ) : filteredMetrics.length === 0 ? (
                <tr>
                  <td colSpan={daysInMonth + 9} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
                    <Users size={32} color="var(--gold-dark)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--navy-950)' }}>
                      No Students Match Selected Filters
                    </div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                      Try adjusting search query or toggling back to &quot;All Students&quot;.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMetrics.map((item, index) => {
                  const student = item.student;
                  const studentMap = monthlyAttendanceMap[student.id] || {};

                  return (
                    <tr
                      key={student.id}
                      style={{
                        backgroundColor: item.isDefaulter ? '#fffbfb' : 'transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => setSelectedStudentForDossier(item)}
                    >
                      {/* Sticky Sr No */}
                      <td
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '11px',
                          position: 'sticky',
                          left: 0,
                          backgroundColor: item.isDefaulter ? '#fffbfb' : '#ffffff',
                          zIndex: 5,
                        }}
                      >
                        {index + 1}
                      </td>

                      {/* Sticky Roll No */}
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          fontWeight: 600,
                          position: 'sticky',
                          left: '40px',
                          backgroundColor: item.isDefaulter ? '#fffbfb' : '#ffffff',
                          zIndex: 5,
                        }}
                      >
                        {student.roll_no || '—'}
                      </td>

                      {/* Sticky Student Name */}
                      <td
                        style={{
                          position: 'sticky',
                          left: '130px',
                          backgroundColor: item.isDefaulter ? '#fffbfb' : '#ffffff',
                          zIndex: 5,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                            {student.full_name}
                          </span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {student.admission_no}
                          </span>
                        </div>
                      </td>

                      {/* Day Columns */}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const dayStr = String(day).padStart(2, '0');
                        const mStr = String(selectedMonthIndex + 1).padStart(2, '0');
                        const dateKey = `${selectedYear}-${mStr}-${dayStr}`;
                        const status = studentMap[dateKey];
                        const dateObj = new Date(selectedYear, selectedMonthIndex, day);
                        const isSunday = dateObj.getDay() === 0;

                        return (
                          <td
                            key={day}
                            style={{
                              textAlign: 'center',
                              padding: '6px 2px',
                              borderLeft: '1px solid var(--border-subtle)',
                              backgroundColor: isSunday ? '#fcfcfd' : 'transparent',
                            }}
                          >
                            {status === 'Present' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '20px',
                                  height: '20px',
                                  lineHeight: '20px',
                                  borderRadius: '3px',
                                  backgroundColor: 'var(--status-present-bg)',
                                  color: 'var(--status-present)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                }}
                                title={`${student.full_name} — Present on ${dayStr}-${mStr}-${selectedYear}`}
                              >
                                P
                              </span>
                            ) : status === 'Absent' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '20px',
                                  height: '20px',
                                  lineHeight: '20px',
                                  borderRadius: '3px',
                                  backgroundColor: 'var(--status-absent-bg)',
                                  color: 'var(--status-absent)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                }}
                                title={`${student.full_name} — Absent on ${dayStr}-${mStr}-${selectedYear}`}
                              >
                                A
                              </span>
                            ) : status === 'Late' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '20px',
                                  height: '20px',
                                  lineHeight: '20px',
                                  borderRadius: '3px',
                                  backgroundColor: 'var(--status-late-bg)',
                                  color: 'var(--status-late)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                }}
                                title={`${student.full_name} — Late on ${dayStr}-${mStr}-${selectedYear}`}
                              >
                                L
                              </span>
                            ) : status === 'Excused' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '20px',
                                  height: '20px',
                                  lineHeight: '20px',
                                  borderRadius: '3px',
                                  backgroundColor: 'var(--status-excused-bg)',
                                  color: 'var(--status-excused)',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                }}
                                title={`${student.full_name} — Excused on ${dayStr}-${mStr}-${selectedYear}`}
                              >
                                E
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '18px',
                                  color: '#cbd5e1',
                                  fontSize: '11px',
                                }}
                              >
                                &bull;
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Cumulative Held */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {item.totalSessions}
                      </td>

                      {/* Present */}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--status-present)' }}>
                        {item.presentCount}
                      </td>

                      {/* Late */}
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--status-late)' }}>
                        {item.lateCount}
                      </td>

                      {/* Absent */}
                      <td style={{ textAlign: 'center', fontWeight: 700, color: item.absentCount > 0 ? 'var(--status-absent)' : 'var(--text-muted)' }}>
                        {item.absentCount}
                      </td>

                      {/* Attendance % */}
                      <td style={{ textAlign: 'center' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: item.isDefaulter ? 'var(--status-absent)' : item.attendancePct >= 90 ? 'var(--status-present)' : 'var(--navy-900)',
                          }}
                        >
                          {item.attendancePct}%
                        </span>
                      </td>

                      {/* Eligibility Status Badge */}
                      <td style={{ textAlign: 'center' }}>
                        {item.isDefaulter ? (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--status-absent-bg)',
                              color: 'var(--status-absent)',
                              border: '1px solid var(--status-absent-border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <TrendingDown size={11} /> Defaulter
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--status-present-bg)',
                              color: 'var(--status-present)',
                              border: '1px solid var(--status-present-border)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                          >
                            <CheckCircle size={11} /> Regular
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Student Monthly Dossier Modal */}
      {selectedStudentForDossier && (
        <Modal
          isOpen={Boolean(selectedStudentForDossier)}
          onClose={() => setSelectedStudentForDossier(null)}
          title={`Monthly Attendance Dossier — ${selectedStudentForDossier.student.full_name}`}
          subtitle={`Admission No: ${selectedStudentForDossier.student.admission_no} • ${MONTH_NAMES[selectedMonthIndex]} ${selectedYear}`}
          size="md"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
              <Button variant="outline" size="sm" onClick={() => setSelectedStudentForDossier(null)}>
                Close
              </Button>
            </div>
          }
        >
          {(() => {
            const { student, totalSessions, presentCount, lateCount, absentCount, excusedCount, attendancePct, isDefaulter } =
              selectedStudentForDossier;
            const parent = student.parent_students?.[0]?.parents;
            const studentMap = monthlyAttendanceMap[student.id] || {};

            // Collect all missed sessions (Absent / Late)
            const missedDates = [];
            sessionDates.forEach((dateKey) => {
              const st = studentMap[dateKey];
              if (st === 'Absent' || st === 'Late' || st === 'Excused') {
                missedDates.push({ date: dateKey, status: st });
              }
            });

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Profile Overview Card */}
                <div
                  style={{
                    padding: '14px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Student Ward:</span>
                    <div style={{ fontWeight: 700, color: 'var(--navy-950)', marginTop: '2px' }}>
                      {student.full_name}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Roll / Admission:</span>
                    <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginTop: '2px' }}>
                      {student.roll_no || '—'} / {student.admission_no}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Linked Guardian:</span>
                    <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginTop: '2px' }}>
                      {parent?.full_name || 'No guardian linked'} {parent?.relationship ? `(${parent.relationship})` : ''}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Guardian Telegram:</span>
                    <div style={{ marginTop: '2px' }}>
                      {parent?.is_verified && parent?.telegram_chat_id ? (
                        <span style={{ color: 'var(--status-present)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <ShieldCheck size={13} /> Verified ({parent.telegram_chat_id})
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Unverified / Not Linked</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Monthly Performance Stats */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ padding: '10px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Present</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-present)' }}>{presentCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Late</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-late)' }}>{lateCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Absent</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-absent)' }}>{absentCount}</div>
                  </div>
                  <div style={{ padding: '10px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', borderRadius: '5px' }}>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rate %</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: isDefaulter ? 'var(--status-absent)' : 'var(--navy-950)' }}>
                      {attendancePct}%
                    </div>
                  </div>
                </div>

                {/* Defaulter Alert Message */}
                {isDefaulter && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'var(--status-absent-bg)',
                      border: '1px solid var(--status-absent-border)',
                      borderRadius: '5px',
                      color: 'var(--status-absent)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Minimum Standard Alert:</strong> Attendance is currently {attendancePct}%, below the required {threshold}% threshold.
                    </span>
                  </div>
                )}

                {/* Specific Dates Absent/Late */}
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '8px' }}>
                    Session Variance Log ({missedDates.length} Events)
                  </h4>
                  {missedDates.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--status-present)', padding: '10px', backgroundColor: 'var(--status-present-bg)', borderRadius: '4px' }}>
                      ✨ Perfect attendance recorded for this month with zero absences or delays!
                    </div>
                  ) : (
                    <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '5px' }}>
                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                        <tbody>
                          {missedDates.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                              <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{item.date}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                <Badge status={item.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Modal>
      )}
    </div>
  );
}
