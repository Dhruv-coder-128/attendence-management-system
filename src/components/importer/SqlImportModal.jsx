import React, { useState } from 'react';
import { Database, Upload, FileCode, CheckCircle2, AlertCircle, RefreshCw, X, Play } from 'lucide-react';
import Button from '../common/Button';
import { executeSqlImport } from '../../lib/importer/sqlImporter';

export default function SqlImportModal({ isOpen, onClose, onSuccess }) {
  const [sqlText, setSqlText] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError('');
    setResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setSqlText(event.target?.result || '');
    };
    reader.onerror = () => {
      setError('Failed to read SQL file.');
    };
    reader.readAsText(file);
  };

  const handleExecute = async () => {
    if (!sqlText.trim()) {
      setError('Please provide SQL statements to execute.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setProgress(null);

    try {
      const res = await executeSqlImport(sqlText, (prog) => {
        setProgress(prog);
      });

      setLoading(false);
      setResult(res);

      if (res.ok && res.totalInserted > 0 && onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Error executing SQL script.');
    }
  };

  const sampleSqlSnippet = `-- Sample SQL Format for SMS Tables
INSERT INTO batches (name, code, shift, timing, classroom, max_capacity, is_active)
VALUES ('Grade 11 Science A', '11SCI-A', 'Morning', '08:00 - 14:00', 'Room 101', 50, true);

INSERT INTO students (full_name, admission_no, roll_no, email, phone, gender, blood_group, status)
VALUES ('Rahul Sharma', 'ADM-2026-001', '01', 'rahul@example.com', '9876543210', 'Male', 'O+', 'Active');`;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, backdropFilter: 'blur(4px)', backgroundColor: 'rgba(7, 14, 25, 0.75)' }}>
      <div className="modal-dialog" style={{ maxWidth: '640px', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.35)' }}>
        {/* Header */}
        <div style={{ backgroundColor: 'var(--navy-900)', padding: '20px 24px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--navy-700)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: 'var(--gold-subtle-bg)', border: '1px solid var(--gold-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Database size={20} color="var(--gold-light)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, fontFamily: 'var(--font-heading)', color: '#ffffff' }}>
                Import Database from SQL Script
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-on-navy-muted)' }}>
                Upload or paste .sql INSERT statements to populate your school tables
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: '24px', backgroundColor: '#ffffff', maxHeight: '75vh', overflowY: 'auto' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', backgroundColor: 'var(--status-absent-bg)', border: '1px solid var(--status-absent-border)', borderRadius: '6px', padding: '12px', marginBottom: '16px', color: 'var(--status-absent)', fontSize: '12.5px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          {result && (
            <div
              style={{
                backgroundColor: result.totalInserted > 0 ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                border: `1px solid ${result.totalInserted > 0 ? 'var(--status-present-border)' : 'var(--status-absent-border)'}`,
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: result.totalInserted > 0 ? 'var(--status-present)' : 'var(--status-absent)', marginBottom: '8px' }}>
                {result.totalInserted > 0 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span>
                  {result.totalInserted > 0
                    ? `Successfully imported ${result.totalInserted} records!`
                    : 'No records were inserted.'}
                </span>
              </div>

              {Object.keys(result.tableStats || {}).length > 0 && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                  {Object.entries(result.tableStats).map(([tbl, cnt]) => (
                    <span key={tbl} style={{ padding: '2px 8px', borderRadius: '4px', backgroundColor: '#ffffff', border: '1px solid var(--border-subtle)', fontSize: '11.5px', color: 'var(--navy-900)', fontWeight: 600 }}>
                      {tbl}: +{cnt} rows
                    </span>
                  ))}
                </div>
              )}

              {result.errors?.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--status-absent)' }}>
                  <strong>Issues Encountered ({result.errors.length}):</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {result.errors.slice(0, 3).map((errStr, idx) => (
                      <li key={idx}>{errStr}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Upload file or paste */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <label
              style={{
                flex: 1,
                border: '1px dashed var(--border-subtle)',
                borderRadius: '8px',
                padding: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                backgroundColor: 'var(--bg-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '12.5px',
                color: 'var(--navy-900)',
                fontWeight: 500,
              }}
            >
              <Upload size={16} />
              <span>{fileName ? `File: ${fileName}` : 'Upload .sql Script File'}</span>
              <input type="file" accept=".sql" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            {sqlText && (
              <button
                type="button"
                onClick={() => {
                  setSqlText('');
                  setFileName('');
                  setResult(null);
                }}
                className="btn btn-outline"
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Text Area */}
          <div className="form-group" style={{ marginBottom: '14px' }}>
            <label className="form-label" style={{ fontSize: '12.5px', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
              <span>SQL Script Statements (INSERT INTO ...)</span>
              <button
                type="button"
                onClick={() => setSqlText(sampleSqlSnippet)}
                style={{ background: 'none', border: 'none', color: 'var(--gold-dark)', cursor: 'pointer', fontSize: '11.5px', textDecoration: 'underline' }}
              >
                Insert Sample Template
              </button>
            </label>
            <textarea
              value={sqlText}
              onChange={(e) => setSqlText(e.target.value)}
              placeholder="Paste INSERT INTO students (...) VALUES (...); statements here..."
              rows={8}
              disabled={loading}
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                lineHeight: 1.4,
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                boxSizing: 'border-box',
                backgroundColor: '#f8fafc',
              }}
            />
          </div>

          {/* Progress Indicator */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--navy-900)', marginBottom: '16px' }}>
              <RefreshCw size={15} className="animate-spin" />
              <span>
                Processing SQL statements... {progress ? `(${progress.totalInserted} rows inserted)` : ''}
              </span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              Close
            </button>
            <Button
              variant="primary"
              onClick={handleExecute}
              disabled={loading || !sqlText.trim()}
              icon={Play}
            >
              {loading ? 'Executing Script...' : 'Execute & Import into Database'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
