import React, { useState, useEffect, useMemo } from 'react';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  X,
  Layers,
  FileText,
  Sparkles,
} from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { ENTITY_SCHEMAS, RECOMMENDED_IMPORT_SEQUENCE } from '../../lib/importer/entitySchemas';
import { parseImportFile, autoMapColumns } from '../../lib/importer/fileParser';
import { validateImportRows } from '../../lib/importer/validator';
import { executeBatchImport } from '../../lib/importer/batchWriter';
import {
  downloadSampleTemplate,
  downloadFailedRowsCSV,
} from '../../lib/importer/templateGenerator';

/**
 * Enterprise Bulk Data Importer Wizard
 * 5-Step Process: Upload -> Map Columns -> Validate & Preview -> Import -> Results
 */
export default function BulkImportModal({
  isOpen,
  onClose,
  initialEntity = 'students',
  onImportSuccess,
}) {
  // Wizard Steps: 1: 'upload', 2: 'mapping', 3: 'preview', 4: 'importing', 5: 'results'
  const [step, setStep] = useState(1);
  const [selectedEntityId, setSelectedEntityId] = useState(initialEntity);

  // File State
  const [file, setFile] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [activeSheet, setActiveSheet] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  // Column Mapping State: { fieldName: selectedHeader }
  const [columnMapping, setColumnMapping] = useState({});

  // Validation State
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [previewFilter, setPreviewFilter] = useState('all'); // 'all', 'valid', 'error', 'duplicate'

  // Import Execution State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ percentage: 0, current: 0, total: 0 });
  const [importSummary, setImportSummary] = useState(null);

  // Sync initialEntity prop
  useEffect(() => {
    if (initialEntity && ENTITY_SCHEMAS[initialEntity]) {
      setSelectedEntityId(initialEntity);
    }
  }, [initialEntity, isOpen]);

  // Reset state when modal is opened or closed
  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setParsedData(null);
    setActiveSheet('');
    setParseError('');
    setColumnMapping({});
    setValidationResult(null);
    setPreviewFilter('all');
    setIsImporting(false);
    setImportSummary(null);
  };

  const handleClose = () => {
    resetWizard();
    onClose();
  };

  const activeSchema = ENTITY_SCHEMAS[selectedEntityId] || ENTITY_SCHEMAS.students;

  // STEP 1: File Upload Handler
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    await processFile(selectedFile);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    await processFile(droppedFile);
  };

  const processFile = async (uploadedFile) => {
    setFile(uploadedFile);
    setParseError('');
    setIsParsing(true);

    try {
      const parsed = await parseImportFile(uploadedFile);
      if (parsed.isEmpty) {
        throw new Error('The file appears to be empty or has no data rows below the header.');
      }
      setParsedData(parsed);
      setActiveSheet(parsed.activeSheet);

      // Automated initial column mapping
      const mapping = autoMapColumns(activeSchema, parsed.headers);
      setColumnMapping(mapping);
    } catch (err) {
      console.error('File parsing error:', err);
      setParseError(err.message || 'Failed to read spreadsheet.');
      setParsedData(null);
    } finally {
      setIsParsing(false);
    }
  };

  // Change sheet inside Excel workbook
  const handleSheetChange = async (sheetName) => {
    if (!file) return;
    setActiveSheet(sheetName);
    setIsParsing(true);
    try {
      const parsed = await parseImportFile(file, sheetName);
      setParsedData(parsed);
      const mapping = autoMapColumns(activeSchema, parsed.headers);
      setColumnMapping(mapping);
    } catch (err) {
      setParseError(err.message);
    } finally {
      setIsParsing(false);
    }
  };

  // Switch entity type
  const handleEntityChange = (newEntityId) => {
    setSelectedEntityId(newEntityId);
    if (parsedData && parsedData.headers) {
      const newSchema = ENTITY_SCHEMAS[newEntityId];
      const mapping = autoMapColumns(newSchema, parsedData.headers);
      setColumnMapping(mapping);
    }
  };

  // Check if all required fields are mapped
  const unmappedRequiredFields = useMemo(() => {
    if (!activeSchema) return [];
    return activeSchema.fields.filter((f) => f.required && !columnMapping[f.name]);
  }, [activeSchema, columnMapping]);

  // STEP 2: Proceed to Validation & Preview
  const handleRunValidation = async () => {
    if (!parsedData || !parsedData.rawRows) return;
    setIsValidating(true);
    setStep(3);

    try {
      const result = await validateImportRows(
        selectedEntityId,
        parsedData.rawRows,
        columnMapping
      );
      setValidationResult(result);
    } catch (err) {
      console.error('Validation error:', err);
      alert('Error during validation: ' + err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // STEP 3: Execute Database Import
  const handleStartImport = async () => {
    if (!validationResult) return;
    const validRows = validationResult.validatedRows.filter((r) => r.status === 'valid');
    if (validRows.length === 0) {
      alert('There are no valid rows to import.');
      return;
    }

    setStep(4);
    setIsImporting(true);
    setImportProgress({ percentage: 0, current: 0, total: validRows.length });

    try {
      const result = await executeBatchImport(
        selectedEntityId,
        validRows,
        (progress) => setImportProgress(progress)
      );

      // Combine skipped count from initial validation
      const finalSummary = {
        totalProcessed: validationResult.summary.total,
        successCount: result.successCount,
        skippedCount: validationResult.summary.duplicates,
        failedCount: validationResult.summary.errors + result.failedCount,
        failedRows: [
          ...validationResult.validatedRows.filter((r) => r.status === 'error'),
          ...result.failedRows,
        ],
      };

      setImportSummary(finalSummary);
      setStep(5);

      if (onImportSuccess) {
        onImportSuccess(finalSummary);
      }
    } catch (err) {
      console.error('Batch import execution failed:', err);
      alert('Batch import error: ' + err.message);
      setStep(3);
    } finally {
      setIsImporting(false);
    }
  };

  // Filtered preview rows
  const previewRows = useMemo(() => {
    if (!validationResult) return [];
    if (previewFilter === 'all') return validationResult.validatedRows;
    return validationResult.validatedRows.filter((r) => r.status === previewFilter);
  }, [validationResult, previewFilter]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Enterprise Bulk Import — ${activeSchema.title}`}
      subtitle="Direct Supabase PostgreSQL upload with schema mapping, validation & duplicate safeguards"
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div>
            {step > 1 && step < 4 && (
              <Button
                variant="outline"
                size="sm"
                icon={ArrowLeft}
                onClick={() => setStep((s) => s - 1)}
                disabled={isValidating || isImporting}
              >
                Previous Step
              </Button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {step === 1 && (
              <>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => setStep(2)}
                  disabled={!parsedData || isParsing || Boolean(parseError)}
                >
                  Configure Mapping ({parsedData?.rowCount || 0} rows)
                </Button>
              </>
            )}

            {step === 2 && (
              <>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowRight}
                  onClick={handleRunValidation}
                  disabled={unmappedRequiredFields.length > 0}
                >
                  Validate &amp; Preview
                </Button>
              </>
            )}

            {step === 3 && (
              <>
                <Button variant="outline" size="sm" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  icon={Upload}
                  onClick={handleStartImport}
                  disabled={isValidating || (validationResult?.summary.valid || 0) === 0}
                >
                  Import {validationResult?.summary.valid || 0} Valid Records
                </Button>
              </>
            )}

            {step === 5 && (
              <Button
                variant="primary"
                size="md"
                onClick={() => {
                  handleClose();
                }}
              >
                Done &amp; Refresh View
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* 5-Step Stepper Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          paddingBottom: '16px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {[
          { num: 1, label: '1. Select & Upload' },
          { num: 2, label: '2. Map Columns' },
          { num: 3, label: '3. Preview & Validate' },
          { num: 4, label: '4. Database Import' },
          { num: 5, label: '5. Summary' },
        ].map((item) => {
          const isDone = step > item.num;
          const isCurrent = step === item.num;
          return (
            <div
              key={item.num}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: isCurrent
                  ? 'var(--navy-950)'
                  : isDone
                  ? 'var(--status-present)'
                  : 'var(--text-muted)',
                fontWeight: isCurrent ? 700 : isDone ? 600 : 400,
                fontSize: '12px',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: isCurrent
                    ? 'var(--gold-primary)'
                    : isDone
                    ? 'var(--status-present-bg)'
                    : 'var(--bg-subtle)',
                  color: isCurrent ? '#ffffff' : isDone ? 'var(--status-present)' : 'var(--text-muted)',
                  border: isCurrent
                    ? 'none'
                    : isDone
                    ? '1px solid var(--status-present-border)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                {isDone ? '✓' : item.num}
              </div>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* ================= STEP 1: UPLOAD & ENTITY SELECT ================= */}
      {step === 1 && (
        <div>
          {/* Entity Selector Tabs */}
          <div style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
              Target Database Entity:
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '8px',
              }}
            >
              {RECOMMENDED_IMPORT_SEQUENCE.map((item) => {
                const isSelected = selectedEntityId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleEntityChange(item.id)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: isSelected
                        ? '2px solid var(--navy-900)'
                        : '1px solid var(--border-subtle)',
                      backgroundColor: isSelected ? 'var(--bg-subtle)' : '#ffffff',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          backgroundColor: isSelected ? 'var(--navy-900)' : '#e2e8f0',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                        }}
                      >
                        Step {item.order}
                      </span>
                    </div>
                    <strong style={{ fontSize: '13px', color: 'var(--navy-950)', display: 'block' }}>
                      {item.title}
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.table}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Entity Prerequisite Notice */}
          {activeSchema.dependencies && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Layers size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Prerequisite Dependency:</strong> {activeSchema.description}. Ensure the required entities are already in Supabase to avoid foreign key errors.
              </span>
            </div>
          )}

          {/* Sample Template Download Bar */}
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Download Standard Sample Template
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Pre-formatted headers and realistic sample rows for {activeSchema.title}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                variant="outline"
                size="sm"
                icon={Download}
                onClick={() => downloadSampleTemplate(selectedEntityId, 'xlsx')}
              >
                Excel Template (.xlsx)
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={FileText}
                onClick={() => downloadSampleTemplate(selectedEntityId, 'csv')}
              >
                CSV Template (.csv)
              </Button>
            </div>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            style={{
              border: '2px dashed var(--border-subtle)',
              borderRadius: '8px',
              padding: '36px 20px',
              textAlign: 'center',
              backgroundColor: '#fafbfc',
              cursor: 'pointer',
              marginBottom: '16px',
              position: 'relative',
            }}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
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

            <FileSpreadsheet
              size={40}
              color="var(--gold-dark)"
              style={{ margin: '0 auto 12px' }}
            />
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-950)', marginBottom: '4px' }}>
              Drag &amp; drop your Excel (.xlsx, .xls) or CSV file here
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              Supports Microsoft Excel (.xlsx, .xls) and standard CSV files up to 2,000+ rows
            </div>
            <Button variant="outline" size="sm" icon={Upload}>
              Browse Files from Computer
            </Button>
          </div>

          {/* Parse Loading Spinner */}
          {isParsing && (
            <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
              <RefreshCw size={18} className="animate-spin" style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: '12px' }}>Inspecting sheets and extracting headers...</div>
            </div>
          )}

          {/* Parse Error Banner */}
          {parseError && (
            <div
              style={{
                padding: '12px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                borderRadius: '6px',
                color: 'var(--status-absent)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>{parseError}</span>
            </div>
          )}

          {/* Parsed File Summary Card */}
          {parsedData && !isParsing && (
            <div
              style={{
                padding: '14px 16px',
                backgroundColor: 'var(--status-present-bg)',
                border: '1px solid var(--status-present-border)',
                borderRadius: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={20} color="var(--status-present)" />
                  <div>
                    <strong style={{ fontSize: '13px', color: 'var(--navy-950)' }}>
                      {parsedData.fileName}
                    </strong>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {(parsedData.fileSize / 1024).toFixed(1)} KB &bull;{' '}
                      <strong>{parsedData.rowCount} data rows detected</strong> &bull;{' '}
                      {parsedData.headers.length} headers
                    </div>
                  </div>
                </div>

                {/* Multiple sheet selector */}
                {parsedData.sheetNames.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sheet:</span>
                    <select
                      value={activeSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="form-select"
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    >
                      {parsedData.sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 2: MAP COLUMNS ================= */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: '14px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '4px' }}>
              Map Spreadsheet Headers to Database Fields
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Auto-matched based on column names. Adjust mapping if your spreadsheet uses different terminology.
            </p>
          </div>

          {unmappedRequiredFields.length > 0 && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 14px',
                backgroundColor: 'var(--status-absent-bg)',
                border: '1px solid var(--status-absent-border)',
                borderRadius: '6px',
                color: 'var(--status-absent)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={16} />
              <span>
                <strong>Required Fields Unmapped:</strong> Please map{' '}
                {unmappedRequiredFields.map((f) => `"${f.label}"`).join(', ')} to proceed.
              </span>
            </div>
          )}

          <div className="erp-table-scroll" style={{ maxHeight: '420px' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Database Column</th>
                  <th style={{ width: '32%' }}>Description &amp; Expected Type</th>
                  <th style={{ width: '25%' }}>Spreadsheet Header</th>
                  <th style={{ width: '15%' }}>Sample Value (Row 1)</th>
                </tr>
              </thead>
              <tbody>
                {activeSchema.fields.map((field) => {
                  const mappedHeader = columnMapping[field.name] || '';
                  const sampleVal =
                    mappedHeader && parsedData?.rawRows?.[0]
                      ? parsedData.rawRows[0][mappedHeader]
                      : '';

                  return (
                    <tr key={field.name}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '13px', color: 'var(--navy-950)' }}>
                            {field.label}
                          </strong>
                          {field.required && (
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: 'var(--status-absent)',
                                backgroundColor: 'var(--status-absent-bg)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                              }}
                            >
                              Required
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                          {field.name}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {field.description}
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Type: <strong>{field.type}</strong>
                          {field.options && ` [${field.options.join(', ')}]`}
                        </div>
                      </td>

                      <td>
                        <select
                          value={mappedHeader}
                          onChange={(e) =>
                            setColumnMapping((prev) => ({
                              ...prev,
                              [field.name]: e.target.value,
                            }))
                          }
                          className="form-select"
                          style={{
                            fontSize: '12px',
                            borderColor:
                              field.required && !mappedHeader
                                ? 'var(--status-absent)'
                                : 'var(--border-subtle)',
                          }}
                        >
                          <option value="">— Skip Column —</option>
                          {parsedData.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td>
                        <span
                          style={{
                            fontSize: '11px',
                            color: sampleVal ? 'var(--navy-950)' : 'var(--text-light)',
                            fontFamily: 'var(--font-mono)',
                            maxWidth: '140px',
                            display: 'inline-block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={String(sampleVal)}
                        >
                          {sampleVal !== '' && sampleVal !== undefined
                            ? String(sampleVal)
                            : '(empty)'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= STEP 3: PREVIEW & VALIDATE ================= */}
      {step === 3 && (
        <div>
          {isValidating ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--navy-950)' }}>
                Validating rows against Supabase constraints...
              </div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                Checking duplicate primary keys and resolving foreign key relationships
              </div>
            </div>
          ) : (
            <div>
              {/* Validation Summary Metrics Bar */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '12px',
                  marginBottom: '16px',
                }}
              >
                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Rows in File</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--navy-950)' }}>
                    {validationResult?.summary.total || 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-present-bg)',
                    border: '1px solid var(--status-present-border)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--status-present)' }}>Valid &amp; Ready</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-present)' }}>
                    {validationResult?.summary.valid || 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-late-bg)',
                    border: '1px solid var(--status-late-border)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--status-late)' }}>Existing Duplicates</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-late)' }}>
                    {validationResult?.summary.duplicates || 0}
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--status-absent-bg)',
                    border: '1px solid var(--status-absent-border)',
                  }}
                >
                  <div style={{ fontSize: '11px', color: 'var(--status-absent)' }}>Invalid / Errors</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--status-absent)' }}>
                    {validationResult?.summary.errors || 0}
                  </div>
                </div>
              </div>

              {/* Filter pills & warning notice */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'all', label: `All (${validationResult?.summary.total || 0})` },
                    { id: 'valid', label: `Valid (${validationResult?.summary.valid || 0})` },
                    { id: 'duplicate', label: `Duplicates (${validationResult?.summary.duplicates || 0})` },
                    { id: 'error', label: `Errors (${validationResult?.summary.errors || 0})` },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setPreviewFilter(filter.id)}
                      className={`btn btn-sm ${
                        previewFilter === filter.id ? 'btn-primary' : 'btn-outline'
                      }`}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Duplicates will be safely skipped. Only valid rows will be committed.
                </span>
              </div>

              {/* Preview Rows Table */}
              <div className="erp-table-scroll" style={{ maxHeight: '360px' }}>
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th style={{ width: '80px' }}>Row #</th>
                      <th style={{ width: '120px' }}>Status</th>
                      <th>Validation Note / Reason</th>
                      <th>Key Values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600 }}>
                            #{row.rowNumber}
                          </span>
                        </td>
                        <td>
                          {row.status === 'valid' && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--status-present-bg)',
                                color: 'var(--status-present)',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              <CheckCircle2 size={12} /> Valid
                            </span>
                          )}
                          {row.status === 'duplicate' && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--status-late-bg)',
                                color: 'var(--status-late)',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              <AlertTriangle size={12} /> Duplicate
                            </span>
                          )}
                          {row.status === 'error' && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                backgroundColor: 'var(--status-absent-bg)',
                                color: 'var(--status-absent)',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              <AlertCircle size={12} /> Error
                            </span>
                          )}
                        </td>
                        <td>
                          {row.errors.length > 0 && (
                            <div style={{ color: 'var(--status-absent)', fontSize: '12px', fontWeight: 500 }}>
                              {row.errors.join('; ')}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div style={{ color: 'var(--status-late)', fontSize: '12px' }}>
                              {row.warnings.join('; ')}
                            </div>
                          )}
                          {row.info && row.info.length > 0 && (
                            <div
                              style={{
                                color: 'var(--navy-800)',
                                fontSize: '11px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginTop: '2px',
                              }}
                            >
                              <Sparkles size={12} color="var(--gold-dark)" style={{ flexShrink: 0 }} />
                              <span>{row.info.join('; ')}</span>
                            </div>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && (!row.info || row.info.length === 0) && (
                            <span style={{ color: 'var(--status-present)', fontSize: '12px' }}>
                              Ready for insertion
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {selectedEntityId === 'courses' && (
                              <span>
                                <strong>{row.resolvedData.code || '—'}</strong> &bull; {row.resolvedData.name || '—'}
                              </span>
                            )}
                            {selectedEntityId === 'batches' && (
                              <span>
                                <strong>{row.resolvedData.code || '—'}</strong> &bull; {row.resolvedData.name || '—'} (Course: {row.resolvedData.course_code || '—'})
                              </span>
                            )}
                            {selectedEntityId === 'students' && (
                              <span>
                                <strong>{row.resolvedData.admission_no || '—'}</strong> &bull; {row.resolvedData.full_name || '—'} (Batch: {row.resolvedData.batch_code || '—'})
                              </span>
                            )}
                            {selectedEntityId === 'parents' && (
                              <span>
                                <strong>{row.resolvedData.full_name || '—'}</strong> ({row.resolvedData.phone || '—'}) &bull; Ward: {row.resolvedData.student_admission_no || '—'}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================= STEP 4: IMPORTING PROGRESS ================= */}
      {step === 4 && (
        <div style={{ padding: '36px 20px', textAlign: 'center' }}>
          <RefreshCw
            size={36}
            className="animate-spin"
            color="var(--gold-dark)"
            style={{ margin: '0 auto 16px' }}
          />

          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--navy-950)', marginBottom: '6px' }}>
            Writing Records to Supabase PostgreSQL Database
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' }}>
            Inserting chunk {importProgress.currentChunk || 1} of {importProgress.totalChunks || 1} safely via authenticated admin session...
          </p>

          <div
            style={{
              maxWidth: '460px',
              margin: '0 auto',
              backgroundColor: '#e2e8f0',
              height: '10px',
              borderRadius: '5px',
              overflow: 'hidden',
              marginBottom: '10px',
            }}
          >
            <div
              style={{
                width: `${importProgress.percentage}%`,
                height: '100%',
                backgroundColor: 'var(--gold-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy-950)' }}>
            {importProgress.percentage}% Complete ({importProgress.current} / {importProgress.total} rows)
          </div>
        </div>
      )}

      {/* ================= STEP 5: RESULTS SUMMARY ================= */}
      {step === 5 && importSummary && (
        <div style={{ padding: '16px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor:
                  importSummary.successCount > 0 ? 'var(--status-present-bg)' : 'var(--status-absent-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 12px',
                color:
                  importSummary.successCount > 0 ? 'var(--status-present)' : 'var(--status-absent)',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--navy-950)' }}>
              Bulk Import Operation Completed
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Supabase table <code>public.{activeSchema.table}</code> has been updated.
            </p>
          </div>

          {/* Results KPI Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                padding: '14px',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-subtle)',
                border: '1px solid var(--border-subtle)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Processed</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--navy-950)' }}>
                {importSummary.totalProcessed}
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-present-bg)',
                border: '1px solid var(--status-present-border)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--status-present)' }}>Successfully Inserted</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-present)' }}>
                {importSummary.successCount}
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '6px',
                backgroundColor: 'var(--status-late-bg)',
                border: '1px solid var(--status-late-border)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--status-late)' }}>Skipped Duplicates</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--status-late)' }}>
                {importSummary.skippedCount}
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '6px',
                backgroundColor:
                  importSummary.failedCount > 0 ? 'var(--status-absent-bg)' : '#f8fafc',
                border: `1px solid ${
                  importSummary.failedCount > 0
                    ? 'var(--status-absent-border)'
                    : 'var(--border-subtle)'
                }`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  color: importSummary.failedCount > 0 ? 'var(--status-absent)' : 'var(--text-muted)',
                }}
              >
                Failed Rows
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 700,
                  color: importSummary.failedCount > 0 ? 'var(--status-absent)' : 'var(--navy-950)',
                }}
              >
                {importSummary.failedCount}
              </div>
            </div>
          </div>

          {/* Failed Rows Export Action */}
          {importSummary.failedCount > 0 && (
            <div
              style={{
                padding: '14px 18px',
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <div>
                <strong style={{ fontSize: '13px', color: '#9f1239' }}>
                  {importSummary.failedCount} rows could not be imported
                </strong>
                <div style={{ fontSize: '12px', color: '#be123c', marginTop: '2px' }}>
                  Download the failed rows file with exact error reasons to fix and re-upload.
                </div>
              </div>

              <Button
                variant="danger"
                size="sm"
                icon={Download}
                onClick={() =>
                  downloadFailedRowsCSV(importSummary.failedRows, selectedEntityId)
                }
              >
                Download Failed Rows (.csv)
              </Button>
            </div>
          )}

          {/* Next Recommended Step guidance */}
          {selectedEntityId === 'courses' && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRight}
                onClick={() => {
                  setSelectedEntityId('batches');
                  resetWizard();
                }}
              >
                Proceed to Import Batches Next
              </Button>
            </div>
          )}
          {selectedEntityId === 'batches' && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRight}
                onClick={() => {
                  setSelectedEntityId('students');
                  resetWizard();
                }}
              >
                Proceed to Import Students Next
              </Button>
            </div>
          )}
          {selectedEntityId === 'students' && (
            <div style={{ textAlign: 'center', marginTop: '16px' }}>
              <Button
                variant="outline"
                size="sm"
                icon={ArrowRight}
                onClick={() => {
                  setSelectedEntityId('parents');
                  resetWizard();
                }}
              >
                Proceed to Import Parents Next
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
