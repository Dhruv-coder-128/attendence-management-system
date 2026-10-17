import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Upload,
  BookOpen,
  Layers,
  Users,
  UserCheck,
  Download,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Database,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import BulkImportModal from '../components/importer/BulkImportModal';
import MasterImportModal from '../components/importer/MasterImportModal';
import SqlImportModal from '../components/importer/SqlImportModal';
import { downloadSampleTemplate, downloadAllInOneTemplate } from '../lib/importer/templateGenerator';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { autoDistributeMisassignedStudents, repairBatchCourseLinkages } from '../lib/batchRepairService';

/**
 * Clean, Friendly & Production-Grade School Data Import Hub
 */
export default function BulkImportPage({ onNavigate, onRefreshCounts }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState('students');
  const [toastMessage, setToastMessage] = useState('');

  // Live Database Counts
  const [counts, setCounts] = useState({
    courses: 0,
    batches: 0,
    students: 0,
    parents: 0,
  });
  const [samples, setSamples] = useState({
    courses: [],
    batches: [],
    students: [],
    parents: [],
  });
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [isDistributingBatches, setIsDistributingBatches] = useState(false);

  const fetchDatabaseCounts = async () => {
    if (!supabase || !isSupabaseConfigured) return;
    setLoadingCounts(true);
    try {
      const [
        { count: coursesCount, data: coursesData },
        { count: batchesCount, data: batchesData },
        { count: studentsCount, data: studentsData },
        { count: parentsCount, data: parentsData },
      ] = await Promise.all([
        supabase.from('courses').select('id, name, code', { count: 'exact' }).limit(3),
        supabase.from('batches').select('id, name, code, timing', { count: 'exact' }).limit(3),
        supabase.from('students').select('id, full_name, admission_no', { count: 'exact' }).limit(3),
        supabase.from('parents').select('id, full_name, phone', { count: 'exact' }).limit(3),
      ]);

      setCounts({
        courses: coursesCount || (coursesData ? coursesData.length : 0),
        batches: batchesCount || (batchesData ? batchesData.length : 0),
        students: studentsCount || (studentsData ? studentsData.length : 0),
        parents: parentsCount || (parentsData ? parentsData.length : 0),
      });

      setSamples({
        courses: coursesData || [],
        batches: batchesData || [],
        students: studentsData || [],
        parents: parentsData || [],
      });
    } catch (err) {
      console.error('Failed to query counts and samples:', err);
    } finally {
      setLoadingCounts(false);
    }
  };

  const handleAutoDistributeBatches = async () => {
    setIsDistributingBatches(true);
    try {
      await repairBatchCourseLinkages();
      const res = await autoDistributeMisassignedStudents();
      setToastMessage(res.message || 'Cohorts and courses synchronized successfully!');
      await fetchDatabaseCounts();
      if (onRefreshCounts) onRefreshCounts();
    } catch (err) {
      alert('Failed to rebalance: ' + err.message);
    } finally {
      setIsDistributingBatches(false);
    }
  };

  useEffect(() => {
    fetchDatabaseCounts();
  }, []);

  const openImportWizard = (entityId) => {
    setSelectedEntity(entityId);
    setIsModalOpen(true);
  };

  const handleImportSuccess = (summary) => {
    fetchDatabaseCounts();
    if (onRefreshCounts) {
      onRefreshCounts();
    }
    setToastMessage(
      `Successfully imported ${summary.successCount} records into your school database!`
    );
    setTimeout(() => setToastMessage(''), 5000);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-title">School Data Import Hub</h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: 'var(--gold-subtle-bg)',
                color: 'var(--gold-dark)',
                border: '1px solid var(--gold-border)',
              }}
            >
              Excel &bull; CSV &bull; 1-Click
            </span>
          </div>
          <p className="page-description">
            Quickly onboard or update your classes, batches, students, and parent records with automatic formatting and zero data loss.
          </p>
        </div>

        <div className="page-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="gold"
            size="md"
            icon={Sparkles}
            onClick={handleAutoDistributeBatches}
            disabled={isDistributingBatches || loadingCounts}
          >
            {isDistributingBatches ? 'Synchronizing...' : '⚡ Rebalance Batches & Courses (1-Click)'}
          </Button>

          <Button
            variant="outline"
            size="md"
            icon={RefreshCw}
            onClick={fetchDatabaseCounts}
            disabled={loadingCounts}
          >
            {loadingCounts ? 'Refreshing...' : 'Refresh Counts'}
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '14px 18px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '10px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 2px 8px rgba(4, 120, 87, 0.08)',
          }}
        >
          <Sparkles size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Primary Hero Section: 🌟 1-Click Master School Import */}
      <div
        className="erp-card"
        style={{
          background: 'linear-gradient(135deg, #0a1424 0%, #14243e 50%, #1e3356 100%)',
          borderRadius: '16px',
          padding: '28px 32px',
          color: '#ffffff',
          marginBottom: '32px',
          border: '1px solid rgba(197, 168, 128, 0.35)',
          boxShadow: '0 12px 32px -8px rgba(10, 20, 36, 0.25)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '24px' }}>
          <div style={{ maxWidth: '640px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                backgroundColor: 'rgba(197, 168, 128, 0.2)',
                border: '1px solid rgba(197, 168, 128, 0.45)',
                color: '#e5d1b3',
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                marginBottom: '12px',
              }}
            >
              <Sparkles size={14} />
              <span>Recommended for New Academic Sessions</span>
            </div>

            <h2 style={{ fontSize: '24px', fontWeight: 800, margin: '0 0 10px 0', letterSpacing: '-0.3px', color: '#ffffff' }}>
              All-in-One Master School Import
            </h2>
            <p style={{ fontSize: '13.5px', color: '#cbd5e1', lineHeight: 1.6, margin: '0 0 18px 0' }}>
              Upload a single spreadsheet with your whole student list. The system automatically creates your <strong>Classes</strong>, <strong>Batches</strong>, assigns <strong>Roll Numbers</strong>, and creates <strong>Parent Dossiers</strong> all at once.
            </p>

            {/* Smart Feature Badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontSize: '12px', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                ✓ Auto-generates Classes &amp; Batches
              </span>
              <span style={{ fontSize: '12px', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                ✓ Student Roll Nos &amp; Admissions
              </span>
              <span style={{ fontSize: '12px', color: '#f1f5f9', backgroundColor: 'rgba(255,255,255,0.08)', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)' }}>
                ✓ Guardian Contacts &amp; Telegram Alerts
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '220px' }}>
            <Button
              variant="gold"
              size="lg"
              icon={Sparkles}
              onClick={() => setIsMasterModalOpen(true)}
              style={{
                fontWeight: 700,
                fontSize: '14px',
                padding: '13px 24px',
                boxShadow: '0 4px 16px rgba(197, 168, 128, 0.35)',
                justifyContent: 'center',
              }}
            >
              Launch Master Importer
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={Download}
              onClick={() => downloadAllInOneTemplate('xlsx')}
              style={{
                color: '#ffffff',
                borderColor: 'rgba(255,255,255,0.3)',
                backgroundColor: 'rgba(255,255,255,0.07)',
                fontSize: '13px',
                fontWeight: 600,
                justifyContent: 'center',
              }}
            >
              Download Master Template (.xlsx)
            </Button>
          </div>
        </div>
      </div>

      {/* Secondary Section Header */}
      <div style={{ marginBottom: '18px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 4px 0' }}>
          Import by Category
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          If you prefer to maintain and upload separate files for individual sections, select a category below:
        </p>
      </div>

      {/* 4 Clean, Friendly Category Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: '20px',
          marginBottom: '32px',
        }}
      >
        {/* 1. Classes & Courses */}
        <div
          className="erp-card"
          style={{
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <BookOpen size={20} />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: counts.courses > 0 ? 'var(--status-present-bg)' : 'var(--bg-subtle)',
                  color: counts.courses > 0 ? 'var(--status-present)' : 'var(--text-muted)',
                  border: `1px solid ${counts.courses > 0 ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                }}
              >
                {counts.courses} {counts.courses === 1 ? 'Class' : 'Classes'}
              </span>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
              Classes &amp; Streams
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Define standards, school grades, or degree programs (e.g., 11th Commerce, 12th Science).
            </p>
          </div>

          {/* Schema & Imported Data Info */}
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Expected Headers:</span>
              <span style={{ color: counts.courses > 0 ? 'var(--status-present)' : 'var(--text-muted)', fontWeight: 700 }}>
                {counts.courses > 0 ? `✓ ${counts.courses} loaded` : '0 loaded'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {['name', 'code', 'duration_months', 'base_fee'].map((h) => (
                <span key={h} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>
                  {h}
                </span>
              ))}
            </div>
            {samples.courses.length > 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Active: {samples.courses.map((c) => c.name || c.code).join(', ')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => openImportWizard('courses')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => downloadSampleTemplate('courses', 'xlsx')}
              title="Download Template"
            >
              Template
            </Button>
          </div>
        </div>

        {/* 2. Batches & Cohorts */}
        <div
          className="erp-card"
          style={{
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Layers size={20} />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: counts.batches > 0 ? 'var(--status-present-bg)' : 'var(--bg-subtle)',
                  color: counts.batches > 0 ? 'var(--status-present)' : 'var(--text-muted)',
                  border: `1px solid ${counts.batches > 0 ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                }}
              >
                {counts.batches} {counts.batches === 1 ? 'Batch' : 'Batches'}
              </span>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
              Batches &amp; Cohorts
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Configure classroom divisions, shifts, room allocations, and daily class schedules.
            </p>
          </div>

          {/* Schema & Imported Data Info */}
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Expected Headers:</span>
              <span style={{ color: counts.batches > 0 ? 'var(--status-present)' : 'var(--text-muted)', fontWeight: 700 }}>
                {counts.batches > 0 ? `✓ ${counts.batches} loaded` : '0 loaded'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {['name', 'code', 'timing', 'classroom', 'course_code'].map((h) => (
                <span key={h} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>
                  {h}
                </span>
              ))}
            </div>
            {samples.batches.length > 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Active: {samples.batches.map((b) => b.name || b.code).join(', ')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => openImportWizard('batches')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => downloadSampleTemplate('batches', 'xlsx')}
              title="Download Template"
            >
              Template
            </Button>
          </div>
        </div>

        {/* 3. Students Directory */}
        <div
          className="erp-card"
          style={{
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={20} />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: counts.students > 0 ? 'var(--status-present-bg)' : 'var(--bg-subtle)',
                  color: counts.students > 0 ? 'var(--status-present)' : 'var(--text-muted)',
                  border: `1px solid ${counts.students > 0 ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                }}
              >
                {counts.students} {counts.students === 1 ? 'Student' : 'Students'}
              </span>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
              Students Roster
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Add student admissions, assign roll numbers, and assign them into academic cohorts.
            </p>
          </div>

          {/* Schema & Imported Data Info */}
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Expected Headers:</span>
              <span style={{ color: counts.students > 0 ? 'var(--status-present)' : 'var(--text-muted)', fontWeight: 700 }}>
                {counts.students > 0 ? `✓ ${counts.students} enrolled` : '0 loaded'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {['admission_no', 'full_name', 'roll_no', 'batch_code', 'gender'].map((h) => (
                <span key={h} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>
                  {h}
                </span>
              ))}
            </div>
            {samples.students.length > 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Active: {samples.students.map((s) => `${s.full_name} (${s.admission_no})`).join(', ')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => openImportWizard('students')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => downloadSampleTemplate('students', 'xlsx')}
              title="Download Template"
            >
              Template
            </Button>
          </div>
        </div>

        {/* 4. Parents & Guardians */}
        <div
          className="erp-card"
          style={{
            padding: '22px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--navy-900)',
                  color: 'var(--gold-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserCheck size={20} />
              </div>
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  backgroundColor: counts.parents > 0 ? 'var(--status-present-bg)' : 'var(--bg-subtle)',
                  color: counts.parents > 0 ? 'var(--status-present)' : 'var(--text-muted)',
                  border: `1px solid ${counts.parents > 0 ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                }}
              >
                {counts.parents} {counts.parents === 1 ? 'Parent' : 'Parents'}
              </span>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', margin: '0 0 6px 0' }}>
              Parents &amp; Guardians
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 18px 0' }}>
              Import guardian phone numbers and generate links for daily Telegram attendance alerts.
            </p>
          </div>

          {/* Schema & Imported Data Info */}
          <div
            style={{
              marginBottom: '14px',
              padding: '10px 12px',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '6px',
              border: '1px solid var(--border-subtle)',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 600, color: 'var(--navy-950)', marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Expected Headers:</span>
              <span style={{ color: counts.parents > 0 ? 'var(--status-present)' : 'var(--text-muted)', fontWeight: 700 }}>
                {counts.parents > 0 ? `✓ ${counts.parents} linked` : '0 loaded'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {['full_name', 'phone', 'relationship', 'admission_no', 'telegram_chat_id'].map((h) => (
                <span key={h} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: '#e2e8f0', color: '#334155', fontSize: '10px', fontFamily: 'monospace' }}>
                  {h}
                </span>
              ))}
            </div>
            {samples.parents.length > 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Active: {samples.parents.map((p) => p.full_name).join(', ')}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              onClick={() => openImportWizard('parents')}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Upload
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={() => downloadSampleTemplate('parents', 'xlsx')}
              title="Download Template"
            >
              Template
            </Button>
          </div>
        </div>
      </div>

      {/* Production Safeguards & Features Bar */}
      <div
        className="erp-card"
        style={{
          padding: '20px 24px',
          backgroundColor: '#ffffff',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--status-present)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Smart Header Detection
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--status-present)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Duplicate Record Safeguards
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={18} color="var(--status-present)" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Safe Batch Chunking
              </span>
            </div>
          </div>

          {/* Discreet SQL Dump Link for Advanced Administrators */}
          <div>
            <button
              type="button"
              onClick={() => setIsSqlModalOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px',
              }}
            >
              Advanced: Import from SQL Script Dump
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <BulkImportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialEntity={selectedEntity}
        onImportSuccess={handleImportSuccess}
      />

      <MasterImportModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        onSuccess={(summary) => {
          fetchDatabaseCounts();
          if (onRefreshCounts) onRefreshCounts();
          setToastMessage(
            summary.isBackupRestore
              ? 'Personal database backup restored successfully!'
              : `All-in-One Import Success: Created ${summary.studentsCreated} students, ${summary.batchesCreated} cohorts!`
          );
          setTimeout(() => setToastMessage(''), 5000);
        }}
      />

      <SqlImportModal
        isOpen={isSqlModalOpen}
        onClose={() => setIsSqlModalOpen(false)}
        onSuccess={() => {
          fetchDatabaseCounts();
          if (onRefreshCounts) onRefreshCounts();
          setToastMessage('SQL Script executed and imported successfully!');
          setTimeout(() => setToastMessage(''), 5000);
        }}
      />
    </div>
  );
}
