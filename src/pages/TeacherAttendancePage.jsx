import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  WifiOff,
  QrCode,
  Lock,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react';
import { App } from '@capacitor/app';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  getStoredHubToken,
  setStoredHubToken,
  checkHubConnection,
  fetchBatchesFromHub,
  fetchStudentsFromHub,
  fetchExistingAttendanceFromHub,
  submitAttendanceToHub,
  getOfflineQueue,
  flushOfflineQueue,
  DEFAULT_SCHOOL_PC_URL,
  pairDeviceWithHub,
  checkDeviceRegistration,
  isDevicePairedLocally,
  setDevicePairedLocally,
} from '../lib/localWifiHubService';
import { useAcademySettings } from '../lib/academySettings';
import { CANONICAL_BATCHES } from '../data/canonicalSchoolData';

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [isDevicePaired, setIsDevicePaired] = useState(() => isDevicePairedLocally());
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isPairing, setIsPairing] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState({
    ok: false,
    state: 'checking', // 'checking' | 'connected' | 'wifi_disconnected' | 'pc_unreachable'
    url: hubUrl,
    error: null,
  });

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
  const [batches, setBatches] = useState(CANONICAL_BATCHES);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({}); // { student_id: 'Present' | 'Late' | 'Absent' }

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [offlineQueue, setOfflineQueue] = useState(() => getOfflineQueue());
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);

  const qrScannerRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4500);
  };

  // =========================================================================
  // ANDROID HARDWARE / GESTURE BACK BUTTON INTERCEPTION (100% RELIABLE)
  // =========================================================================
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const showCameraScannerRef = useRef(showCameraScanner);
  showCameraScannerRef.current = showCameraScanner;
  const showSettingsModalRef = useRef(showSettingsModal);
  showSettingsModalRef.current = showSettingsModal;
  const showOtpModalRef = useRef(showOtpModal);
  showOtpModalRef.current = showOtpModal;
  const showSuccessModalRef = useRef(showSuccessModal);
  showSuccessModalRef.current = showSuccessModal;
  const lastBackPressTimeRef = useRef(0);

  useEffect(() => {
    let listenerHandle = null;

    const handleBackAction = () => {
      // 1. Close open camera scanner modal
      if (showCameraScannerRef.current) {
        setShowCameraScanner(false);
        return;
      }
      // 2. Close settings modal
      if (showSettingsModalRef.current) {
        setShowSettingsModal(false);
        return;
      }
      // 3. Close OTP modal
      if (showOtpModalRef.current) {
        setShowOtpModal(false);
        return;
      }
      // 4. Close success modal
      if (showSuccessModalRef.current) {
        setShowSuccessModal(false);
        return;
      }
      // 5. If in student roll call, RETURN TO BATCH CARDS! NEVER EXIT APP!
      if (viewModeRef.current === 'rollcall') {
        setViewMode('batches');
        return;
      }

      // 5. On batches root screen: require double back-tap within 2.0s before exit
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        try {
          App.exitApp();
        } catch {}
      } else {
        lastBackPressTimeRef.current = now;
        showToast('Press back once more to exit application');
      }
    };

    try {
      App.addListener('backButton', handleBackAction)
        .then((handle) => {
          listenerHandle = handle;
        })
        .catch(() => {});
    } catch {}

    // Web / browser popstate support
    const handlePopState = (e) => {
      if (viewModeRef.current === 'rollcall') {
        e?.preventDefault?.();
        setViewMode('batches');
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 1. Load Batches
  const loadBatches = useCallback(async (targetUrl = hubUrl) => {
    setIsLoading(true);
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(Array.isArray(list) ? list : []);
    setIsLoading(false);
  }, [hubUrl]);

  // 2. Verify Connection
  const verifyConnection = useCallback(async (targetUrl = hubUrl) => {
    const res = await checkHubConnection(targetUrl);
    setConnectionStatus(res);
    loadBatches(targetUrl);
    if (res?.ok) {
      flushOfflineQueue(targetUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    }
  }, [hubUrl, loadBatches]);

  useEffect(() => {
    verifyConnection(hubUrl);
  }, [hubUrl, verifyConnection]);

  // Recheck when phone reconnects to network
  useEffect(() => {
    const handleOnline = () => verifyConnection(hubUrl);
    const handleOffline = () => {
      setConnectionStatus({
        ok: false,
        state: 'wifi_disconnected',
        url: hubUrl,
        error: 'Phone is offline. Please connect to the School Wi-Fi network.',
      });
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [hubUrl, verifyConnection]);

  // 3. Load Students when batch is opened & load existing attendance from PC
  const openBatchRollCall = async (batchId) => {
    setSelectedBatchId(batchId);
    setViewMode('rollcall');
    setIsLoading(true);

    // Push state so back gesture works
    try {
      window.history.pushState({ view: 'rollcall' }, '');
    } catch {}

    let studentList = await fetchStudentsFromHub(batchId, hubUrl);
    if (!Array.isArray(studentList)) {
      studentList = [];
    }
    setStudents(studentList);

    // Fetch any attendance previously marked today on PC or phone
    const existingRecords = await fetchExistingAttendanceFromHub(batchId, selectedDate, hubUrl);

    const initialMap = {};
    if (Array.isArray(existingRecords) && existingRecords.length > 0) {
      existingRecords.forEach((r) => {
        const idKey = r.student_id || r.admission_no;
        if (idKey) {
          initialMap[idKey] = r.status || 'Present';
        }
      });
      // Fill in any students missing from existing records as Present
      studentList.forEach((s) => {
        if (!initialMap[s.id] && !initialMap[s.admission_no]) {
          initialMap[s.id] = 'Present';
        }
      });
      showToast('✓ Loaded existing roll call from School PC');
    } else {
      // Default: Everyone is marked Present
      studentList.forEach((s) => {
        initialMap[s.id] = 'Present';
      });
    }

    setAttendanceMap(initialMap);
    setIsLoading(false);
  };

  // When date changes in roll call mode, re-fetch attendance for that date
  const handleDateChange = async (newDate) => {
    setSelectedDate(newDate);
    if (!selectedBatchId) return;

    setIsLoading(true);
    const existingRecords = await fetchExistingAttendanceFromHub(selectedBatchId, newDate, hubUrl);
    const map = {};
    if (Array.isArray(existingRecords) && existingRecords.length > 0) {
      existingRecords.forEach((r) => {
        const idKey = r.student_id || r.admission_no;
        if (idKey) map[idKey] = r.status || 'Present';
      });
      students.forEach((s) => {
        if (!map[s.id] && !map[s.admission_no]) map[s.id] = 'Present';
      });
      showToast(`Loaded records for ${newDate}`);
    } else {
      students.forEach((s) => {
        map[s.id] = 'Present';
      });
    }
    setAttendanceMap(map);
    setIsLoading(false);
  };

  // Toggle single student status (Present / Late / Absent)
  const setStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Bulk actions
  const markAllPresent = () => {
    const map = {};
    students.forEach((s) => {
      map[s.id] = 'Present';
    });
    setAttendanceMap(map);
    showToast('All students marked Present');
  };

  const markAllAbsent = () => {
    const map = {};
    students.forEach((s) => {
      map[s.id] = 'Absent';
    });
    setAttendanceMap(map);
    showToast('All students marked Absent');
  };

  // Metric Computations (Present, Late, Absent, Total)
  const totalCount = students.length;
  const presentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Present').length;
  }, [attendanceMap]);

  const lateCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Late').length;
  }, [attendanceMap]);

  const absentCount = useMemo(() => {
    return Object.values(attendanceMap).filter((st) => st === 'Absent').length;
  }, [attendanceMap]);

  // Strict Deduplication of Batches by Unique Code
  const uniqueBatches = useMemo(() => {
    const map = new Map();
    (batches || []).forEach((b) => {
      const codeKey = (b.code || b.id || b.name || '').toUpperCase().trim();
      if (codeKey && !map.has(codeKey)) {
        map.set(codeKey, b);
      }
    });
    return Array.from(map.values());
  }, [batches]);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return students;
    const term = searchTerm.toLowerCase();
    return students.filter(
      (s) =>
        (s.full_name || s.name || '')?.toLowerCase().includes(term) ||
        String(s.roll_no || '').includes(term) ||
        String(s.admission_no || '').toLowerCase().includes(term)
    );
  }, [students, searchTerm]);

  // Active Batch Object
  const activeBatch = uniqueBatches.find(
    (b) =>
      b.id === selectedBatchId ||
      b.code === selectedBatchId ||
      b.name === selectedBatchId ||
      b.name?.toLowerCase() === selectedBatchId?.toLowerCase() ||
      b.code?.toLowerCase() === selectedBatchId?.toLowerCase()
  ) || uniqueBatches[0] || {};

  // Submit attendance ("DONE" Action)
  const handleSubmit = async () => {
    if (!selectedBatchId || students.length === 0) return;

    setIsSubmitting(true);
    const records = students.map((s) => ({
      student_id: s.id,
      admission_no: s.admission_no || s.id,
      roll_no: s.roll_no,
      full_name: s.full_name || s.name || '',
      status: attendanceMap[s.id] || 'Present',
      remarks: '',
      time_in: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
    }));

    const res = await submitAttendanceToHub(
      activeBatch.id || selectedBatchId,
      selectedDate,
      records,
      hubUrl,
      {
        batch_code: activeBatch.code || selectedBatchId,
        batch_name: activeBatch.name || '',
      }
    );
    setIsSubmitting(false);

    if (res.ok) {
      setSavedSummary({
        batchName: activeBatch.name || 'Current Class',
        date: selectedDate,
        total: totalCount,
        present: presentCount,
        late: lateCount,
        absent: absentCount,
      });
      setShowSuccessModal(true);
      setOfflineQueue(getOfflineQueue());
      flushOfflineQueue(hubUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    } else if (res.queued) {
      setOfflineQueue(getOfflineQueue());
      showToast('⚠️ Saved to phone storage (will sync when School Wi-Fi connects).');
    } else if (res.unauthorized) {
      alert(res.error || 'Pairing token expired. Please scan the QR code on the School PC.');
      setShowCameraScanner(true);
    } else {
      alert('Error saving attendance: ' + (res.error || 'Connection failed'));
    }
  };

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    const res = await flushOfflineQueue(hubUrl);
    setIsFlushingQueue(false);
    setOfflineQueue(getOfflineQueue());
    if (res.ok && res.flushedCount > 0) {
      showToast(`✓ Successfully synced ${res.flushedCount} pending roll call(s) to School PC!`);
    } else if (res.remainingCount > 0) {
      showToast(`⚠️ Could not reach School PC. ${res.remainingCount} roll call(s) still in phone queue.`);
    }
  };

  const handleScannedResult = useCallback(
    (rawText) => {
      try {
        let target = rawText.trim();
        let token = '';
        let otp = '';
        if (target.startsWith('http://') || target.startsWith('https://')) {
          const parsed = new URL(target);
          token = parsed.searchParams.get('token') || '';
          otp = parsed.searchParams.get('otp') || '';
          target = `${parsed.protocol}//${parsed.host}`;
        } else if (!target.startsWith('http')) {
          target = `http://${target}`;
        }
        setStoredHubUrl(target);
        if (token) {
          setStoredHubToken(token);
        }
        setHubUrl(target);
        setUrlInput(target);
        showToast(`✓ Scanned & Connected: ${target.replace(/^https?:\/\//, '')}`);
        verifyConnection(target);

        // Auto-pair device if OTP was included in the scanned QR code
        if (otp) {
          pairDeviceWithHub(target, otp).then((pRes) => {
            if (pRes && pRes.ok) {
              setIsDevicePaired(true);
              showToast('✓ Device Registered & Paired with School PC!');
            }
          });
        }

        // Automatically flush pending queue if connected
        flushOfflineQueue(target).then((r) => {
          if (r.flushedCount > 0) {
            showToast(`✓ Synced ${r.flushedCount} pending roll call(s) to School PC!`);
            setOfflineQueue(getOfflineQueue());
          }
        });
      } catch {
        showToast('Scanned code: ' + rawText);
      }
    },
    [verifyConnection]
  );

  const handlePairDevice = async () => {
    if (!otpInput.trim()) {
      setOtpError('Please enter the 6-digit OTP from PC screen');
      return;
    }
    setIsPairing(true);
    setOtpError('');
    const res = await pairDeviceWithHub(hubUrl, otpInput.trim());
    setIsPairing(false);
    if (res.ok) {
      setIsDevicePaired(true);
      setShowOtpModal(false);
      setOtpInput('');
      showToast('✓ Phone successfully paired with School PC!');
    } else {
      setOtpError(res.error || 'Invalid OTP code. Please check your PC screen.');
    }
  };

  // Camera QR Scanner Handler
  useEffect(() => {
    let html5QrCode = null;

    if (showCameraScanner) {
      const timer = setTimeout(() => {
        try {
          html5QrCode = new Html5Qrcode('qr-reader');
          qrScannerRef.current = html5QrCode;

          html5QrCode
            .start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 220, height: 220 } },
              (decodedText) => {
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
              () => {}
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

  const schoolTotalStudents = useMemo(() => {
    return uniqueBatches.reduce((acc, b) => acc + (b.student_count || b.enrolled || 20), 0) || 100;
  }, [uniqueBatches]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        paddingBottom: viewMode === 'rollcall' ? '180px' : '90px',
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
            animation: 'fadeIn 0.2s ease-out',
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
          boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Brand Logo & Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#111d33',
                border: '1px solid #c5a880',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 10px rgba(197, 168, 128, 0.2)',
              }}
            >
              <School size={20} color="#c5a880" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
                {academySettings.academy_name || 'SMS Student System'}
              </div>
              <div style={{ fontSize: '11px', color: '#c5a880', fontWeight: 600 }}>
                Teacher Attendance App
              </div>
            </div>
          </div>

          {/* Right Status / Pairing Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isDevicePaired ? (
              <span
                onClick={() => setShowOtpModal(true)}
                style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Device is permanently paired with School PC"
              >
                <ShieldCheck size={13} color="#10b981" />
                <span>Paired</span>
              </span>
            ) : (
              <button
                onClick={() => setShowOtpModal(true)}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fbbf24',
                  padding: '4px 9px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                }}
                title="Tap to enter 6-digit PC pairing code"
              >
                <Lock size={12} color="#fbbf24" />
                <span>Enter OTP</span>
              </button>
            )}
          </div>
        </div>

        {/* Status Pill in Header */}
        <div
          onClick={() => setShowSettingsModal(true)}
          style={{
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 10px',
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
                ? 'Connected to School PC'
                : connectionStatus.state === 'wifi_disconnected'
                ? 'Phone Wi-Fi Disconnected'
                : 'School PC Not Found / Tap to Scan'}
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
        <main style={{ padding: '16px', maxWidth: '640px', margin: '0 auto' }}>
          {/* OFFLINE PENDING QUEUE BANNER */}
          {offlineQueue && offlineQueue.length > 0 && (
            <div
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #f59e0b',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#d97706" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
                  {offlineQueue.length} offline roll call{offlineQueue.length > 1 ? 's' : ''} stored on phone.
                </span>
              </div>
              <button
                onClick={handleFlushQueue}
                disabled={isFlushingQueue}
                style={{
                  backgroundColor: '#d97706',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {isFlushingQueue ? 'Syncing...' : 'Sync to PC Now'}
              </button>
            </div>
          )}
          {/* STATE 1: Wi-Fi Disconnected Warning Banner */}
          {connectionStatus.state === 'wifi_disconnected' && (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #ef4444',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 4px 15px rgba(239, 68, 68, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#fee2e2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <WifiOff size={22} color="#dc2626" />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#991b1b' }}>
                    Please Connect to Same School Wi-Fi
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px', lineHeight: 1.4 }}>
                    Your phone's Wi-Fi is currently turned off or disconnected. Please turn on Wi-Fi and connect to the school router so attendance can sync directly to the School PC.
                  </div>
                </div>
              </div>
              <button
                onClick={() => verifyConnection(hubUrl)}
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 14px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <RefreshCw size={14} />
                Recheck Wi-Fi Connection
              </button>
            </div>
          )}

          {/* STATE 2: Wi-Fi On, but School PC Not Configured or Unreachable */}
          {connectionStatus.state === 'pc_unreachable' && (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '2px solid #f59e0b',
                borderRadius: '14px',
                padding: '18px',
                marginBottom: '16px',
                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.12)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#fef3c7',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <QrCode size={26} color="#d97706" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#92400e' }}>
                School PC Not Detected
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                Cannot reach School PC at <strong>{hubUrl}</strong>. Open the Teacher App Connect QR code on your PC screen and scan it below.
              </div>

              {/* Large Camera Scan Button */}
              <button
                onClick={() => setShowCameraScanner(true)}
                style={{
                  marginTop: '14px',
                  width: '100%',
                  backgroundColor: '#0a1122',
                  border: '2px solid #c5a880',
                  color: '#c5a880',
                  padding: '12px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(10, 17, 34, 0.2)',
                }}
              >
                <Camera size={18} />
                📷 Open Camera to Scan QR Code
              </button>

              {/* Manual IP input inside the notice */}
              <div style={{ marginTop: '12px', display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="http://192.168.0.104:5173"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    fontSize: '12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={() => {
                    const clean = urlInput.trim();
                    setStoredHubUrl(clean);
                    setHubUrl(clean);
                    verifyConnection(clean);
                  }}
                  style={{
                    backgroundColor: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Connect
                </button>
              </div>
            </div>
          )}

          {/* TOP STUDENT SUMMARY METRICS BAR (Total Students, Present, Absent, Batches) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '16px',
            }}
          >
            {/* Total Students */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #3b82f6',
                borderRadius: '10px',
                padding: '10px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Total Students
              </div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {schoolTotalStudents}
              </div>
            </div>

            {/* Present Today */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #10b981',
                borderRadius: '10px',
                padding: '10px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>
                Present
              </div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {savedSummary ? savedSummary.present : '--'}
              </div>
            </div>

            {/* Absent Today */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #ef4444',
                borderRadius: '10px',
                padding: '10px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>
                Absent
              </div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                {savedSummary ? savedSummary.absent : '--'}
              </div>
            </div>

            {/* Batches / Cohorts */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #8b5cf6',
                borderRadius: '10px',
                padding: '10px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#8b5cf6', textTransform: 'uppercase', fontWeight: 700 }}>
                Batches
              </div>
              <div style={{ fontSize: '19px', fontWeight: 800, color: '#8b5cf6', marginTop: '2px' }}>
                {uniqueBatches.length}
              </div>
            </div>
          </div>

          {/* Section Heading */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                Academic Batches
              </h1>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Select an academic cohort to take student roll call
              </div>
            </div>
            <span
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#0f172a',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              {uniqueBatches.length} Classes
            </span>
          </div>

          {/* Search Cohorts */}
          <div
            style={{
              position: 'relative',
              marginBottom: '14px',
            }}
          >
            <Search
              size={15}
              color="#94a3b8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search batches by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                color: '#0f172a',
                outline: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Batches Cards Grid (Cleanly Deduplicated Canonical 5 Batches) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {uniqueBatches
              .filter(
                (b) =>
                  !searchTerm.trim() ||
                  b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  b.code?.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((batch) => (
                <div
                  key={batch.code || batch.id}
                  onClick={() => openBatchRollCall(batch.id || batch.code)}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          backgroundColor: '#0a1122',
                          color: '#ffffff',
                          padding: '2px 7px',
                          borderRadius: '5px',
                          fontSize: '11px',
                          fontWeight: 800,
                          fontFamily: 'monospace',
                        }}
                      >
                        {batch.code || batch.id}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <MapPin size={11} color="#64748b" />
                        {batch.classroom || 'Room 101'}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#0369a1',
                          backgroundColor: '#e0f2fe',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      >
                        {batch.student_count !== undefined ? `${batch.student_count} Students` : 'Batch Class'}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#0f172a',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {batch.name}
                    </div>

                    <div
                      style={{
                        fontSize: '12px',
                        color: '#64748b',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Clock size={12} color="#94a3b8" />
                      <span>{batch.timing || '08:00 AM – 10:30 AM'}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#c5a880',
                      fontSize: '12px',
                      fontWeight: 700,
                      paddingLeft: '12px',
                    }}
                  >
                    <span>Take Roll Call</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              ))}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 2: STUDENT ROLL CALL SCREEN (MOBILE-FRIENDLY 2-TIER CARDS)         */}
      {/* ========================================================================= */}
      {viewMode === 'rollcall' && (
        <main style={{ padding: '16px 16px 120px 16px', maxWidth: '640px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
          {/* Header: Back Navigation + Date Selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
            }}
          >
            <button
              onClick={() => setViewMode('batches')}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}
            >
              <ArrowLeft size={16} />
              <span>← Batches</span>
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleDateChange(e.target.value)}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                padding: '6px 10px',
                fontSize: '12px',
                fontWeight: 600,
                outline: 'none',
              }}
            />
          </div>

          {/* Active Class Title */}
          <div style={{ marginBottom: '12px' }}>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              {activeBatch.name}
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
              {activeBatch.timing || 'Daily Roll Call'} • {activeBatch.classroom || 'Room 101'}
            </div>
          </div>

          {/* 4 Metric Cards Styled Identical to Desktop .exe */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '12px',
            }}
          >
            {/* Enrolled */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #3b82f6',
                borderRadius: '10px',
                padding: '8px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>
                Enrolled
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {totalCount}
              </div>
            </div>

            {/* Present */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #10b981',
                borderRadius: '10px',
                padding: '8px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#10b981', textTransform: 'uppercase', fontWeight: 700 }}>
                Present
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                {presentCount}
              </div>
            </div>

            {/* Late */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #f59e0b',
                borderRadius: '10px',
                padding: '8px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#f59e0b', textTransform: 'uppercase', fontWeight: 700 }}>
                Late
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
                {lateCount}
              </div>
            </div>

            {/* Absent */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #ef4444',
                borderRadius: '10px',
                padding: '8px 4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#ef4444', textTransform: 'uppercase', fontWeight: 700 }}>
                Absent
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ef4444', marginTop: '2px' }}>
                {absentCount}
              </div>
            </div>
          </div>

          {/* Quick Mark Shortcuts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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
              <CheckCheck size={14} />
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
              <XCircle size={14} />
              Mark All Absent
            </button>
          </div>

          {/* Student Search */}
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search student name or roll no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                fontSize: '12px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ========================================================================= */}
          {/* MOBILE-FIRST 2-TIER STUDENT CARDS: 100% FULL NAME READABILITY           */}
          {/* ========================================================================= */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredStudents.map((student) => {
              const status = attendanceMap[student.id] || 'Present';
              const isPresent = status === 'Present';
              const isLate = status === 'Late';
              const isAbsent = status === 'Absent';

              return (
                <div
                  key={student.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {/* TIER 1: Student Details with FULL NAME VISIBILITY (NO TRUNCATION) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      {/* Roll Number Badge */}
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          backgroundColor: '#0a1122',
                          color: '#c5a880',
                          fontSize: '13px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                        }}
                      >
                        {student.roll_no}
                      </div>

                      {/* Full Name & Admission No */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontSize: '15px',
                            fontWeight: 800,
                            color: '#0f172a',
                            lineHeight: 1.25,
                            wordBreak: 'break-word',
                          }}
                        >
                          {student.full_name || student.name || student['Student Name'] || `Student ${student.roll_no || student.admission_no}`}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            marginTop: '2px',
                            fontWeight: 600,
                          }}
                        >
                          ID: {student.admission_no}
                        </div>
                      </div>
                    </div>

                    {/* Status Pill Badge */}
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 800,
                        backgroundColor: isPresent ? '#dcfce7' : isLate ? '#fef3c7' : '#fee2e2',
                        color: isPresent ? '#15803d' : isLate ? '#b45309' : '#b91c1c',
                        border: `1px solid ${isPresent ? '#86efac' : isLate ? '#fde68a' : '#fca5a5'}`,
                        flexShrink: 0,
                      }}
                    >
                      {status}
                    </span>
                  </div>

                  {/* TIER 2: Full-Width 3-Button Segmented Selector for Thumb Comfort */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '6px',
                      backgroundColor: '#f1f5f9',
                      padding: '4px',
                      borderRadius: '10px',
                    }}
                  >
                    {/* Present Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Present')}
                      style={{
                        backgroundColor: isPresent ? '#10b981' : 'transparent',
                        color: isPresent ? '#ffffff' : '#475569',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        boxShadow: isPresent ? '0 2px 5px rgba(16, 185, 129, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Check size={15} strokeWidth={isPresent ? 3 : 2} />
                      <span>Present</span>
                    </button>

                    {/* Late Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Late')}
                      style={{
                        backgroundColor: isLate ? '#f59e0b' : 'transparent',
                        color: isLate ? '#ffffff' : '#475569',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        boxShadow: isLate ? '0 2px 5px rgba(245, 158, 11, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Clock size={15} strokeWidth={isLate ? 3 : 2} />
                      <span>Late</span>
                    </button>

                    {/* Absent Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Absent')}
                      style={{
                        backgroundColor: isAbsent ? '#ef4444' : 'transparent',
                        color: isAbsent ? '#ffffff' : '#475569',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px',
                        boxShadow: isAbsent ? '0 2px 5px rgba(239, 68, 68, 0.3)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <X size={15} strokeWidth={isAbsent ? 3 : 2} />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom "DONE — Save to School PC" Action Bar (Positioned above Bottom Nav) */}
          <div
            style={{
              position: 'fixed',
              bottom: '64px',
              left: 0,
              right: 0,
              backgroundColor: '#ffffff',
              borderTop: '1px solid #cbd5e1',
              padding: '10px 16px',
              zIndex: 40,
              boxShadow: '0 -4px 15px rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || students.length === 0}
                style={{
                  width: '100%',
                  backgroundColor: '#0a1122',
                  border: '2px solid #c5a880',
                  color: '#ffffff',
                  padding: '13px 18px',
                  borderRadius: '10px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(10, 17, 34, 0.25)',
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Saving to School PC...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#10b981" />
                    <span>
                      ✓ DONE — Save to School PC ({presentCount} Present, {lateCount} Late, {absentCount} Absent)
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* Camera QR Scanner Modal */}
      {showCameraScanner && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0a1122',
              borderRadius: '16px',
              border: '2px solid #c5a880',
              padding: '18px',
              width: '100%',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                📷 Scan School PC QR Code
              </div>
              <button
                onClick={() => setShowCameraScanner(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#cbd5e1',
                  cursor: 'pointer',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Video Mount Container */}
            <div
              id="qr-reader"
              style={{
                width: '100%',
                minHeight: '260px',
                borderRadius: '12px',
                overflow: 'hidden',
                backgroundColor: '#000000',
              }}
            />

            {cameraError && (
              <div
                style={{
                  marginTop: '10px',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid #ef4444',
                  color: '#f87171',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  textAlign: 'left',
                }}
              >
                {cameraError}
              </div>
            )}

            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px' }}>
              Point camera at the QR code displayed in the School PC Desktop App
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && savedSummary && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.7)',
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
              width: '100%',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                border: '2px solid #10b981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              <CheckCircle2 size={32} color="#10b981" />
            </div>

            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
              Saved to School PC!
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              Roll call has been synchronized with the desktop application in real-time.
            </div>

            {/* Summary Breakdown */}
            <div
              style={{
                marginTop: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Total</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {savedSummary.total}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#10b981', fontWeight: 700 }}>Present</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>
                  {savedSummary.present}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 700 }}>Late</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f59e0b' }}>
                  {savedSummary.late}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 700 }}>Absent</div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#ef4444' }}>
                  {savedSummary.absent}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowSuccessModal(false);
                setViewMode('batches');
                loadBatches(hubUrl);
              }}
              style={{
                marginTop: '18px',
                width: '100%',
                backgroundColor: '#0a1122',
                border: 'none',
                color: '#ffffff',
                padding: '12px',
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Back to Batches
            </button>
          </div>
        </div>
      )}

      {/* Settings / Manual IP Modal */}
      {showSettingsModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.7)',
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
              padding: '20px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Connect to School PC
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: 1.4 }}>
              Enter the local Wi-Fi address of the School PC. Both devices must be on the same School Wi-Fi network.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                SCHOOL PC WI-FI URL:
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://192.168.0.104:5173"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: '13px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => {
                  setUrlInput(DEFAULT_SCHOOL_PC_URL);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#c5a880',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                  marginTop: '6px',
                }}
              >
                ↺ Reset to Default (192.168.0.104:5173)
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  color: '#475569',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const clean = urlInput.trim();
                  setStoredHubUrl(clean);
                  setHubUrl(clean);
                  setShowSettingsModal(false);
                  verifyConnection(clean);
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#0a1122',
                  border: 'none',
                  color: '#ffffff',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '12px',
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

      {/* One-Time Device OTP Pairing Modal */}
      {showOtpModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0,0,0,0.75)',
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
              padding: '22px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldCheck size={22} color="#10b981" />
                <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Device Pairing & OTP
                </span>
              </div>
              <button
                onClick={() => {
                  setShowOtpModal(false);
                  setOtpError('');
                }}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: 1.4 }}>
              Enter the <strong>6-digit OTP code</strong> displayed on your School PC screen to securely authorize this phone. Once verified, this phone is registered permanently.
            </div>

            {isDevicePaired && (
              <div
                style={{
                  backgroundColor: '#dcfce7',
                  border: '1px solid #86efac',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                <CheckCircle2 size={20} color="#15803d" />
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#15803d' }}>
                    Phone Is Registered & Paired
                  </div>
                  <div style={{ fontSize: '11px', color: '#166534', marginTop: '2px' }}>
                    This device is authorized to sync attendance with the School PC.
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                6-DIGIT PC PAIRING CODE:
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpInput}
                onChange={(e) => {
                  setOtpInput(e.target.value.replace(/\D/g, ''));
                  setOtpError('');
                }}
                placeholder="e.g. 729415"
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '22px',
                  fontWeight: 800,
                  letterSpacing: '8px',
                  textAlign: 'center',
                  borderRadius: '10px',
                  border: otpError ? '2px solid #ef4444' : '2px solid #cbd5e1',
                  outline: 'none',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              {otpError && (
                <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '6px', fontWeight: 600 }}>
                  {otpError}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowOtpModal(false);
                  setOtpError('');
                }}
                style={{
                  flex: 1,
                  backgroundColor: '#f1f5f9',
                  border: 'none',
                  color: '#475569',
                  padding: '11px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
              <button
                onClick={handlePairDevice}
                disabled={isPairing || otpInput.trim().length !== 6}
                style={{
                  flex: 1,
                  backgroundColor: isPairing || otpInput.trim().length !== 6 ? '#94a3b8' : '#0a1122',
                  border: '1px solid #c5a880',
                  color: '#ffffff',
                  padding: '11px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isPairing || otpInput.trim().length !== 6 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                {isPairing ? <RefreshCw size={14} className="animate-spin" /> : <ShieldCheck size={16} color="#c5a880" />}
                Pair This Phone
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODERN FIXED MOBILE BOTTOM NAVIGATION BAR                                 */}
      {/* ========================================================================= */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          backgroundColor: '#0a1122',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* 1. Batches Cohorts */}
        <button
          onClick={() => setViewMode('batches')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: viewMode === 'batches' ? '#c5a880' : '#94a3b8',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <School size={20} color={viewMode === 'batches' ? '#c5a880' : '#94a3b8'} />
          <span style={{ fontSize: '10px', fontWeight: viewMode === 'batches' ? 800 : 500 }}>Batches</span>
        </button>

        {/* 2. Camera QR Scanner */}
        <button
          onClick={() => setShowCameraScanner(true)}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <Camera size={20} color="#94a3b8" />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Scan QR</span>
        </button>

        {/* 3. Sync PC */}
        <button
          onClick={() => {
            verifyConnection(hubUrl);
            if (offlineQueue.length > 0) handleFlushQueue();
          }}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <RefreshCw size={20} color="#94a3b8" className={isLoading || isFlushingQueue ? 'animate-spin' : ''} />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Sync PC</span>
        </button>

        {/* 4. Pairing & OTP */}
        <button
          onClick={() => setShowOtpModal(true)}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: isDevicePaired ? '#10b981' : '#f59e0b',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          {isDevicePaired ? (
            <ShieldCheck size={20} color="#10b981" />
          ) : (
            <Lock size={20} color="#f59e0b" />
          )}
          <span style={{ fontSize: '10px', fontWeight: 700 }}>
            {isDevicePaired ? 'Paired' : 'Pair OTP'}
          </span>
        </button>

        {/* 5. Settings */}
        <button
          onClick={() => setShowSettingsModal(true)}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <Settings size={20} color="#94a3b8" />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Settings</span>
        </button>
      </nav>
    </div>
  );
}
