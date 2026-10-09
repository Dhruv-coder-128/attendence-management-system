import React from 'react';
import {
  Users,
  CalendarCheck,
  UserX,
  BookOpen,
  DollarSign,
  ArrowRight,
  BellRing,
  Clock,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import StatsCard from '../components/common/StatsCard';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';

/**
 * Executive Dashboard Page
 * Features high-density enterprise metrics, today's roll call status, absentee alerts, and batch allocation
 */
export default function DashboardPage({
  summary,
  attendanceList,
  batches,
  students,
  onNavigate,
  onAlertParent,
}) {
  // Extract today's absent and late students
  const absentees = attendanceList.filter(
    (item) => item.status === 'Absent' || item.status === 'Late'
  );

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Executive Academic Dashboard</h1>
          <p className="page-description">
            {summary.instituteName} — {summary.campusName} • Real-time Session Overview
          </p>
        </div>

        <div className="page-actions">
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

      {/* Primary KPI Grid (400–500 student scale) */}
      <div className="stats-grid">
        <StatsCard
          title="Total Enrolled Students"
          value={`${summary.totalEnrolled} / ${summary.capacityLimit}`}
          subtext="94.4% Capacity Utilization"
          icon={Users}
          variant="navy"
          trend={{ value: '+14 this month', isPositive: true }}
        />

        <StatsCard
          title="Today's Attendance Rate"
          value={`${summary.todayAttendanceRate}%`}
          subtext={`${summary.todayPresentCount} of ${summary.totalEnrolled} checked in`}
          icon={CalendarCheck}
          variant="success"
          trend={{ value: 'Target: >90%', isPositive: true }}
        />

        <StatsCard
          title="Unexcused Absentees Today"
          value={summary.todayAbsentCount}
          subtext="Automated parent alerts queued"
          icon={UserX}
          variant="danger"
          trend={{ value: 'Immediate Action', isPositive: false }}
        />

        <StatsCard
          title="Active Batches Running"
          value={summary.totalBatches}
          subtext={`${summary.activeFaculty} Senior Faculty on duty`}
          icon={BookOpen}
          variant="gold"
        />

        <StatsCard
          title="Tuition Fee Reconciliation"
          value={`${summary.feeCollectionRate}%`}
          subtext="Term 1 fee collection rate"
          icon={DollarSign}
          variant="navy"
        />
      </div>

      {/* Main Two-Column Enterprise Section */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '24px',
          marginBottom: '24px',
        }}
      >
        {/* Left Card: Today's Absentee & Late Students */}
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
                Morning &amp; Afternoon batch roll call discrepancies
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('attendance')}
            >
              All Records <ArrowRight size={13} />
            </Button>
          </div>

          <div className="erp-table-scroll">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Batch / Subject</th>
                  <th>Status</th>
                  <th>Reason / Remarks</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {absentees.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        textAlign: 'center',
                        padding: '24px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <CheckCircle2 size={24} color="var(--status-present)" style={{ marginBottom: '6px' }} />
                      <div>All registered students accounted for today.</div>
                    </td>
                  </tr>
                ) : (
                  absentees.map((record) => (
                    <tr key={record.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>
                          {record.studentName}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {record.admissionNo}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {record.batchName.split(' ')[0]} {record.batchName.split(' ')[1]}
                        </span>
                      </td>
                      <td>
                        <Badge status={record.status} />
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '200px', whiteSpace: 'normal' }}>
                        {record.remarks || 'Uninformed'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant={record.guardianNotified ? 'outline' : 'gold'}
                          size="sm"
                          icon={BellRing}
                          onClick={() => onAlertParent && onAlertParent(record)}
                        >
                          {record.guardianNotified ? 'Notified' : 'Alert'}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Card: Batch Schedule & Live Occupancy */}
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
                Current academic schedules and classroom occupancy
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('batches')}
            >
              View All 16 <ArrowRight size={13} />
            </Button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {batches.slice(0, 5).map((batch) => {
              const ratio = Math.round((batch.enrolledCount / batch.maxCapacity) * 100);
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
                        <Clock size={11} /> {batch.timing}
                      </span>
                      <span>{batch.classroom}</span>
                      <span>{batch.instructor.split(',')[0]}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '80px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-950)' }}>
                      {batch.enrolledCount} / {batch.maxCapacity}
                    </div>
                    <div
                      style={{
                        width: '80px',
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
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
