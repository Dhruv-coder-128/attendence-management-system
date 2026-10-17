import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  Search,
  CheckCheck,
  School,
  Check,
  Camera,
  ArrowLeft,
  ChevronRight,
  Clock,
  MapPin,
  X,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  checkHubConnection,
  fetchBatchesFromHub,
  fetchStudentsFromHub,
  submitAttendanceToHub,
  DEFAULT_SCHOOL_PC_URL,
} from '../lib/localWifiHubService';
import { useAcademySettings } from '../lib/academySettings';

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [connectionStatus, setConnectionStatus] = useState({ ok: false, mode: 'checking' });

  // 2-View Screen Mode: 'batches' (list of cohorts) | 'rollcall' (student roll call)
  const [viewMode, setViewMode] = useState('batches');

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedSummary, setSavedSummary] = useState(null);
  const [urlInput, setUrlInput] = useState(hubUrl);
  const [cameraError, setCameraError] = useState('');

  // Data
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const qrScannerRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // 1. Load Cohort Batches
  const loadBatches = React.useCallback(async (targetUrl = hubUrl) => {
    setIsLoading(true);
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(list);
    setIsLoading(false);
  }, [hubUrl]);

  // 2. Verify Connection
  const verifyConnection = React.useCallback(async (targetUrl = hubUrl) => {
    const res = await checkHubConnection(targetUrl);
    setConnectionStatus(res);
    loadBatches(targetUrl);
  }, [hubUrl, loadBatches]);

  useEffect(() => {
    verifyConnection(hubUrl);
  }, [hubUrl, verifyConnection]);

  // 3. Load Students when batch is opened
  const openBatchRollCall = async (batchId) => {
    setSelectedBatchId(batchId);
    setViewMode('rollcall');
    setIsLoading(true);

    const studentList = await fetchStudentsFromHub(batchId, hubUrl);
    setStudents(studentList);

    // Default: Everyone is marked Present
    const initialMap = {};
    studentList.forEach((s) => {
      initialMap[s.id] = 'Present';
    });
    setAttendanceMap(initialMap);
    setIsLoading(false);
  };

  // Toggle single student status (Present / Absent)
  const setStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Quick Action: Mark All Present
  const markAllPresent = () => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = 'Present';
    });
    setAttendanceMap(updated);
    showToast('✓ All students marked Present');
  };

  // Quick Action: Mark All Absent
  const markAllAbsent = () => {
    const updated = {};
    students.forEach((s) => {
      updated[s.id] = 'Absent';
    });
    setAttendanceMap(updated);
    showToast('All students marked Absent');
  };

  // Metric Computations
  const totalCount = students.length;
  const presentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Present').length;
  }, [attendanceMap]);

  const absentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Absent').length;
  }, [attendanceMap]);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        s.full_name?.toLowerCase().includes(term) ||
        String(s.roll_no || '').includes(term) ||
        s.admission_no?.toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  // Submit attendance ("DONE" Action)
  const handleSubmit = async () => {
    if (!selectedBatchId || students.length === 0) return;

    setIsSubmitting(true);
    const records = students.map((s) => ({
      student_id: s.id,
      status: attendanceMap[s.id] || 'Present',
      remarks: '',
    }));

    const res = await submitAttendanceToHub(selectedBatchId, selectedDate, records, hubUrl);
    setIsSubmitting(false);

    if (res.ok) {
      setSavedSummary({
        batchName: activeBatch.name || 'Current Class',
        date: selectedDate,
        total: totalCount,
        present: presentCount,
        absent: absentCount,
      });
      setShowSuccessModal(true);
    } else if (res.queued) {
      showToast('⚠️ Saved to phone storage (will sync when School Wi-Fi connects).');
    } else {
      alert('Error saving attendance: ' + (res.error || 'Connection failed'));
    }
  };

  const handleScannedResult = React.useCallback((rawText) => {
    try {
      let target = rawText.trim();
      // If full URL scanned (e.g. http://192.168.0.104:5173/?portal=teacher)
      if (target.startsWith('http://') || target.startsWith('https://')) {
        const parsed = new URL(target);
        target = `${parsed.protocol}//${parsed.host}`;
      } else if (!target.startsWith('http')) {
        target = `http://${target}`;
      }
      setStoredHubUrl(target);
      setHubUrl(target);
      setUrlInput(target);
      showToast(`✓ Scanned & Connected: ${target.replace(/^https?:\/\//, '')}`);
      verifyConnection(target);
    } catch {
      showToast('Scanned code: ' + rawText);
    }
  }, [verifyConnection]);

  // Camera QR Scanner Handler
  useEffect(() => {
    let html5QrCode = null;

    if (showCameraScanner) {
      // Small delay to allow DOM element #qr-reader to mount
      const timer = setTimeout(() => {
        try {
          html5QrCode = new Html5Qrcode('qr-reader');
          qrScannerRef.current = html5QrCode;

          html5QrCode
            .start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 220, height: 220 } },
              (decodedText) => {
                // QR Code detected!
                if (decodedText) {
                  html5QrCode
                    .stop()
                    .then(() => {
                      setShowCameraScanner(false);
                      handleScannedResult(decodedText);
                    })
                    .catch(() => {
                      setShowCameraScanner(false);
                      handleScannedResult(decodedText);
                    });
                }
              },
              () => {
                // Ignore per-frame non-matches
              }
            )
            .catch((err) => {
              console.warn('Camera scan error:', err);
              setCameraError(
                'Camera could not be opened. Please grant Camera permission in your phone app settings, or type the IP below.'
              );
            });
        } catch (e) {
          setCameraError('Camera error: ' + e.message);
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (qrScannerRef.current && qrScannerRef.current.isScanning) {
          qrScannerRef.current.stop().catch(() => {});
        }
      };
    }
  }, [showCameraScanner, handleScannedResult]);

  const activeBatch = batches.find((b) => b.id === selectedBatchId) || batches[0] || {};

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f4f6fa',
        color: '#0f172a',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        paddingBottom: viewMode === 'rollcall' ? '100px' : '30px',
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            left: '16px',
            right: '16px',
            zIndex: 9999,
            backgroundColor: '#0a1122',
            color: '#ffffff',
            border: '1px solid #c5a880',
            padding: '12px 18px',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={18} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Professional Desktop .exe Color Scheme Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: '#0a1122',
          borderBottom: '1px solid #1e293b',
          padding: '12px 16px',
          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: '#111d33',
                border: '1px solid #c5a880',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {academySettings.logo ? (
                <img
                  src={academySettings.logo}
                  alt="Logo"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <School size={20} color="#c5a880" />
              )}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
                {academySettings.academy_name || 'SMS — Student Management System'}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 500 }}>
                Teacher Attendance App
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Quick Camera QR Scan Button */}
            <button
              onClick={() => setShowCameraScanner(true)}
              style={{
                background: '#111d33',
                border: '1px solid #c5a880',
                color: '#c5a880',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontSize: '11px',
                fontWeight: 700,
              }}
              title="Scan QR Code from PC screen"
            >
              <Camera size={14} />
              <span>Scan QR</span>
            </button>

            <button
              onClick={() => {
                setUrlInput(hubUrl);
                setShowSettingsModal(true);
              }}
              style={{
                background: '#111d33',
                border: '1px solid #1e293b',
                color: '#cbd5e1',
                padding: '7px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Wi-Fi Connection Settings"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {/* Connection Status Indicator Bar */}
        <div
          onClick={() => setShowSettingsModal(true)}
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '5px 10px',
            borderRadius: '6px',
            backgroundColor: connectionStatus.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${connectionStatus.ok ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: connectionStatus.ok ? '#10b981' : '#ef4444',
                boxShadow: connectionStatus.ok ? '0 0 6px #10b981' : '0 0 6px #ef4444',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: connectionStatus.ok ? '#10b981' : '#f87171',
              }}
            >
              {connectionStatus.ok
                ? connectionStatus.mode === 'wifi'
                  ? 'Connected to School PC (Wi-Fi)'
                  : 'Connected to School Database'
                : 'Offline / Tap to Scan PC QR'}
            </span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace' }}>
            {hubUrl.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* SCREEN 1: ALL BATCHES SELECTION SCREEN                                  */}
      {/* ========================================================================= */}
      {viewMode === 'batches' && (
        <main style={{ padding: '16px', maxWidth: '600px', margin: '0 auto' }}>
          {/* Section Heading */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                Academic Batches
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                Select a class to take student roll call
              </p>
            </div>
            <span
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0f172a',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {batches.length} Classes
            </span>
          </div>

          {/* Batches Cards Grid */}
          {isLoading && batches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 0', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#c5a880' }} />
              <div style={{ fontSize: '13px' }}>Loading batches from School PC...</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {batches.map((b) => (
                <div
                  key={b.id}
                  onClick={() => openBatchRollCall(b.id)}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          backgroundColor: '#0a1122',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {b.code || 'BATCH'}
                      </span>
                      {b.classroom && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <MapPin size={12} color="#94a3b8" />
                          {b.classroom}
                        </span>
                      )}
                    </div>

                    <span
                      style={{
                        color: '#c5a880',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      Take Attendance <ChevronRight size={14} />
                    </span>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                      {b.name}
                    </h3>
                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} color="#94a3b8" />
                      <span>{b.timing || 'Standard Timings'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 2: STUDENT ROLL CALL SCREEN (EXACT DESKTOP .EXE COLOR SCHEME)     */}
      {/* ========================================================================= */}
      {viewMode === 'rollcall' && (
        <main style={{ padding: '14px 16px', maxWidth: '600px', margin: '0 auto' }}>
          {/* Top Bar with Back Navigation */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '14px',
            }}
          >
            <button
              onClick={() => setViewMode('batches')}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <ArrowLeft size={14} />
              Back to Batches
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
          </div>

          {/* Active Class Title */}
          <div style={{ marginBottom: '14px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {activeBatch.name}
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {activeBatch.timing || 'Daily Attendance Register'} • {activeBatch.classroom || 'Room 101'}
            </div>
          </div>

          {/* 3 Metric Cards Styled Identical to Desktop .exe (Screenshot #3) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
            {/* Total / Enrolled */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #3b82f6',
                borderRadius: '10px',
                padding: '10px 8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Enrolled
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {totalCount}
              </div>
            </div>

            {/* Present (Green Top Border) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #10b981',
                borderRadius: '10px',
                padding: '10px 8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>
                Present
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {presentCount}
              </div>
            </div>

            {/* Absent (Red Top Border) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #ef4444',
                borderRadius: '10px',
                padding: '10px 8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '10px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>
                Absent
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                {absentCount}
              </div>
            </div>
          </div>

          {/* Quick Mark Shortcuts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              onClick={markAllPresent}
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #10b981',
                color: '#10b981',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <CheckCheck size={15} />
              Mark All Present
            </button>
            <button
              onClick={markAllAbsent}
              style={{
                flex: 1,
                backgroundColor: '#ffffff',
                border: '1px solid #ef4444',
                color: '#ef4444',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <XCircle size={15} />
              Mark All Absent
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '11px' }} />
            <input
              type="text"
              placeholder="Search student by name or roll number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                padding: '8px 12px 8px 34px',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              }}
            />
          </div>

          {/* Student Roster Cards */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <RefreshCw size={26} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#c5a880' }} />
              <div style={{ fontSize: '13px' }}>Loading students...</div>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 16px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              No students found for this class.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredStudents.map((s, index) => {
                const currentStatus = attendanceMap[s.id] || 'Present';
                const isPresent = currentStatus === 'Present';
                const isAbsent = currentStatus === 'Absent';

                return (
                  <div
                    key={s.id}
                    style={{
                      backgroundColor: '#ffffff',
                      border: `1px solid ${isPresent ? '#10b981' : isAbsent ? '#ef4444' : '#e2e8f0'}`,
                      borderRadius: '12px',
                      padding: '12px 14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            backgroundColor: '#0a1122',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '12px',
                          }}
                        >
                          #{s.roll_no || index + 1}
                        </div>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                            {s.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            Adm: {s.admission_no} • {s.gender || 'Student'}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: isPresent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isPresent ? '#10b981' : '#ef4444',
                        }}
                      >
                        {currentStatus}
                      </span>
                    </div>

                    {/* 2 Tactile Buttons: PRESENT vs ABSENT */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <button
                        onClick={() => setStudentStatus(s.id, 'Present')}
                        style={{
                          padding: '9px 0',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          backgroundColor: isPresent ? '#10b981' : '#f8fafc',
                          color: isPresent ? '#ffffff' : '#64748b',
                          border: `1.5px solid ${isPresent ? '#10b981' : '#cbd5e1'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: isPresent ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none',
                        }}
                      >
                        <CheckCircle2 size={16} />
                        Present
                      </button>
                      <button
                        onClick={() => setStudentStatus(s.id, 'Absent')}
                        style={{
                          padding: '9px 0',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: 700,
                          backgroundColor: isAbsent ? '#ef4444' : '#f8fafc',
                          color: isAbsent ? '#ffffff' : '#64748b',
                          border: `1.5px solid ${isAbsent ? '#ef4444' : '#cbd5e1'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          boxShadow: isAbsent ? '0 2px 6px rgba(239, 68, 68, 0.3)' : 'none',
                        }}
                      >
                        <XCircle size={16} />
                        Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Sticky Bottom "DONE" Button in Executive Desktop Theme */}
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: '#0a1122',
              borderTop: '1px solid #1e293b',
              padding: '12px 16px',
              boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.2)',
              zIndex: 40,
            }}
          >
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || students.length === 0}
              style={{
                width: '100%',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '14px 16px',
                fontSize: '15px',
                fontWeight: 800,
                cursor: isSubmitting || students.length === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)',
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  Saving to School PC...
                </>
              ) : (
                <>
                  <Check size={18} strokeWidth={3} />
                  DONE — Save Attendance ({presentCount} Present, {absentCount} Absent)
                </>
              )}
            </button>
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* CAMERA QR CODE SCANNER MODAL                                             */}
      {/* ========================================================================= */}
      {showCameraScanner && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '20px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0a1122" />
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Scan School PC QR</span>
              </div>
              <button
                onClick={() => setShowCameraScanner(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Point your phone camera at the QR code displayed on the School PC screen.
            </p>

            {/* Video Preview Container */}
            <div
              id="qr-reader"
              style={{
                width: '100%',
                borderRadius: '10px',
                overflow: 'hidden',
                backgroundColor: '#000000',
                marginBottom: '12px',
              }}
            />

            {cameraError && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  padding: '8px',
                  color: '#ef4444',
                  fontSize: '11px',
                  marginBottom: '12px',
                  textAlign: 'left',
                }}
              >
                {cameraError}
              </div>
            )}

            <button
              onClick={() => {
                setShowCameraScanner(false);
                setShowSettingsModal(true);
              }}
              style={{
                width: '100%',
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#334155',
                cursor: 'pointer',
              }}
            >
              Enter IP Manually
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* WI-FI CONNECTION SETTINGS MODAL                                          */}
      {/* ========================================================================= */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '22px',
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                School PC Wi-Fi Connection
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>

            <p style={{ margin: '0 0 14px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Connect with camera QR scan, or enter the School PC local Wi-Fi address.
            </p>

            {/* Camera Scan Shortcut */}
            <button
              onClick={() => {
                setShowSettingsModal(false);
                setShowCameraScanner(true);
              }}
              style={{
                width: '100%',
                backgroundColor: '#0a1122',
                color: '#ffffff',
                border: '1px solid #c5a880',
                borderRadius: '8px',
                padding: '11px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer',
                marginBottom: '14px',
              }}
            >
              <Camera size={16} color="#c5a880" />
              Scan QR Code with Camera
            </button>

            <div style={{ textAlign: 'center', margin: '0 0 12px 0', fontSize: '11px', color: '#94a3b8' }}>
              — OR ENTER IP MANUALLY —
            </div>

            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
              SCHOOL PC WI-FI URL:
            </label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="e.g. http://192.168.0.104:5173"
              style={{
                width: '100%',
                backgroundColor: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '9px 12px',
                color: '#0f172a',
                fontSize: '13px',
                outline: 'none',
                marginBottom: '8px',
                boxSizing: 'border-box',
                fontFamily: 'monospace',
              }}
            />

            <button
              type="button"
              onClick={() => setUrlInput(DEFAULT_SCHOOL_PC_URL)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: '#0284c7',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0 0 14px 0',
                display: 'block',
              }}
            >
              ↺ Reset to Active Default ({DEFAULT_SCHOOL_PC_URL.replace('http://', '')})
            </button>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#64748b',
                  borderRadius: '8px',
                  padding: '9px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const clean = urlInput.trim().replace(/\/+$/, '');
                  setStoredHubUrl(clean);
                  setHubUrl(clean);
                  setShowSettingsModal(false);
                  verifyConnection(clean);
                  showToast(`Connecting to ${clean}...`);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#0a1122',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '8px',
                  padding: '9px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Connect Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUCCESS CONFIRMATION MODAL                                               */}
      {/* ========================================================================= */}
      {showSuccessModal && savedSummary && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '360px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 45px rgba(0,0,0,0.2)',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px auto',
                color: '#10b981',
              }}
            >
              <Check size={28} strokeWidth={3} />
            </div>

            <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
              Attendance Saved!
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
              Roll call has been recorded and synced to the school computer database.
            </p>

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '16px',
                fontSize: '12px',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                <span style={{ color: '#64748b' }}>Class:</span>
                <strong>{savedSummary.batchName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                <span style={{ color: '#64748b' }}>Date:</span>
                <strong>{savedSummary.date}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                <span style={{ color: '#64748b' }}>Present:</span>
                <strong style={{ color: '#10b981' }}>{savedSummary.present} Students</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#334155' }}>
                <span style={{ color: '#64748b' }}>Absent:</span>
                <strong style={{ color: '#ef4444' }}>{savedSummary.absent} Students</strong>
              </div>
            </div>

            <button
              onClick={() => {
                setShowSuccessModal(false);
                setViewMode('batches');
              }}
              style={{
                width: '100%',
                backgroundColor: '#0a1122',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '11px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Done / Return to Classes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
