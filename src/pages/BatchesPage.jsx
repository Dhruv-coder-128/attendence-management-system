import React, { useState } from 'react';
import { Plus, Clock, MapPin, User, BookOpen, Layers } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';

/**
 * Courses & Batches Management Page
 */
export default function BatchesPage({ batches, onAddBatch }) {
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const [newBatch, setNewBatch] = useState({
    code: '',
    name: '',
    subject: 'Physics',
    grade: 'Grade 12',
    instructor: '',
    timing: '06:30 AM – 08:30 AM',
    classroom: 'Lecture Hall 1',
    maxCapacity: 35,
  });

  const filteredBatches = batches.filter((b) => {
    return selectedSubject === 'All' || b.subject === selectedSubject;
  });

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!newBatch.name || !newBatch.code) return;

    const created = {
      ...newBatch,
      id: `batch-${Date.now()}`,
      days: ['Mon', 'Wed', 'Fri'],
      enrolledCount: 0,
      status: 'Active',
      academicYear: '2026-27',
      maxCapacity: Number(newBatch.maxCapacity) || 35,
    };

    onAddBatch(created);
    setIsCreateModalOpen(false);
    setNewBatch({
      code: '',
      name: '',
      subject: 'Physics',
      grade: 'Grade 12',
      instructor: '',
      timing: '06:30 AM – 08:30 AM',
      classroom: 'Lecture Hall 1',
      maxCapacity: 35,
    });
  };

  const columns = [
    {
      header: 'Batch Code',
      key: 'code',
      width: '110px',
      render: (item) => (
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
          {item.code}
        </span>
      ),
    },
    {
      header: 'Course & Subject',
      key: 'name',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{item.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {item.grade} • {item.subject}
          </div>
        </div>
      ),
    },
    {
      header: 'Faculty Instructor',
      key: 'instructor',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <User size={13} color="var(--navy-700)" />
          <span style={{ fontSize: '12px', fontWeight: 500 }}>{item.instructor}</span>
        </div>
      ),
    },
    {
      header: 'Days & Timings',
      key: 'timing',
      render: (item) => (
        <div>
          <div style={{ fontSize: '12px', fontWeight: 500 }}>{item.timing}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {item.days ? item.days.join(', ') : 'Weekly'}
          </div>
        </div>
      ),
    },
    {
      header: 'Hall / Lab',
      key: 'classroom',
      render: (item) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
          <MapPin size={12} color="var(--gold-dark)" />
          <span>{item.classroom}</span>
        </div>
      ),
    },
    {
      header: 'Occupancy / Capacity',
      key: 'enrolledCount',
      width: '150px',
      render: (item) => {
        const ratio = Math.round((item.enrolledCount / item.maxCapacity) * 100);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
              <strong>{item.enrolledCount} / {item.maxCapacity}</strong>
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
                  width: `${ratio}%`,
                  height: '100%',
                  backgroundColor: ratio >= 90 ? 'var(--gold-primary)' : 'var(--navy-700)',
                }}
              />
            </div>
          </div>
        );
      },
    },
    {
      header: 'Status',
      key: 'status',
      render: (item) => <Badge status={item.status} />,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Courses &amp; Academic Batches</h1>
          <p className="page-description">
            Lecture Timings, Classroom Allocation &amp; Capacity Utilization (400–500 student distribution)
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => setIsCreateModalOpen(true)}
          >
            Create Batch
          </Button>
        </div>
      </div>

      {/* Filter toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div style={{ width: '200px' }}>
          <Select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            options={['All', 'Physics', 'Chemistry', 'Mathematics', 'Biology', 'Integrated STEM']}
            className="mb-0"
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing <strong>{filteredBatches.length}</strong> active batches
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredBatches}
        searchPlaceholder="Search batches by code, course, or teacher..."
      />

      {/* Create Batch Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Schedule New Academic Batch"
        subtitle="Allocate Faculty, Hall and Class Timing"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateSubmit}>
              Create Batch
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px' }}>
            <Input
              label="Batch Code"
              value={newBatch.code}
              onChange={(e) => setNewBatch({ ...newBatch, code: e.target.value.toUpperCase() })}
              placeholder="JEE-12C"
              required
            />
            <Input
              label="Course & Batch Name"
              value={newBatch.name}
              onChange={(e) => setNewBatch({ ...newBatch, name: e.target.value })}
              placeholder="Grade 12 Advanced Physical Chemistry"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Select
              label="Department / Subject"
              value={newBatch.subject}
              onChange={(e) => setNewBatch({ ...newBatch, subject: e.target.value })}
              options={['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Integrated STEM']}
              required
            />
            <Select
              label="Target Grade"
              value={newBatch.grade}
              onChange={(e) => setNewBatch({ ...newBatch, grade: e.target.value })}
              options={['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']}
              required
            />
          </div>

          <Input
            label="Senior Faculty in Charge"
            value={newBatch.instructor}
            onChange={(e) => setNewBatch({ ...newBatch, instructor: e.target.value })}
            placeholder="e.g. Dr. K. S. Pillai"
            required
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Input
              label="Classroom / Hall"
              value={newBatch.classroom}
              onChange={(e) => setNewBatch({ ...newBatch, classroom: e.target.value })}
              placeholder="LH-2 / Lab A"
              required
            />
            <Input
              label="Max Seating Capacity"
              type="number"
              value={newBatch.maxCapacity}
              onChange={(e) => setNewBatch({ ...newBatch, maxCapacity: e.target.value })}
              placeholder="35"
              required
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
