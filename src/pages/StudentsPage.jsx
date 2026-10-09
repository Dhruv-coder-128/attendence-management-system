import React, { useState, useMemo } from 'react';
import { Plus, Eye, Phone, Mail, UserCheck, AlertTriangle } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';

/**
 * Students Directory Page
 * Provides full listing, filters by Grade and Fee Status, student profile preview, and new student admission modal
 */
export default function StudentsPage({ students, batches, onAddStudent }) {
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [selectedFeeStatus, setSelectedFeeStatus] = useState('All');
  const [activeStudent, setActiveStudent] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Student Form State
  const [newStudent, setNewStudent] = useState({
    name: '',
    grade: 'Grade 12',
    batchId: batches[0]?.id || '',
    contactNumber: '',
    email: '',
    parentName: '',
    parentRelationship: 'Father',
    parentPhone: '',
    feeStatus: 'Paid',
    gender: 'Male',
  });

  // Apply filters
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const matchGrade = selectedGrade === 'All' || s.grade === selectedGrade;
      const matchFee = selectedFeeStatus === 'All' || s.feeStatus === selectedFeeStatus;
      return matchGrade && matchFee;
    });
  }, [students, selectedGrade, selectedFeeStatus]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.parentPhone) return;

    const matchedBatch = batches.find((b) => b.id === newStudent.batchId);
    const created = {
      ...newStudent,
      id: `std-${Date.now()}`,
      admissionNo: `VNG-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      batchName: matchedBatch ? matchedBatch.name : 'Unassigned Batch',
      enrolledDate: new Date().toISOString().split('T')[0],
      attendanceRate: 100,
      status: 'Active',
      parentEmail: `${newStudent.name.toLowerCase().replace(/\s+/g, '.')}@family.in`,
    };

    onAddStudent(created);
    setIsAddModalOpen(false);
    // Reset form
    setNewStudent({
      name: '',
      grade: 'Grade 12',
      batchId: batches[0]?.id || '',
      contactNumber: '',
      email: '',
      parentName: '',
      parentRelationship: 'Father',
      parentPhone: '',
      feeStatus: 'Paid',
      gender: 'Male',
    });
  };

  const columns = [
    {
      header: 'Admission No',
      key: 'admissionNo',
      width: '130px',
      render: (item) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}>
          {item.admissionNo}
        </span>
      ),
    },
    {
      header: 'Student Name',
      key: 'name',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{item.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.email}</div>
        </div>
      ),
    },
    {
      header: 'Grade & Batch',
      key: 'batchName',
      render: (item) => (
        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--navy-800)' }}>
            {item.grade}
          </span>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            {item.batchName}
          </div>
        </div>
      ),
    },
    {
      header: 'Attendance',
      key: 'attendanceRate',
      render: (item) => {
        const isLow = item.attendanceRate < 75;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                fontWeight: 700,
                color: isLow ? 'var(--status-absent)' : 'var(--status-present)',
              }}
            >
              {item.attendanceRate}%
            </span>
            {isLow && <AlertTriangle size={13} color="var(--status-absent)" title="Below 75% policy limit" />}
          </div>
        );
      },
    },
    {
      header: 'Fee Status',
      key: 'feeStatus',
      render: (item) => <Badge status={item.feeStatus} />,
    },
    {
      header: 'Guardian Contact',
      key: 'parentName',
      render: (item) => (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 500 }}>{item.parentName}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.parentPhone}</div>
        </div>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (item) => <Badge status={item.status} />,
    },
    {
      header: 'Action',
      key: 'actions',
      align: 'right',
      render: (item) => (
        <Button
          variant="outline"
          size="sm"
          icon={Eye}
          onClick={(e) => {
            e.stopPropagation();
            setActiveStudent(item);
          }}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Student Directory</h1>
          <p className="page-description">
            Enrolled Student Records • 472 Active Students across Grades 9 through 12
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setIsAddModalOpen(true)}
          >
            New Admission
          </Button>
        </div>
      </div>

      {/* Filter Toolbar Controls */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div style={{ width: '180px' }}>
          <Select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            options={['All', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']}
            className="mb-0"
          />
        </div>

        <div style={{ width: '180px' }}>
          <Select
            value={selectedFeeStatus}
            onChange={(e) => setSelectedFeeStatus(e.target.value)}
            options={['All', 'Paid', 'Pending', 'Overdue']}
            className="mb-0"
          />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Displaying <strong>{filteredStudents.length}</strong> enrolled records
        </div>
      </div>

      {/* Main Student Data Table */}
      <DataTable
        columns={columns}
        data={filteredStudents}
        searchPlaceholder="Search by name, roll no, or phone..."
        onRowClick={(item) => setActiveStudent(item)}
      />

      {/* Student Details Profile Modal */}
      <Modal
        isOpen={Boolean(activeStudent)}
        onClose={() => setActiveStudent(null)}
        title="Student Profile Dossier"
        subtitle={activeStudent ? `${activeStudent.name} (${activeStudent.admissionNo})` : ''}
        footer={
          <Button variant="outline" size="sm" onClick={() => setActiveStudent(null)}>
            Close Dossier
          </Button>
        }
      >
        {activeStudent && (
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
                  width: '56px',
                  height: '56px',
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
                {activeStudent.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)' }}>
                  {activeStudent.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {activeStudent.grade} • {activeStudent.batchName}
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <Badge status={activeStudent.status} />
                  <Badge status={activeStudent.feeStatus} />
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
                  Admission Number
                </span>
                <strong>{activeStudent.admissionNo}</strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Attendance Record
                </span>
                <strong style={{ color: activeStudent.attendanceRate < 75 ? 'var(--status-absent)' : 'var(--status-present)' }}>
                  {activeStudent.attendanceRate}% cumulative
                </strong>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Enrolled Since
                </span>
                <span>{activeStudent.enrolledDate}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Blood Group / Gender
                </span>
                <span>{activeStudent.bloodGroup || 'O+'} • {activeStudent.gender}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Parent / Guardian
                </span>
                <span>{activeStudent.parentName} ({activeStudent.parentRelationship})</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Guardian Phone
                </span>
                <span>{activeStudent.parentPhone}</span>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>
                  Residential Address
                </span>
                <span>{activeStudent.address || 'Chennai Central, Tamil Nadu'}</span>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* New Student Admission Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Student Admission"
        subtitle="Vanguard Academy Academic Enrollment"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateSubmit}>
              Confirm Admission
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <Input
            label="Full Legal Name"
            value={newStudent.name}
            onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
            placeholder="e.g. Siddharth Narayanan"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Academic Grade"
              value={newStudent.grade}
              onChange={(e) => setNewStudent({ ...newStudent, grade: e.target.value })}
              options={['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']}
              required
            />
            <Select
              label="Assigned Batch"
              value={newStudent.batchId}
              onChange={(e) => setNewStudent({ ...newStudent, batchId: e.target.value })}
              options={batches.map((b) => ({ value: b.id, label: `${b.code} - ${b.subject}` }))}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Student Contact Phone"
              value={newStudent.contactNumber}
              onChange={(e) => setNewStudent({ ...newStudent, contactNumber: e.target.value })}
              placeholder="+91 98400 12345"
            />
            <Input
              label="Student Email"
              type="email"
              value={newStudent.email}
              onChange={(e) => setNewStudent({ ...newStudent, email: e.target.value })}
              placeholder="siddharth@student.vanguard.edu"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Parent / Guardian Name"
              value={newStudent.parentName}
              onChange={(e) => setNewStudent({ ...newStudent, parentName: e.target.value })}
              placeholder="e.g. Narayanan K."
              required
            />
            <Input
              label="Guardian Mobile (For Telegram / SMS)"
              value={newStudent.parentPhone}
              onChange={(e) => setNewStudent({ ...newStudent, parentPhone: e.target.value })}
              placeholder="+91 98400 54321"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
