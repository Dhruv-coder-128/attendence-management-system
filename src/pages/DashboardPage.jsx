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
  Sparkles,
} from 'lucide-react';
import StatsCard from '../components/common/StatsCard';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Executive Academic Dashboard — 100% Real Supabase PostgreSQL Integration
 * Derived entirely from public.students, public.batches, public.courses, and public.attendance
 */
export default function DashboardPage({ onNavigate, onAlertParent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Live Database Derived Statistics
  const [stats, setStats] = useState({
    totalEnrolled: 0,
    totalCapacity: 0,
    totalBatches: 0,
    totalCourses: 0,
    todayPresentCount: 0,
    todayAbsentCount: 0,
    todayLateCount: 0,
    todayExcusedCount: 0,
    todayTotalMarked: 0,
    todayAttendanceRate: 0,
  });

  const [todayAbsentees, setTodayAbsentees] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);

  const todayIso = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Fetch all live metrics directly from Supabase
  const fetchDashboardData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase credentials are not configured in .env.local.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Total Enrolled Students (Count from public.students)
      const { data: studentsData, count: studentCount, error: studentsErr } = await supabase
        .from('students')
        .select('id, status', { count: 'exact' });
      if (studentsErr) throw studentsErr;

      // 2. Active Batches with enrolled student count (Count from public.batches)
      const { data: batchesData, error: batchesErr } = await supabase
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
        .eq('is_active', true)
        .order('name');
      if (batchesErr) throw batchesErr;

      // 3. Courses Count
      const { count: coursesCount, error: coursesErr } = await supabase
        .from('courses')
        .select('id', { count: 'exact', head: true });
      if (coursesErr) throw coursesErr;

      // 4. Today's Attendance Records
      const { data: attendanceData, error: attendanceErr } = await supabase
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
          students:student_id ( id, full_name, admission_no, roll_no ),
          batches:batch_id ( id, name, code )
        `)
        .eq('date', todayIso);
      if (attendanceErr) throw attendanceErr;

      // DERIVE ALL STATISTICS STRICTLY FROM REAL RECORDS
      const totalEnrolled = studentCount || (studentsData ? studentsData.length : 0);
      const totalBatches = batchesData ? batchesData.length : 0;
      const totalCapacity = (batchesData || []).reduce(
        (acc, b) => acc + (Number(b.max_capacity) || 0),
        0
      );

      const records = attendanceData || [];
      const presentCount = records.filter((r) => r.status === 'Present').length;
      const absentCount = records.filter((r) => r.status === 'Absent').length;
      const lateCount = records.filter((r) => r.status === 'Late').length;
      const excusedCount = records.filter((r) => r.status === 'Excused').length;
      const totalMarked = records.length;
      const attendanceRate = totalMarked > 0 ? Math.round((presentCount / totalMarked) * 100) : 0;

      const absentees = records.filter((r) => r.status === 'Absent' || r.status === 'Late');

      setStats({
        totalEnrolled,
        totalCapacity,
        totalBatches,
        totalCourses: coursesCount || 0,
        todayPresentCount: presentCount,
        todayAbsentCount: absentCount,
        todayLateCount: lateCount,
        todayExcusedCount: excusedCount,
        todayTotalMarked: totalMarked,
        todayAttendanceRate: attendanceRate,
      });

      setTodayAbsentees(absentees);
      setActiveBatches(batchesData || []);
    } catch (err) {
      console.error('Error querying dashboard data from Supabase:', err);
      setError(err.message || 'Failed to fetch database metrics.');
    } finally {
      setLoading(false);
    }
  }, [todayIso]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Executive Academic Dashboard</h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--navy-900)',
                color: 'var(--gold-primary)',
                border: '1px solid var(--gold-border)',
              }}
            >
              PostgreSQL Live
            </span>
          </div>
          <p className="page-description">
            Ruparel Attendance ERP &bull; Session Date: <strong>{todayFormatted}</strong> &bull; Real-time database metrics
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
            variant="outline"
            size="sm"
            icon={BookOpen}
            onClick={() => onNavigate('batches')}
          >
            Manage Batches
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={CalendarCheck}
            onClick={() => onNavigate('attendance')}
          >
            Launch Roll Call
          </Button>
        </div>
      </div>

      {/* Database Error Banner */}
      {error && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: 'var(--status-absent-bg)',
            border: '1px solid var(--status-absent-border)',
            borderRadius: '6px',
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
            Retry Query
          </Button>
        </div>
      )}

      {/* Primary KPI Grid (100% Derived from Real PostgreSQL Records) */}
      <div className="stats-grid">
        <StatsCard
          title="Total Enrolled Students"
          value={
            loading
              ? '...'
              : stats.totalCapacity > 0
              ? `${stats.totalEnrolled} / ${stats.totalCapacity}`
              : `${stats.totalEnrolled}`
          }
          subtext={
            stats.totalCapacity > 0
              ? `${Math.round((stats.totalEnrolled / stats.totalCapacity) * 100)}% Capacity Utilized`
              : stats.totalEnrolled === 0
              ? '0 students registered in database'
              : 'Active student registry'
          }
          icon={Users}
          variant="navy"
        />

        <StatsCard
          title="Today's Attendance Rate"
          value={loading ? '...' : `${stats.todayAttendanceRate}%`}
          subtext={
            stats.todayTotalMarked > 0
              ? `${stats.todayPresentCount} of ${stats.todayTotalMarked} roll calls marked present`
              : 'No roll calls recorded today'
          }
          icon={CalendarCheck}
          variant={stats.todayAttendanceRate >= 75 ? 'success' : stats.todayTotalMarked === 0 ? 'navy' : 'gold'}
        />

        <StatsCard
          title="Unexcused Absentees Today"
          value={loading ? '...' : `${stats.todayAbsentCount}`}
          subtext={
            stats.todayAbsentCount > 0
              ? `${stats.todayAbsentCount} require parent contact`
              : 'Zero absentees recorded today'
          }
          icon={UserX}
          variant={stats.todayAbsentCount > 0 ? 'danger' : 'success'}
        />

        <StatsCard
          title="Active Batches Configured"
          value={loading ? '...' : `${stats.totalBatches}`}
          subtext={`${stats.totalCourses} Academic Courses active`}
          icon={BookOpen}
          variant="gold"
        />

        <StatsCard
          title="Today's Roll Call Entries"
          value={loading ? '...' : `${stats.todayTotalMarked}`}
          subtext={`${stats.todayLateCount} late arrivals &bull; ${stats.todayExcusedCount} excused`}
          icon={Clock}
          variant="navy"
        />
      </div>

      {/* Main Two-Column Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        {/* Left Column: Today's Absentee & Late Students */}
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
                Today's Roll Call Alerts (Absent &amp; Late)
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Session discrepancies recorded in public.attendance for {todayIso}
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

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                      <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <div>Querying attendance records...</div>
                    </td>
                  </tr>
                ) : todayAbsentees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: 'center',
                        padding: '28px 16px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <CheckCircle2
                        size={28}
                        color="var(--status-present)"
                        style={{ margin: '0 auto 8px', display: 'block' }}
                      />
                      <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                        No Absent or Late Students Logged Today
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        {stats.todayTotalMarked === 0
                          ? 'Roll call has not been submitted for today yet.'
                          : 'All marked students were present in today’s sessions.'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  todayAbsentees.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {record.students?.full_name || 'Student'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {record.students?.admission_no || 'No ID'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {record.batches?.code || record.batches?.name || 'Batch'}
                        </span>
                      </td>
                      <td>
                        <Badge status={record.status} />
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '180px', whiteSpace: 'normal' }}>
                        {record.remarks || 'Uninformed'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant="gold"
                          size="sm"
                          icon={BellRing}
                          onClick={() => {
                            if (onAlertParent) {
                              onAlertParent(record);
                            } else {
                              onNavigate('notifications');
                            }
                          }}
                        >
                          Alert
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Active Batches & Real Classroom Occupancy */}
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
                Batches &amp; Hall Allocation
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Active cohorts in public.batches &amp; enrolled count
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('batches')}
            >
              All Batches ({activeBatches.length}) <ArrowRight size={13} />
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                <div>Loading batch schedule...</div>
              </div>
            ) : activeBatches.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  backgroundColor: 'var(--bg-subtle)',
                  borderRadius: '6px',
                  border: '1px dashed var(--border-subtle)',
                }}
              >
                <BookOpen size={28} color="var(--text-muted)" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
                  No Active Batches Configured
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Create batches in Courses &amp; Batches to begin assigning students.
                </div>
                <Button size="sm" variant="gold" onClick={() => onNavigate('batches')}>
                  Create New Batch
                </Button>
              </div>
            ) : (
              activeBatches.slice(0, 5).map((batch) => {
                const enrolled = batch.students?.[0]?.count ?? 0;
                const capacity = batch.max_capacity || 60;
                const ratio = Math.min(100, Math.round((enrolled / capacity) * 100));

                return (
                  <div
                    key={batch.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            backgroundColor: 'var(--navy-900)',
                            color: '#ffffff',
                            padding: '2px 6px',
                            borderRadius: '3px',
                          }}
                        >
                          {batch.code}
                        </span>
                        <strong
                          style={{
                            fontSize: '13px',
                            color: 'var(--navy-950)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {batch.name}
                        </strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          marginTop: '4px',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={11} /> {batch.timing || 'Schedule TBD'}
                        </span>
                        <span>{batch.classroom || 'Main Hall'}</span>
                        {batch.courses?.code && <span>{batch.courses.code}</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', minWidth: '85px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-950)' }}>
                        {enrolled} / {capacity}
                      </div>
                      <div
                        style={{
                          width: '85px',
                          height: '5px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '3px',
                          overflow: 'hidden',
                          marginTop: '4px',
                        }}
                      >
                        <div
                          style={{
                            width: `${ratio}%`,
                            height: '100%',
                            backgroundColor: ratio > 90 ? 'var(--gold-primary)' : 'var(--navy-700)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
