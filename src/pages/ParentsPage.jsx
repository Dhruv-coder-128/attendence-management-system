import React, { useState } from 'react';
import { Send, Phone, Mail, MessageSquare, CheckCircle, Shield } from 'lucide-react';
import DataTable from '../components/common/DataTable';
import Badge from '../components/common/Badge';
import Button from '../components/common/Button';
import Select from '../components/common/Select';

/**
 * Parent Directory and Communications Module
 */
export default function ParentsPage({ parents, onSendNotice }) {
  const [channelFilter, setChannelFilter] = useState('All');

  const filteredParents = parents.filter((p) => {
    return channelFilter === 'All' || p.preferredChannel === channelFilter;
  });

  const columns = [
    {
      header: 'Parent / Guardian',
      key: 'name',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--navy-950)' }}>{item.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {item.relationship} • {item.occupation}
          </div>
        </div>
      ),
    },
    {
      header: 'Linked Student(s)',
      key: 'studentNames',
      render: (item) => (
        <div>
          {item.studentNames.map((st, i) => (
            <div key={i} style={{ fontSize: '12px', fontWeight: 500, color: 'var(--navy-900)' }}>
              {st}
            </div>
          ))}
        </div>
      ),
    },
    {
      header: 'Primary Contact',
      key: 'phone',
      render: (item) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
            <Phone size={12} color="var(--navy-700)" />
            <span>{item.phone}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <Mail size={11} />
            <span>{item.email}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Preferred Channel',
      key: 'preferredChannel',
      render: (item) => (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '3px 8px',
            borderRadius: '4px',
            backgroundColor:
              item.preferredChannel === 'Telegram'
                ? '#e0f2fe'
                : item.preferredChannel === 'WhatsApp'
                ? '#dcfce7'
                : '#f1f5f9',
            color:
              item.preferredChannel === 'Telegram'
                ? '#0369a1'
                : item.preferredChannel === 'WhatsApp'
                ? '#15803d'
                : '#475569',
          }}
        >
          {item.preferredChannel}
        </span>
      ),
    },
    {
      header: 'Delivery Status',
      key: 'notificationStatus',
      render: (item) => (
        <Badge
          status={item.notificationStatus === 'Active' ? 'Present' : 'Pending'}
        >
          {item.notificationStatus}
        </Badge>
      ),
    },
    {
      header: 'Direct Communication',
      key: 'actions',
      align: 'right',
      render: (item) => (
        <Button
          variant="outline"
          size="sm"
          icon={Send}
          onClick={() => onSendNotice && onSendNotice(item)}
        >
          Dispatch Alert
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Parent Communications Directory</h1>
          <p className="page-description">
            Registered Guardian Contacts &bull; Telegram Bot &amp; WhatsApp Integration Directory
          </p>
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
        <div style={{ width: '220px' }}>
          <Select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            options={['All', 'Telegram', 'WhatsApp', 'SMS']}
            className="mb-0"
          />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          Showing <strong>{filteredParents.length}</strong> registered guardians
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredParents}
        searchPlaceholder="Search guardians by name, ward, or phone..."
      />
    </div>
  );
}
