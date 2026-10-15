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
} from 'lucide-react';
import StatsCard from '../components/common/StatsCard';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Simplified Executive Dashboard
 * Metrics: Students, Present Today, Absent Today, Active Batches
 * Followed by Today's Attendance table and a compact Batch Summary table.
 */
export default function DashboardPage({ onNavigate, onAlertParent }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 4 Primary Metrics
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    activeBatches: 0,
  });

  const [todayAttendance, setTodayAttendance] = useState([]);
  const [batchesSummary, setBatchesSummary] = useState([]);

  const todayIso = new Date().toISOString().split('T')[0];
  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Query live data directly from Supabase
  const fetchDashboardData = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase credentials are not configured in environment.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Total Enrolled Students
      const { count: studentCount, error: sErr } = await supabase
        .from('students')
        .select('id', { count: 'exact', head: true });
      if (sErr) throw sErr;

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

      // 3. Today's Attendance Records
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
          students:student_id ( id, full_name, admission_no, roll_no ),
          batches:batch_id ( id, name, code )
        `)
        .eq('date', todayIso)
        .order('created_at', { ascending: false });
      if (aErr) throw aErr;

      const records = attendanceData || [];
      const present = records.filter((r) => r.status === 'Present').length;
      const absent = records.filter((r) => r.status === 'Absent' || r.status === 'Late').length;

      setStats({
        totalStudents: studentCount || 0,
        presentToday: present,
        absentToday: absent,
        activeBatches: (batchesData || []).filter((b) => b.is_active !== false).length,
      });

      setTodayAttendance(records);
      setBatchesSummary(batchesData || []);
    } catch (err) {
      console.error('Error querying dashboard data:', err);
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  }, [todayIso]);

  useEffect(() => {
    fetchDashboardData();
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

      {/* EXACTLY 4 PRIMARY STATS */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <StatsCard
          title="Students"
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
          title="Active Batches"
          value={loading ? '...' : String(stats.activeBatches)}
          subtext="Configured cohorts"
          icon={BookOpen}
          variant="gold"
        />
      </div>

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
                            {rec.students?.full_name || 'Student'}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {rec.students?.admission_no || 'N/A'}
                          </div>
                        </td>

                        <td>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {rec.batches?.name || rec.batches?.code || 'Batch'}
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
    </div>
  );
}
