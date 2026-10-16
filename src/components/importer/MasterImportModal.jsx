import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  Play,
  Layers,
  Users,
  UserCheck,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { parseMasterSpreadsheet, commitMasterSpreadsheetData } from '../../lib/importer/masterExcelImporter';
import { downloadAllInOneTemplate } from '../../lib/importer/templateGenerator';

export default function MasterImportModal({ isOpen, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [parseErrors, setParseErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setError('');
    setResult(null);
    setProgress(null);
    setParsing(true);

    try {
      const res = await parseMasterSpreadsheet(selectedFile);
      setParsedData(res.parsedRows);
      setParseErrors(res.errors);
      setParsing(false);
    } catch (err) {
      setParsing(false);
      setParsedData(null);
      setError(err.message || 'Failed to parse master spreadsheet.');
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadAllInOneTemplate('xlsx');
    } catch (err) {
      console.error('Failed to download template:', err);
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedData || parsedData.length === 0) {
      setError('Please select and parse a valid spreadsheet first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await commitMasterSpreadsheetData(parsedData, {
        onProgress: (p) => setProgress(p),
      });

      setLoading(false);
      setResult(res);

      if (res.success && onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Error committing data to database.');
    }
  };

  // Distinct counts for preview
  const previewCourses = parsedData ? new Set(parsedData.map((r) => r.courseName)).size : 0;
  const previewBatches = parsedData ? new Set(parsedData.map((r) => r.batchName)).size : 0;
  const previewFees = parsedData ? parsedData.filter((r) => r.annualFee > 0).length : 0;

  return (
    <div
      className="modal-overlay"
      style={{
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
        backgroundColor: 'rgba(7, 14, 25, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        className="modal-dialog"
        style={{
          width: '100%',
          maxWidth: '720px',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          backgroundColor: '#ffffff',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: 'var(--navy-900)',
            padding: '18px 24px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--navy-700)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '8px',
                backgroundColor: 'rgba(21, 128, 61, 0.2)',
                border: '1px solid #16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={22} color="#22c55e" />
            </div>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '17px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-heading)',
                  color: '#ffffff',
                }}
              >
                All-in-One Master School Importer
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>
                Upload 1 spreadsheet &bull; Auto-builds Courses, Batches, Students, Parents &amp; Fees
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* Banner / Instructions */}
          <div
            style={{
              backgroundColor: 'var(--gold-subtle-bg)',
              border: '1px solid var(--gold-border)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Sparkles size={18} color="var(--gold-dark)" />
              <div style={{ fontSize: '12px', color: 'var(--navy-950)' }}>
                <strong>Zero manual configuration:</strong> Put all your batches, students, and parent phone numbers into one Excel sheet.
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              icon={Download}
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              style={{ flexShrink: 0, backgroundColor: '#ffffff' }}
            >
              {downloadingTemplate ? 'Generating...' : 'Download Template (.xlsx)'}
            </Button>
          </div>

          {/* File Upload Zone */}
          <div
            style={{
              border: '2px dashed var(--border-navy)',
              borderRadius: '8px',
              padding: '24px 16px',
              textAlign: 'center',
              backgroundColor: 'var(--bg-subtle)',
              marginBottom: '16px',
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
              }}
            />
            <Upload size={32} color="var(--navy-700)" style={{ margin: '0 auto 8px auto' }} />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
              {fileName ? fileName : 'Click or drag & drop your Master Excel / CSV file here'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Supports Microsoft Excel (.xlsx, .xls) and Comma-Separated Values (.csv)
            </div>
          </div>

          {/* Parsing Feedback */}
          {parsing && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--navy-800)', fontSize: '13px' }}>
              <RefreshCw className="animate-spin" size={20} style={{ margin: '0 auto 8px auto' }} />
              <span>Analyzing spreadsheet columns and rows...</span>
            </div>
          )}

          {/* Parsed Summary Cards */}
          {parsedData && !result && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#166534' }}>{parsedData.length}</div>
                  <div style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>Students</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e40af' }}>{previewBatches}</div>
                  <div style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 600 }}>Batches</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: '#fefce8', border: '1px solid #fef08a', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#854d0e' }}>{previewCourses}</div>
                  <div style={{ fontSize: '11px', color: '#a16207', fontWeight: 600 }}>Courses</div>
                </div>
                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', textAlign: 'center' }}>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#6b21a8' }}>{previewFees}</div>
                  <div style={{ fontSize: '11px', color: '#7e22ce', fontWeight: 600 }}>Fee Ledgers</div>
                </div>
              </div>

              {/* Sample Preview Table */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--navy-900)', marginBottom: '6px' }}>
                  Preview (First 3 Records):
                </div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', overflowX: 'auto', fontSize: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <tr>
                        <th style={{ padding: '6px 10px' }}>Roll</th>
                        <th style={{ padding: '6px 10px' }}>Student Name</th>
                        <th style={{ padding: '6px 10px' }}>Batch</th>
                        <th style={{ padding: '6px 10px' }}>Parent / Guardian</th>
                        <th style={{ padding: '6px 10px' }}>Phone</th>
                        <th style={{ padding: '6px 10px' }}>Fee (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedData.slice(0, 3).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.rollNo}</td>
                          <td style={{ padding: '6px 10px' }}>{r.studentName}</td>
                          <td style={{ padding: '6px 10px' }}>{r.batchName}</td>
                          <td style={{ padding: '6px 10px' }}>{r.guardianName}</td>
                          <td style={{ padding: '6px 10px' }}>{r.guardianPhone || '—'}</td>
                          <td style={{ padding: '6px 10px' }}>{r.annualFee > 0 ? `₹${r.annualFee}` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Progress Indicator */}
          {loading && progress && (
            <div style={{ marginBottom: '16px', padding: '14px', backgroundColor: 'var(--bg-subtle)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', fontWeight: 600, color: 'var(--navy-900)' }}>
                <span>{progress.message}</span>
                <span>{progress.percent}%</span>
              </div>
              <div style={{ height: '6px', backgroundColor: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${progress.percent}%`,
                    backgroundColor: 'var(--gold-primary)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                color: 'var(--status-absent)',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {result && (
            <div
              style={{
                padding: '18px',
                borderRadius: '8px',
                backgroundColor: 'var(--status-present-bg)',
                border: '1px solid var(--status-present-border)',
                color: 'var(--status-present)',
                marginBottom: '16px',
                textAlign: 'center',
              }}
            >
              <CheckCircle2 size={36} color="var(--status-present)" style={{ margin: '0 auto 10px auto' }} />
              <h4 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700 }}>
                School Database Created Successfully!
              </h4>
              <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5 }}>
                Enrolled <strong>{result.studentsCreated} students</strong> across <strong>{result.batchesCreated} cohorts</strong>, linked <strong>{result.parentsCreated} guardians</strong>, and created <strong>{result.feesCreated} fee records</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 24px',
            backgroundColor: 'var(--bg-subtle)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {result ? 'Done & Close' : 'Cancel'}
          </Button>

          {!result && (
            <Button
              variant="primary"
              size="sm"
              icon={Play}
              onClick={handleExecuteImport}
              disabled={loading || !parsedData || parsedData.length === 0}
            >
              {loading ? 'Building Database...' : `Import & Build Database (${parsedData?.length || 0} Students)`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
