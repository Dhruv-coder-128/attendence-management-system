import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  CalendarCheck,
  UserX,
  BookOpen,
  Clock,
  ArrowRight,
  BellRing,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Send,
  CreditCard,
  Award,
  FileSpreadsheet,
  Database,
  Upload,
  Download,
  Sparkles,
  Plus,
  Cake,
} from 'lucide-react';
import StatsCard from '../components/common/StatsCard';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import SqlImportModal from '../components/importer/SqlImportModal';
import MasterImportModal from '../components/importer/MasterImportModal';
import BirthdayWishModal from '../components/students/BirthdayWishModal';
import { isStudentBirthdayToday } from '../lib/telegramClient.js';
import { downloadAllInOneTemplate } from '../lib/importer/templateGenerator';

/**
 * Simplified Executive Dashboard
 * Metrics: Students, Present Today, Absent Today, Active Batches
 * Followed by Today's Attendance table and a compact Batch Summary table.
 */
export default function DashboardPage({ onNavigate, onAlertParent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // 5 Primary Metrics (Strict Invariant: Present + Absent + Pending = Total Students)
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    pendingToday: 0,
    activeBatches: 0,
  });

  const [todayAttendance, setTodayAttendance] = useState([]);
  const [batchesSummary, setBatchesSummary] = useState([]);

  // Birthday Greeting State
  const [birthdayStudents, setBirthdayStudents] = useState([]);
  const [activeBirthdayStudent, setActiveBirthdayStudent] = useState(null);
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = useState(false);

  const todayIso = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Query live data directly from Supabase
  const fetchDashboardData = useCallback(async (isSilent = false) => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase credentials are not configured in environment.');
      setLoading(false);
      return;
    }

    if (!isSilent) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Total Enrolled Students & Birthday Detection
      const { data: studentsData, count: studentCount, error: sErr } = await supabase
        .from('students')
        .select('id, admission_no, roll_no, full_name, batch_id, dob, phone, contact_number, status', { count: 'exact' });
      if (sErr) throw sErr;

      const studentList = studentsData || [];
      const bdays = studentList.filter(
        (s) => s.status !== 'inactive' && s.status !== 'suspended' && isStudentBirthdayToday(s.dob)
      );
      setBirthdayStudents(bdays);

      // 2. Active Batches with enrolled student count
      const { data: batchesData, error: bErr } = await supabase
        .from('batches')
        .select(`
          id,
          code,
          name,
          timing,
          classroom,
          max_capacity,
          is_active,
          courses:course_id ( id, name, code ),
          students:students ( count )
        `)
        .order('name');
      if (bErr) throw bErr;

      // 3. Today's Attendance Records - Order by updated_at descending
      const { data: attendanceData, error: aErr } = await supabase
        .from('attendance')
        .select(`
          id,
          student_id,
          batch_id,
          date,
          status,
          time_in,
          remarks,
          telegram_notified,
          created_at,
          updated_at,
          students:student_id ( id, full_name, admission_no, roll_no ),
          batches:batch_id ( id, name, code )
        `)
        .eq('date', todayIso)
        .order('updated_at', { ascending: false });
      if (aErr) throw aErr;

      const records = attendanceData || [];
      // Build dynamic student lookup dictionary from real database students
      const liveStudentLookup = new Map();
      (studentList || []).forEach((s) => {
        if (s.admission_no) liveStudentLookup.set(String(s.admission_no).trim().toUpperCase(), s);
        if (s.id) liveStudentLookup.set(String(s.id).trim().toUpperCase(), s);
      });

      // Deduplicate attendance records: Strictly 1 authoritative state per student per date
      const studentAttendanceMap = new Map();
      records.forEach((r) => {
        const rawAdm = (r.students?.admission_no || r.admission_no || '').trim().toUpperCase();
        const rawId = (r.students?.id || r.student_id || '').trim().toUpperCase();
        const rawBatch = (r.batch_id || r.batch_code || r.batches?.code || r.batches?.id || '').trim().toUpperCase();
        const rawName = (r.students?.full_name || r.full_name || '').trim().toLowerCase();

        // 1. Match authoritatively by Admission No or Student ID
        let matched = (rawAdm ? liveStudentLookup.get(rawAdm) : null) || (rawId ? liveStudentLookup.get(rawId) : null);

        // 2. Fallback to name matching strictly scoped within the matching batch
        if (!matched && rawName) {
          matched = (studentList || []).find((s) => {
            const sBatch = String(s.batch_id || '').toUpperCase();
            const batchMatch = !rawBatch || sBatch === rawBatch;
            return batchMatch && String(s.full_name || '').trim().toLowerCase() === rawName;
          });
        }

        const studentKey = matched ? matched.admission_no : (rawAdm || rawId || null);
        if (!studentKey) return;

        // Timestamp Authority: Compare updated_at / created_at so newer records ALWAYS overwrite older records
        const existing = studentAttendanceMap.get(studentKey);
        const rTime = new Date(r.updated_at || r.created_at || r.time_in || 0).getTime();
        const existingTime = existing
          ? new Date(existing.updated_at || existing.created_at || existing.time_in || 0).getTime()
          : -1;

        if (!existing || rTime >= existingTime) {
          studentAttendanceMap.set(studentKey, {
            ...r,
            admission_no: matched ? matched.admission_no : (r.admission_no || studentKey),
            full_name: matched ? matched.full_name : (r.full_name || r.students?.full_name || ''),
            roll_no: matched ? matched.roll_no : (r.roll_no || r.students?.roll_no || ''),
          });
        }
      });

      const uniqueRecords = Array.from(studentAttendanceMap.values());
      const present = uniqueRecords.filter((r) => r.status === 'Present').length;
      const absent = uniqueRecords.filter((r) => r.status === 'Absent' || r.status === 'Late').length;
      const totalEnrolled = studentList.length;
      const pending = Math.max(0, totalEnrolled - (present + absent));

      setStats({
        totalStudents: totalEnrolled,
        presentToday: present,
        absentToday: absent,
        pendingToday: pending,
        activeBatches: (batchesData || []).filter((b) => b.is_active !== false).length,
      });

      setTodayAttendance(uniqueRecords);
      setBatchesSummary(batchesData || []);
    } catch (err) {
      console.error('Error querying dashboard data:', err);
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }, [todayIso]);

  useEffect(() => {
    fetchDashboardData(false);
  }, [fetchDashboardData]);

  // Live real-time reactivity: Refresh dashboard silently when phone attendance or records sync
  const debounceTimerRef = React.useRef(null);
  useEffect(() => {
    const handleDbMutation = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        fetchDashboardData(true);
      }, 400);
    };
    window.addEventListener('sms-db-mutation', handleDbMutation);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      window.removeEventListener('sms-db-mutation', handleDbMutation);
    };
  }, [fetchDashboardData]);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">
            Academic Session: <strong>{todayFormatted}</strong> &bull; Real-time institute overview
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchDashboardData}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>

          <Button
            variant="primary"
            size="sm"
            icon={CalendarCheck}
            onClick={() => onNavigate('attendance')}
          >
            Take Attendance
          </Button>
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            color: 'var(--status-absent)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>Database query error: {error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchDashboardData}>
            Retry
          </Button>
        </div>
      )}

      {/* 🎂 Celebratory Birthday Banner */}
      {birthdayStudents.length > 0 && (
        <div
          style={{
            marginBottom: '16px',
            padding: '14px 18px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.08) 0%, rgba(244, 114, 182, 0.16) 100%)',
            border: '1px solid rgba(236, 72, 153, 0.35)',
            boxShadow: '0 4px 14px rgba(236, 72, 153, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#ec4899',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(236, 72, 153, 0.35)',
              }}
            >
              <Cake size={22} />
            </div>
            <div>
              <div
                style={{
                  fontSize: '14.5px',
                  fontWeight: 700,
                  color: '#831843',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>🎂 Today's Student Birthdays ({birthdayStudents.length})</span>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    backgroundColor: '#fbcfe8',
                    color: '#9d174d',
                    fontWeight: 600,
                  }}
                >
                  Celebration
                </span>
              </div>
              <div style={{ fontSize: '12.5px', color: '#9d174d', marginTop: '2px' }}>
                {birthdayStudents.map((s, idx) => (
                  <span key={s.id || s.admission_no || idx} style={{ fontWeight: 600 }}>
                    {s.full_name} ({s.batch_name || s.batch_code || s.batch_id || 'General'})
                    {idx < birthdayStudents.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {birthdayStudents.map((s) => (
              <button
                key={s.id || s.admission_no}
                type="button"
                onClick={() => {
                  setActiveBirthdayStudent(s);
                  setIsBirthdayModalOpen(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 13px',
                  borderRadius: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #f472b6',
                  color: '#be185d',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease',
                }}
              >
                <Sparkles size={14} color="#ec4899" />
                Wish {s.full_name ? s.full_name.split(' ')[0] : 'Student'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5 PRIMARY STATS GRID (Enrolled, Present, Absent, Pending, Batches) */}
      <div className="stats-grid" style={{ marginBottom: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <StatsCard
          title="Total Students"
          value={loading ? '...' : String(stats.totalStudents)}
          subtext="Total enrolled students"
          icon={Users}
          variant="navy"
        />

        <StatsCard
          title="Present Today"
          value={loading ? '...' : String(stats.presentToday)}
          subtext="Marked present today"
          icon={CalendarCheck}
          variant="success"
        />

        <StatsCard
          title="Absent Today"
          value={loading ? '...' : String(stats.absentToday)}
          subtext="Marked absent or late"
          icon={UserX}
          variant={stats.absentToday > 0 ? 'danger' : 'navy'}
        />

        <StatsCard
          title="Pending Roll Call"
          value={loading ? '...' : String(stats.pendingToday)}
          subtext="Attendance not marked yet"
          icon={Clock}
          variant={stats.pendingToday > 0 ? 'warning' : 'success'}
        />

        <StatsCard
          title="Active Batches"
          value={loading ? '...' : String(stats.activeBatches)}
          subtext="Configured cohorts"
          icon={BookOpen}
          variant="gold"
        />
      </div>

      {/* Synchronized Attendance Proportion Bar: Present + Absent + Pending = Total */}
      {stats.totalStudents > 0 && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 18px',
            borderRadius: '12px',
            backgroundColor: '#ffffff',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: 700 }}>
            <span style={{ color: 'var(--navy-900)' }}>Today's Roll Call Completion</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {stats.presentToday + stats.absentToday} / {stats.totalStudents} Marked ({Math.round(((stats.presentToday + stats.absentToday) / stats.totalStudents) * 100)}%)
            </span>
          </div>
          <div
            style={{
              height: '8px',
              width: '100%',
              backgroundColor: '#f1f5f9',
              borderRadius: '999px',
              overflow: 'hidden',
              display: 'flex',
            }}
          >
            <div
              style={{
                width: `${(stats.presentToday / stats.totalStudents) * 100}%`,
                backgroundColor: '#10b981',
                transition: 'width 0.4s ease',
              }}
              title={`Present: ${stats.presentToday}`}
            />
            <div
              style={{
                width: `${(stats.absentToday / stats.totalStudents) * 100}%`,
                backgroundColor: '#ef4444',
                transition: 'width 0.4s ease',
              }}
              title={`Absent: ${stats.absentToday}`}
            />
            <div
              style={{
                width: `${(stats.pendingToday / stats.totalStudents) * 100}%`,
                backgroundColor: '#f59e0b',
                transition: 'width 0.4s ease',
              }}
              title={`Pending: ${stats.pendingToday}`}
            />
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              Present: {stats.presentToday}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
              Absent: {stats.absentToday}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
              Pending: {stats.pendingToday}
            </span>
          </div>
        </div>
      )}

      {/* QUICK TASK SHORTCUTS */}
      <div
        className="erp-card"
        style={{
          padding: '12px 18px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          backgroundColor: '#ffffff',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Quick Shortcuts
        </span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            size="sm"
            icon={CalendarCheck}
            onClick={() => onNavigate('attendance')}
          >
            Mark Attendance
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Users}
            onClick={() => onNavigate('students')}
          >
            Student Directory
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={CreditCard}
            onClick={() => onNavigate('fees')}
          >
            Record Fee Payment
          </Button>
          <Button
            variant="outline"
            size="sm"
            icon={Award}
            onClick={() => onNavigate('exams')}
          >
            Enter Exam Marks
          </Button>
        </div>
      </div>

      {/* ZERO STATE / FRESH SCHOOL ONBOARDING HUB */}
      {!loading && stats.totalStudents === 0 && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-md)',
            padding: '24px',
            marginBottom: '24px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '4px',
              backgroundColor: 'var(--gold-primary)',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--gold-subtle-bg)',
                  border: '1px solid var(--gold-border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--gold-dark)',
                }}
              >
                <Sparkles size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 4px 0' }}>
                  Welcome to SMS — School Database Setup &amp; Onboarding
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                  Your school database is clean with 0 students. Choose how you would like to import or enter your institution's data:
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {/* Card 1: Excel / CSV Import */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <FileSpreadsheet size={22} color="#15803d" />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--navy-950)' }}>
                    All-in-One Master Excel
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Upload 1 master spreadsheet &bull; Auto-builds all Courses, Batches, Students, Parents &amp; Fees.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download}
                  onClick={async () => {
                    setDownloadingTemplate(true);
                    try {
                      await downloadAllInOneTemplate('xlsx');
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setDownloadingTemplate(false);
                    }
                  }}
                  disabled={downloadingTemplate}
                  style={{ flex: 1, fontSize: '11.5px' }}
                >
                  {downloadingTemplate ? '...' : 'Master Template (.xlsx)'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={Upload}
                  onClick={() => setIsMasterModalOpen(true)}
                  style={{ flex: 1.2, fontSize: '11.5px' }}
                >
                  All-in-One Import
                </Button>
              </div>
            </div>

            {/* Card 2: SQL Script / Backup */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Database size={22} color="var(--gold-dark)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--navy-950)' }}>
                    Import SQL Dump
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Already have a database backup or SQL file? Paste or upload INSERT statements to populate tables.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={Database}
                onClick={() => setIsSqlModalOpen(true)}
                style={{ width: '100%', fontSize: '12px' }}
              >
                Upload / Run SQL Script
              </Button>
            </div>

            {/* Card 3: Manual Entry */}
            <div
              style={{
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <Users size={22} color="var(--navy-700)" />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--navy-950)' }}>
                    Start Fresh Manually
                  </h3>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Create cohorts, set class schedules, and enroll students one-by-one through the administrative registry.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigate('batches')}
                  style={{ flex: 1, fontSize: '11.5px' }}
                >
                  + Add Batch
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onNavigate('students')}
                  style={{ flex: 1.2, fontSize: '11.5px' }}
                >
                  + Enroll Student
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TWO SECTIONS BELOW STATS: TODAY'S ATTENDANCE & BATCH SUMMARY */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: '24px',
        }}
      >
        {/* SECTION 1: TODAY'S ATTENDANCE */}
        <div className="erp-card" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--navy-950)',
                }}
              >
                Today's Attendance
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Recorded entries for {todayIso} ({todayAttendance.length} records)
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('attendance')}
            >
              Open Register <ArrowRight size={13} />
            </Button>
          </div>

          <div className="erp-table-scroll" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Time In</th>
                  <th style={{ textAlign: 'right' }}>Alert</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      Loading attendance records...
                    </td>
                  </tr>
                ) : todayAttendance.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: 'center',
                        padding: '36px 16px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <CalendarCheck
                        size={28}
                        color="var(--navy-400)"
                        style={{ margin: '0 auto 8px', display: 'block' }}
                      />
                      <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                        No attendance marked today yet
                      </div>
                      <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                        Open the attendance register to launch today's roll call.
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onNavigate('attendance')}
                      >
                        Start Roll Call
                      </Button>
                    </td>
                  </tr>
                ) : (
                  todayAttendance.map((rec) => {
                    const isAbsent = rec.status === 'Absent' || rec.status === 'Late';

                    return (
                      <tr key={rec.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                            {rec.students?.full_name || rec.full_name || rec.student_name || 'Student'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {rec.students?.admission_no || rec.admission_no || (rec.roll_no ? `Roll: ${rec.roll_no}` : 'N/A')}
                          </div>
                        </td>

                        <td>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {rec.batches?.name || rec.batch_name || rec.batches?.code || rec.batch_code || 'Cohort'}
                          </span>
                        </td>

                        <td>
                          <Badge status={rec.status} />
                        </td>

                        <td>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {rec.time_in ? rec.time_in.slice(0, 5) : '—'}
                          </span>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          {isAbsent ? (
                            <Button
                              variant="gold"
                              size="sm"
                              icon={BellRing}
                              onClick={() => {
                                if (onAlertParent) onAlertParent(rec);
                                else onNavigate('notifications');
                              }}
                              title="Alert Parent via Telegram"
                            >
                              Alert
                            </Button>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {rec.telegram_notified ? 'Sent' : '—'}
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

        {/* SECTION 2: BATCH SUMMARY */}
        <div className="erp-card" style={{ padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--navy-950)',
                }}
              >
                Batch Summary
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Active cohorts and enrolled strength ({batchesSummary.length} batches)
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('batches')}
            >
              All Batches <ArrowRight size={13} />
            </Button>
          </div>

          <div className="erp-table-scroll" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Course</th>
                  <th>Schedule</th>
                  <th style={{ textAlign: 'right' }}>Strength</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      Loading batches...
                    </td>
                  </tr>
                ) : batchesSummary.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                      No batches created yet.
                    </td>
                  </tr>
                ) : (
                  batchesSummary.map((b) => {
                    const enrolled = b.students?.[0]?.count ?? 0;
                    const capacity = b.max_capacity || 60;
                    const percent = Math.min(100, Math.round((enrolled / capacity) * 100));

                    return (
                      <tr key={b.id}>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                            {b.name}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            Code: {b.code} &bull; Room: {b.classroom || 'Main'}
                          </div>
                        </td>

                        <td>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {b.courses?.name || b.courses?.code || 'General'}
                          </span>
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                            <Clock size={11} />
                            <span>{b.timing || 'Standard'}</span>
                          </div>
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--navy-950)' }}>
                            {enrolled} / {capacity}
                          </div>
                          <div
                            style={{
                              width: '60px',
                              height: '4px',
                              backgroundColor: '#e2e8f0',
                              borderRadius: '2px',
                              overflow: 'hidden',
                              marginTop: '3px',
                              marginLeft: 'auto',
                            }}
                          >
                            <div
                              style={{
                                width: `${percent}%`,
                                height: '100%',
                                backgroundColor: percent > 90 ? 'var(--gold-primary)' : 'var(--navy-700)',
                              }}
                            />
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
      </div>

      <SqlImportModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
        onSuccess={() => fetchDashboardData()}
      />

      <MasterImportModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        onSuccess={() => fetchDashboardData()}
      />

      <BirthdayWishModal
        isOpen={isBirthdayModalOpen}
        onClose={() => setIsBirthdayModalOpen(false)}
        student={activeBirthdayStudent}
      />
    </div>
  );
}
