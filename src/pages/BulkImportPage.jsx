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
  Database,
} from 'lucide-react';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import BulkImportModal from '../components/importer/BulkImportModal';
import MasterImportModal from '../components/importer/MasterImportModal';
import SqlImportModal from '../components/importer/SqlImportModal';
import { RECOMMENDED_IMPORT_SEQUENCE } from '../lib/importer/entitySchemas';
import { downloadSampleTemplate, downloadAllInOneTemplate } from '../lib/importer/templateGenerator';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Central Enterprise Bulk Data Import Center
 */
export default function BulkImportPage({ onNavigate, onRefreshCounts }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
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
            Safely onboard institutional datasets into your personal database (Excel, CSV, JSON, or SQL) with automated column mapping &amp; duplicate safeguards
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
            variant="primary"
            size="md"
            icon={FileSpreadsheet}
            onClick={() => setIsMasterModalOpen(true)}
          >
            All-in-One Master Importer
          </Button>
          <Button
            variant="outline"
            size="md"
            icon={Database}
            onClick={() => setIsSqlModalOpen(true)}
          >
            Import SQL Dump
          </Button>
          <Button
            variant="gold"
            size="md"
            icon={Upload}
            onClick={() => openImportWizard('students')}
          >
            Import by Table
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

      {/* All-in-One Master Importer Hero Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #1e293b 100%)',
          borderRadius: '14px',
          padding: '28px',
          color: '#ffffff',
          marginBottom: '28px',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          boxShadow: '0 10px 30px -5px rgba(15, 23, 42, 0.4)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div style={{ maxWidth: '680px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', backgroundColor: 'rgba(234, 179, 8, 0.15)', border: '1px solid rgba(234, 179, 8, 0.4)', color: '#fbbf24', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
              <Sparkles size={14} />
              <span>Recommended &bull; Automatic Onboarding</span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.3px', color: '#ffffff' }}>
              All-in-One Master Importer (Excel, CSV, JSON, .smsdb)
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, margin: 0 }}>
              Upload a single master institutional spreadsheet or personal database backup. The system automatically creates your <strong>Courses</strong>, <strong>Batches</strong>, <strong>Students</strong>, <strong>Parent Dossiers (with Telegram tokens)</strong>, and <strong>Tuition Fee Ledgers</strong> without any foreign key errors.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button
              variant="gold"
              size="lg"
              icon={Sparkles}
              onClick={() => setIsMasterModalOpen(true)}
              style={{ fontWeight: 700, padding: '12px 22px', boxShadow: '0 4px 14px rgba(234, 179, 8, 0.3)' }}
            >
              Launch Master Importer
            </Button>
            <Button
              variant="outline"
              size="lg"
              icon={Download}
              onClick={() => downloadAllInOneTemplate('xlsx')}
              style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.05)' }}
            >
              Master Template (.xlsx)
            </Button>
          </div>
        </div>
      </div>

      {/* Recommended Sequence Guide Banner */}
      <div
        style={{
          padding: '16px 20px',
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: '10px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <Info size={20} color="#1d4ed8" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: '14px', color: '#1e40af', display: 'block', marginBottom: '4px' }}>
              Per-Table Setup Guide (Import by Table)
            </strong>
            <p style={{ fontSize: '12px', color: '#1e3a8a', lineHeight: 1.5, margin: 0 }}>
              If you prefer uploading separate spreadsheets per entity, follow the sequence below. All missing codes and levels are auto-generated with smart defaults.
            </p>
          </div>
        </div>
      </div>

      {/* 4 Interactive Entity Cards - Spacious, High-Density Redesign */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '24px',
          marginBottom: '32px',
        }}
      >
        {RECOMMENDED_IMPORT_SEQUENCE.map((item) => {
          const Icon = entityIcons[item.id] || FileSpreadsheet;
          const currentCount = counts[item.id] ?? 0;
          const isPopulated = currentCount > 0;

          const cardDetails = {
            courses: {
              subtitle: 'Academic Streams & Degrees',
              dependency: 'Foundation Table &bull; No Prerequisites',
              fields: ['Course Code (auto)', 'Course Name', 'Academic Level', 'Curriculum Notes', 'Status'],
              navTarget: 'students',
              navLabel: 'Open Students Directory',
            },
            batches: {
              subtitle: 'Divisions, Timings & Capacity',
              dependency: 'Linked to Courses &bull; Feeds into Students',
              fields: ['Batch Code (auto)', 'Batch Name', 'Course Link', 'Shift', 'Timing', 'Classroom'],
              navTarget: 'batches',
              navLabel: 'Open Batches Directory',
            },
            students: {
              subtitle: 'Student Directory & Records',
              dependency: 'Linked to Batches &bull; Feeds into Parents & Fees',
              fields: ['Admission No (auto)', 'Student Full Name', 'Roll No (auto)', 'Batch Link', 'Phone', 'Gender', 'Fee Ledger'],
              navTarget: 'students',
              navLabel: 'Open Students Directory',
            },
            parents: {
              subtitle: 'Guardian Contacts & Alert Tokens',
              dependency: 'Linked to Students &bull; Generates Telegram Tokens',
              fields: ['Guardian Full Name', 'Mobile Number', 'Student Link', 'Relationship', 'Linking Token'],
              navTarget: 'parents',
              navLabel: 'Open Parents Directory',
            },
          }[item.id] || {
            subtitle: 'Institutional Entity',
            dependency: 'Database Table',
            fields: ['Record ID', 'Created At'],
            navTarget: 'dashboard',
            navLabel: 'Open Directory',
          };

          return (
            <div
              key={item.id}
              className="erp-card"
              style={{
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                transition: 'all 0.25s ease',
              }}
            >
              <div>
                {/* Header Row: Icon, Title & Live Status Pill */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '10px',
                        backgroundColor: 'var(--navy-900)',
                        color: 'var(--gold-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.15)',
                      }}
                    >
                      <Icon size={22} />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gold-dark)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Step {item.order} of 4
                      </span>
                      <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--navy-950)', margin: '2px 0 0 0' }}>
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      backgroundColor: isPopulated ? 'var(--status-present-bg)' : 'var(--bg-subtle)',
                      border: `1px solid ${isPopulated ? 'var(--status-present-border)' : 'var(--border-subtle)'}`,
                      color: isPopulated ? 'var(--status-present)' : 'var(--text-secondary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isPopulated ? '#16a34a' : '#94a3b8' }} />
                    {currentCount} {currentCount === 1 ? 'Record' : 'Records'}
                  </span>
                </div>

                {/* Subtitle & Table Tag */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {cardDetails.subtitle}
                  </span>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', backgroundColor: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                    public.{item.table}
                  </span>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  {item.description}
                </p>

                {/* Expected Schema Fields Preview Pills */}
                <div style={{ backgroundColor: 'var(--bg-subtle)', padding: '12px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-light)', marginBottom: '8px', letterSpacing: '0.4px' }}>
                    Columns &bull; Data Schema
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {cardDetails.fields.map((f, fIdx) => (
                      <span
                        key={fIdx}
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          backgroundColor: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    dangerouslySetInnerHTML={{ __html: `&#x1F517; ${cardDetails.dependency}` }}
                  />
                </div>
              </div>

              {/* Card Action Center */}
              <div>
                {/* Template Downloads */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Download}
                    onClick={() => downloadSampleTemplate(item.id, 'xlsx')}
                    style={{ flex: 1, fontSize: '12px', fontWeight: 600, justifyContent: 'center', padding: '7px 10px' }}
                  >
                    .XLSX Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Download}
                    onClick={() => downloadSampleTemplate(item.id, 'csv')}
                    style={{ flex: 1, fontSize: '12px', fontWeight: 600, justifyContent: 'center', padding: '7px 10px' }}
                  >
                    .CSV Template
                  </Button>
                </div>

                {/* Primary Import Button */}
                <Button
                  variant="primary"
                  size="md"
                  icon={Upload}
                  onClick={() => openImportWizard(item.id)}
                  style={{ width: '100%', justifyContent: 'center', fontWeight: 600 }}
                >
                  Import {item.title}
                </Button>

                {onNavigate && (
                  <button
                    type="button"
                    onClick={() => onNavigate(cardDetails.navTarget)}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      padding: '4px',
                      background: 'none',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--navy-900)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                    }}
                  >
                    <span>{cardDetails.navLabel}</span>
                    <ArrowRight size={12} />
                  </button>
                )}
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

      <MasterImportModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
        onSuccess={(summary) => {
          fetchDatabaseCounts();
          if (onRefreshCounts) onRefreshCounts();
          setToastMessage(summary.isBackupRestore ? 'Personal database backup restored successfully!' : `All-in-One Import Success: Created ${summary.studentsCreated} students, ${summary.batchesCreated} cohorts!`);
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
