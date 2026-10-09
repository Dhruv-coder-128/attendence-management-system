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
  AlertCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Info,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import BulkImportModal from '../components/importer/BulkImportModal';
import { RECOMMENDED_IMPORT_SEQUENCE } from '../lib/importer/entitySchemas';
import { downloadSampleTemplate } from '../lib/importer/templateGenerator';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Central Enterprise Bulk Data Import Center
 */
export default function BulkImportPage({ onNavigate, onRefreshCounts }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState('students');
  const [toastMessage, setToastMessage] = useState('');

  // Database Counts
  const [counts, setCounts] = useState({
    courses: 0,
    batches: 0,
    students: 0,
    parents: 0,
  });
  const [loadingCounts, setLoadingCounts] = useState(true);

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
        supabase.from('courses').select('id', { count: 'exact' }),
        supabase.from('batches').select('id', { count: 'exact' }),
        supabase.from('students').select('id', { count: 'exact' }),
        supabase.from('parents').select('id', { count: 'exact' }),
      ]);

      setCounts({
        courses: coursesCount ?? (coursesData?.length || 0),
        batches: batchesCount ?? (batchesData?.length || 0),
        students: studentsCount ?? (studentsData?.length || 0),
        parents: parentsCount ?? (parentsData?.length || 0),
      });
    } catch (err) {
      console.error('Failed to query counts:', err);
    } finally {
      setLoadingCounts(false);
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
      `Successfully imported ${summary.successCount} records into Supabase!`
    );
    setTimeout(() => setToastMessage(''), 5000);
  };

  const entityIcons = {
    courses: BookOpen,
    batches: Layers,
    students: Users,
    parents: UserCheck,
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Enterprise Bulk Data Import Center</h1>
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
              Excel &bull; CSV
            </span>
          </div>
          <p className="page-description">
            Safely onboard institutional datasets into Supabase PostgreSQL with automated column mapping, foreign key resolution &amp; duplicate safeguards
          </p>
        </div>

        <div className="page-actions">
          <Button
            variant="outline"
            size="sm"
            icon={RefreshCw}
            onClick={fetchDatabaseCounts}
            disabled={loadingCounts}
          >
            {loadingCounts ? 'Refreshing...' : 'Refresh Database Counts'}
          </Button>
          <Button
            variant="gold"
            size="md"
            icon={Upload}
            onClick={() => openImportWizard('students')}
          >
            Launch Import Wizard
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '20px',
            padding: '12px 16px',
            backgroundColor: 'var(--status-present-bg)',
            border: '1px solid var(--status-present-border)',
            borderRadius: '6px',
            color: 'var(--status-present)',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Sparkles size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Recommended Sequence Guide Banner */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '8px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Info size={20} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: '14px', color: '#1e40af', display: 'block', marginBottom: '4px' }}>
              Recommended Sequence for First-Time Setup
            </strong>
            <p style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.5, margin: 0 }}>
              Because relational foreign keys are strictly enforced in Supabase, import entities in order:{' '}
              <strong>1. Courses</strong> &rarr; <strong>2. Batches</strong> (needs Course Code) &rarr;{' '}
              <strong>3. Students</strong> (needs Batch Code) &rarr;{' '}
              <strong>4. Parents &amp; Guardians</strong> (needs Student Admission No).
            </p>
          </div>
        </div>
      </div>

      {/* 4 Interactive Entity Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        {RECOMMENDED_IMPORT_SEQUENCE.map((item) => {
          const Icon = entityIcons[item.id] || FileSpreadsheet;
          const currentCount = counts[item.id] ?? 0;

          return (
            <div
              key={item.id}
              className="erp-card"
              style={{
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'all 0.2s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--navy-900)',
                      color: 'var(--gold-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon size={20} />
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      backgroundColor: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Step {item.order} of 4
                  </span>
                </div>

                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '4px' }}>
                  {item.title}
                </h3>
                <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  public.{item.table} &bull; {currentCount} records in database
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '16px' }}>
                  {item.description}
                </p>
              </div>

              <div>
                {/* Template Downloads */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Download}
                    onClick={() => downloadSampleTemplate(item.id, 'xlsx')}
                    style={{ flex: 1, fontSize: '11px', padding: '5px 8px' }}
                  >
                    .XLSX Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Download}
                    onClick={() => downloadSampleTemplate(item.id, 'csv')}
                    style={{ flex: 1, fontSize: '11px', padding: '5px 8px' }}
                  >
                    .CSV Template
                  </Button>
                </div>

                {/* Launch Button */}
                <Button
                  variant="primary"
                  size="sm"
                  icon={Upload}
                  onClick={() => openImportWizard(item.id)}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Import {item.title.split(' ')[0]}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Import Features & Security Safeguards Summary */}
      <div
        className="erp-card"
        style={{
          padding: '24px',
          backgroundColor: '#ffffff',
        }}
      >
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '14px' }}>
          Built-in ERP Safeguards &amp; Validation Engine
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
          <div>
            <strong style={{ fontSize: '13px', color: 'var(--navy-950)', display: 'block', marginBottom: '4px' }}>
              ✓ Flexible Column Mapping
            </strong>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Automatic header detection matches common field variations (e.g. &quot;Full Name&quot;, &quot;student_name&quot;, &quot;Name&quot;).
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '13px', color: 'var(--navy-950)', display: 'block', marginBottom: '4px' }}>
              ✓ Duplicate Protection
            </strong>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Detects duplicates within the spreadsheet and against existing Supabase database records, safely skipping them to preserve historical data.
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '13px', color: 'var(--navy-950)', display: 'block', marginBottom: '4px' }}>
              ✓ Safe Batch Chunking
            </strong>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              Writes in 25-row atomic chunks with row-level rollback, ensuring high throughput without timeouts or cascade failures.
            </p>
          </div>

          <div>
            <strong style={{ fontSize: '13px', color: 'var(--navy-950)', display: 'block', marginBottom: '4px' }}>
              ✓ Failed Rows Export
            </strong>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              If any row contains formatting errors, instantly download a tailored CSV with exact error reasons to fix and re-import.
            </p>
          </div>
        </div>
      </div>

      {/* Modal Wizard */}
      <BulkImportModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialEntity={selectedEntity}
        onImportSuccess={handleImportSuccess}
      />
    </div>
  );
}
