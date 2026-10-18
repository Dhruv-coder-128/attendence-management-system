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
  AlertTriangle,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { App } from '@capacitor/app';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  getStoredHubToken,
  setStoredHubToken,
  checkHubConnection,
  autoDiscoverSchoolPC,
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

const DAILY_METRICS_KEY_PREFIX = 'sms_daily_metrics_v2_';
const BATCH_ATTENDANCE_STATUS_KEY_PREFIX = 'sms_batch_status_v2_';

function getStoredDailyMetrics(date) {
  if (typeof window === 'undefined') return { total: 0, present: 0, absent: 0, late: 0, marked: false };
  try {
    const raw = localStorage.getItem(DAILY_METRICS_KEY_PREFIX + (date || new Date().toISOString().split('T')[0]));
    if (raw) return JSON.parse(raw);
  } catch {}
  return { total: 0, present: 0, absent: 0, late: 0, marked: false };
}

function setStoredDailyMetrics(date, metrics) {
  if (typeof window === 'undefined' || !metrics) return;
  try {
    localStorage.setItem(DAILY_METRICS_KEY_PREFIX + (date || new Date().toISOString().split('T')[0]), JSON.stringify(metrics));
  } catch {}
}

function getStoredBatchStatuses(date) {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(BATCH_ATTENDANCE_STATUS_KEY_PREFIX + (date || new Date().toISOString().split('T')[0]));
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function setStoredBatchStatuses(date, statuses) {
  if (typeof window === 'undefined' || !statuses) return;
  try {
    localStorage.setItem(BATCH_ATTENDANCE_STATUS_KEY_PREFIX + (date || new Date().toISOString().split('T')[0]), JSON.stringify(statuses));
  } catch {}
}

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  const [isDevicePaired] = useState(true);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);

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

  // Persistent Daily Metrics across RAM Kills
  const [dailyMetrics, setDailyMetrics] = useState(() => getStoredDailyMetrics(new Date().toISOString().split('T')[0]));
  const [batchStatuses, setBatchStatuses] = useState(() => getStoredBatchStatuses(new Date().toISOString().split('T')[0]));

  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Professional Glass Toast Notification
  const [toast, setToast] = useState(null); // { id, message, type: 'success' | 'warning' | 'error' | 'info' }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message: msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const [offlineQueue, setOfflineQueue] = useState(() => getOfflineQueue());
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);

  const qrScannerRef = useRef(null);

  // =========================================================================
  // ANDROID HARDWARE / GESTURE BACK BUTTON INTERCEPTION (100% RELIABLE)
  // =========================================================================
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const showCameraScannerRef = useRef(showCameraScanner);
  showCameraScannerRef.current = showCameraScanner;
  const showSettingsModalRef = useRef(showSettingsModal);
  showSettingsModalRef.current = showSettingsModal;
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
      // 3. Close success modal
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

  // Refresh authoritative daily metrics across all batches from PC Hub
  const refreshHubMetrics = useCallback(async (targetUrl = hubUrl, date = selectedDate) => {
    const activeUrl = targetUrl || getStoredHubUrl();
    if (!activeUrl) return;
    try {
      const res = await fetch(`${activeUrl.replace(/\/+$/, '')}/api/local-hub?action=updates&date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const data = await res.json();
        const records = data.records || data.allRecords || [];
        if (Array.isArray(records) && records.length > 0) {
          const batchMap = {};
          let totalPresent = 0;
          let totalAbsent = 0;
          let totalLate = 0;

          records.forEach((r) => {
            const bId = (r.batch_id || '').toUpperCase();
            const status = r.status || 'Present';
            if (bId) {
              if (!batchMap[bId]) {
                batchMap[bId] = { present: 0, absent: 0, late: 0, total: 0, taken: true };
              }
              batchMap[bId].total += 1;
              if (status === 'Present') {
                batchMap[bId].present += 1;
                totalPresent += 1;
              } else if (status === 'Late') {
                batchMap[bId].late += 1;
                totalLate += 1;
              } else {
                batchMap[bId].absent += 1;
                totalAbsent += 1;
              }
            }
          });

          const newMetrics = {
            total: records.length,
            present: totalPresent,
            absent: totalAbsent,
            late: totalLate,
            marked: true,
          };

          setDailyMetrics(newMetrics);
          setStoredDailyMetrics(date, newMetrics);
          setBatchStatuses((prev) => {
            const updated = { ...prev, ...batchMap };
            setStoredBatchStatuses(date, updated);
            return updated;
          });
        }
      }
    } catch {}
  }, [hubUrl, selectedDate]);

  // 2. Verify Connection with Smart Auto-Discovery
  const verifyConnection = useCallback(async (targetUrl = hubUrl, tryAutoScan = true) => {
    let res = await checkHubConnection(targetUrl);

    // If not reachable and auto-scan allowed, automatically probe the local Wi-Fi subnet
    if (!res?.ok && tryAutoScan) {
      setIsAutoDiscovering(true);
      const disc = await autoDiscoverSchoolPC();
      setIsAutoDiscovering(false);
      if (disc?.ok && disc?.url) {
        setStoredHubUrl(disc.url);
        setHubUrl(disc.url);
        setUrlInput(disc.url);
        res = await checkHubConnection(disc.url);
        showToast('✓ Auto-connected to School PC on Wi-Fi!');
      }
    }

    setConnectionStatus(res);
    const activeUrl = res?.ok ? res.url : (targetUrl || hubUrl);
    loadBatches(activeUrl);
    if (res?.ok) {
      refreshHubMetrics(activeUrl, selectedDate);
      flushOfflineQueue(activeUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    }
  }, [hubUrl, loadBatches, refreshHubMetrics, selectedDate]);

  useEffect(() => {
    verifyConnection(hubUrl, true);
  }, [hubUrl, verifyConnection]);

  // One-tap manual trigger for local Wi-Fi auto-discovery
  const handleTriggerAutoDiscovery = async () => {
    setIsAutoDiscovering(true);
    showToast('🔍 Scanning local Wi-Fi for School PC...');
    const disc = await autoDiscoverSchoolPC();
    setIsAutoDiscovering(false);
    if (disc?.ok && disc?.url) {
      setStoredHubUrl(disc.url);
      setHubUrl(disc.url);
      setUrlInput(disc.url);
      verifyConnection(disc.url, false);
      showToast('✓ Connected to School PC: ' + disc.url.replace(/^https?:\/\//, ''));
    } else {
      showToast('⚠️ Could not auto-detect. Please scan PC QR code or enter IP.');
    }
  };

  // Continuous background refresh of cohorts while connected so PC changes show on Phone
  useEffect(() => {
    if (!connectionStatus.ok || viewMode !== 'batches') return;
    const interval = setInterval(() => {
      loadBatches(hubUrl);
      refreshHubMetrics(hubUrl, selectedDate);
    }, 4000);
    return () => clearInterval(interval);
  }, [connectionStatus.ok, viewMode, hubUrl, loadBatches, refreshHubMetrics, selectedDate]);

  // Live real-time reactivity in roll call mode: pick up any PC changes (PC marked student or changed status)
  useEffect(() => {
    if (!connectionStatus.ok || viewMode !== 'rollcall' || !selectedBatchId) return;
    const interval = setInterval(async () => {
      try {
        const existingRecords = await fetchExistingAttendanceFromHub(selectedBatchId, selectedDate, hubUrl);
        if (Array.isArray(existingRecords) && existingRecords.length > 0) {
          setAttendanceMap((prev) => {
            let changed = false;
            const next = { ...prev };
            existingRecords.forEach((r) => {
              const idKey = r.student_id || r.admission_no;
              if (idKey && r.status && next[idKey] !== r.status) {
                next[idKey] = r.status;
                changed = true;
              }
            });
            return changed ? next : prev;
          });
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [connectionStatus.ok, viewMode, selectedBatchId, selectedDate, hubUrl]);

  // Recheck when phone reconnects to network
  useEffect(() => {
    const handleNetworkChange = () => verifyConnection(hubUrl, false);
    window.addEventListener('online', handleNetworkChange);
    return () => {
      window.removeEventListener('online', handleNetworkChange);
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

    // Authoritatively update batch status and daily metrics immediately
    const bKey = (activeBatch.code || selectedBatchId || '').toUpperCase();
    const newBatchInfo = {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      total: totalCount,
      taken: true,
    };

    setBatchStatuses((prev) => {
      const next = { ...prev, [bKey]: newBatchInfo };
      setStoredBatchStatuses(selectedDate, next);
      return next;
    });

    setDailyMetrics((prev) => {
      const currentMap = { ...batchStatuses, [bKey]: newBatchInfo };
      let sumTotal = 0;
      let sumPresent = 0;
      let sumAbsent = 0;
      let sumLate = 0;
      Object.values(currentMap).forEach((st) => {
        sumTotal += st.total || 0;
        sumPresent += st.present || 0;
        sumAbsent += st.absent || 0;
        sumLate += st.late || 0;
      });
      const next = {
        total: sumTotal,
        present: sumPresent,
        absent: sumAbsent,
        late: sumLate,
        marked: true,
      };
      setStoredDailyMetrics(selectedDate, next);
      return next;
    });

    setSavedSummary({
      batchName: activeBatch.name || 'Current Class',
      date: selectedDate,
      total: totalCount,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
    });

    if (res.ok) {
      setShowSuccessModal(true);
      showToast(`✓ Saved to School PC (${presentCount} Present · ${absentCount} Absent)`);
      setOfflineQueue(getOfflineQueue());
      flushOfflineQueue(hubUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    } else if (res.queued) {
      setShowSuccessModal(true);
      setOfflineQueue(getOfflineQueue());
      showToast('✓ Saved to phone storage (will auto-sync when School Wi-Fi connects).', 'warning');
    } else {
      showToast('⚠️ Could not save attendance: ' + (res.error || 'Connection failed'), 'error');
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
        if (target.startsWith('http://') || target.startsWith('https://')) {
          const parsed = new URL(target);
          token = parsed.searchParams.get('token') || '';
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
        verifyConnection(target, false);

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
        backgroundColor: '#070c18',
        backgroundImage: `
          radial-gradient(circle at 12% 8%, rgba(59, 130, 246, 0.14) 0%, transparent 45%),
          radial-gradient(circle at 88% 22%, rgba(197, 168, 128, 0.10) 0%, transparent 45%),
          radial-gradient(circle at 50% 85%, rgba(16, 185, 129, 0.08) 0%, transparent 50%)
        `,
        color: '#f8fafc',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        paddingBottom: viewMode === 'rollcall' ? '180px' : '90px',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <style>{`
        @keyframes slideDownToast {
          0% { opacity: 0; transform: translateY(-18px) scale(0.95); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.55; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .liquid-card {
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
        }
        .liquid-card:active {
          transform: scale(0.985);
        }
        .touch-action-btn {
          transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), filter 0.15s ease;
        }
        .touch-action-btn:active {
          transform: scale(0.95);
        }
      `}</style>

      {/* Artisanal Liquid Glass Floating Toast Capsule */}
      {toast && (
        <div
          key={toast.id}
          style={{
            position: 'fixed',
            top: '18px',
            left: '16px',
            right: '16px',
            zIndex: 99999,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            animation: 'slideDownToast 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            style={{
              maxWidth: '460px',
              width: '100%',
              backgroundColor: 'rgba(10, 17, 34, 0.88)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${
                toast.type === 'error'
                  ? 'rgba(239, 68, 68, 0.55)'
                  : toast.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.55)'
                  : 'rgba(16, 185, 129, 0.55)'
              }`,
              boxShadow: `0 16px 36px rgba(0, 0, 0, 0.55), 0 0 20px ${
                toast.type === 'error'
                  ? 'rgba(239, 68, 68, 0.25)'
                  : toast.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.25)'
                  : 'rgba(16, 185, 129, 0.25)'
              }`,
              borderRadius: '16px',
              padding: '12px 18px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor:
                  toast.type === 'error'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : toast.type === 'warning'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(16, 185, 129, 0.2)',
              }}
            >
              {toast.type === 'error' ? (
                <XCircle size={18} color="#f87171" />
              ) : toast.type === 'warning' ? (
                <AlertTriangle size={18} color="#fbbf24" />
              ) : (
                <CheckCircle2 size={18} color="#34d399" />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: '#f1f5f9' }}>
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Artisanal Frosted Glass Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: 'rgba(10, 17, 34, 0.82)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Brand Logo & Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                backgroundColor: 'rgba(197, 168, 128, 0.12)',
                border: '1px solid rgba(197, 168, 128, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 16px rgba(197, 168, 128, 0.25)',
              }}
            >
              <School size={20} color="#c5a880" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
                {academySettings.academy_name || 'SMS Student System'}
              </div>
              <div style={{ fontSize: '11px', color: '#c5a880', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} color="#c5a880" />
                <span>Teacher Roll Call Hub</span>
              </div>
            </div>
          </div>

          {/* Right Status / Wi-Fi Indicator Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                backgroundColor: connectionStatus.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(245, 158, 11, 0.16)',
                border: `1px solid ${connectionStatus.ok ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                color: connectionStatus.ok ? '#34d399' : '#fbbf24',
                padding: '6px 10px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                backdropFilter: 'blur(8px)',
              }}
              title={connectionStatus.ok ? 'Connected to School PC' : 'Tap to configure School PC connection'}
            >
              <ShieldCheck size={14} color={connectionStatus.ok ? '#34d399' : '#fbbf24'} />
              <span>{connectionStatus.ok ? 'PC Hub Synced' : 'Connect PC'}</span>
            </button>
          </div>
        </div>

        {/* Live Subnet & Hub Status Pill */}
        <div
          onClick={() => setShowSettingsModal(true)}
          style={{
            marginTop: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            borderRadius: '10px',
            backgroundColor: connectionStatus.ok ? 'rgba(16, 185, 129, 0.10)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${connectionStatus.ok ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.3)'}`,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: connectionStatus.ok ? '#10b981' : '#ef4444',
                boxShadow: connectionStatus.ok ? '0 0 10px #10b981' : '0 0 10px #ef4444',
                animation: 'pulseGlow 2s infinite ease-in-out',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: connectionStatus.ok ? '#6ee7b7' : '#fca5a5',
              }}
            >
              {connectionStatus.ok
                ? 'School PC Connected & Active'
                : connectionStatus.state === 'wifi_disconnected'
                ? 'Phone Wi-Fi Disconnected'
                : 'School PC Not Found / Tap to Scan'}
            </span>
          </div>
          <span style={{ fontSize: '10px', color: '#94a3b8', fontFamily: 'monospace', opacity: 0.85 }}>
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
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#fbbf24" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#fef3c7' }}>
                  {offlineQueue.length} offline roll call{offlineQueue.length > 1 ? 's' : ''} saved locally.
                </span>
              </div>
              <button
                onClick={handleFlushQueue}
                disabled={isFlushingQueue}
                className="touch-action-btn"
                style={{
                  backgroundColor: '#d97706',
                  color: '#ffffff',
                  border: 'none',
                  padding: '7px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(217, 119, 6, 0.4)',
                }}
              >
                {isFlushingQueue ? 'Syncing...' : 'Sync to PC'}
              </button>
            </div>
          )}

          {/* STATE 1: Wi-Fi Disconnected Warning Banner */}
          {connectionStatus.state === 'wifi_disconnected' && (
            <div
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 12px 28px rgba(239, 68, 68, 0.15)',
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
                    borderRadius: '12px',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <WifiOff size={22} color="#f87171" />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#fee2e2' }}>
                    Connect to School Wi-Fi Network
                  </div>
                  <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '3px', lineHeight: 1.4 }}>
                    Your phone Wi-Fi is currently off or disconnected. Please join the same school Wi-Fi network as your School PC to sync roll calls instantly.
                  </div>
                </div>
              </div>
              <button
                onClick={() => verifyConnection(hubUrl)}
                className="touch-action-btn"
                style={{
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(220, 38, 38, 0.35)',
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
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '18px',
                padding: '18px',
                marginBottom: '16px',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.45)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  backgroundColor: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <QrCode size={26} color="#fbbf24" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#fef3c7' }}>
                School PC Hub Not Detected
              </div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.5 }}>
                Cannot reach School PC at <span style={{ color: '#c5a880', fontFamily: 'monospace' }}>{hubUrl}</span>. Auto-detect below or scan the QR code displayed on your PC screen.
              </div>

              {/* Primary: Smart Wi-Fi Auto-Discovery Button */}
              <button
                onClick={handleTriggerAutoDiscovery}
                disabled={isAutoDiscovering}
                className="touch-action-btn"
                style={{
                  marginTop: '14px',
                  width: '100%',
                  backgroundColor: '#059669',
                  backgroundImage: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '13px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isAutoDiscovering ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
                }}
              >
                {isAutoDiscovering ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" />
                    <span>Probing Local Wi-Fi Subnet...</span>
                  </>
                ) : (
                  <>
                    <Search size={18} />
                    <span>Auto-Detect School PC on Wi-Fi</span>
                  </>
                )}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '12px 0' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>OR SCAN QR CODE</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              </div>

              {/* Large Camera Scan Button */}
              <button
                onClick={() => setShowCameraScanner(true)}
                className="touch-action-btn"
                style={{
                  width: '100%',
                  backgroundColor: 'rgba(10, 17, 34, 0.85)',
                  border: '1px solid rgba(197, 168, 128, 0.4)',
                  color: '#c5a880',
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.35)',
                }}
              >
                <Camera size={18} color="#c5a880" />
                <span>Scan School PC QR Code</span>
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
                    padding: '9px 12px',
                    fontSize: '12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(2, 6, 23, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
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
                  className="touch-action-btn"
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    padding: '9px 14px',
                    borderRadius: '10px',
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

          {/* TOP STUDENT SUMMARY METRICS BAR (Persistent across RAM wipes!) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '18px',
            }}
          >
            {/* Total Students */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #3b82f6',
                borderRadius: '14px',
                padding: '10px 4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>
                Enrolled
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {schoolTotalStudents}
              </div>
            </div>

            {/* Present Today (Persistent across RAM kill - Never shows '--') */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #10b981',
                borderRadius: '14px',
                padding: '10px 4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>
                Present
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                {dailyMetrics?.marked ? dailyMetrics.present : (savedSummary?.present ?? 0)}
              </div>
            </div>

            {/* Absent Today (Persistent across RAM kill - Never shows '--') */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #ef4444',
                borderRadius: '14px',
                padding: '10px 4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#f87171', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>
                Absent
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                {dailyMetrics?.marked ? dailyMetrics.absent : (savedSummary?.absent ?? 0)}
              </div>
            </div>

            {/* Batches / Cohorts */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #a855f7',
                borderRadius: '14px',
                padding: '10px 4px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#c084fc', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px' }}>
                Batches
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#c084fc', marginTop: '2px' }}>
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
              marginBottom: '14px',
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
                Academic Batches
              </h1>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                Select a class cohort to record student attendance
              </div>
            </div>
            <span
              style={{
                backgroundColor: 'rgba(197, 168, 128, 0.12)',
                border: '1px solid rgba(197, 168, 128, 0.35)',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#c5a880',
                backdropFilter: 'blur(8px)',
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
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search batches by name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px 10px 38px',
                fontSize: '13px',
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                color: '#ffffff',
                outline: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Batches Cards Grid (Artisanal Liquid Glass Cards) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {uniqueBatches
              .filter(
                (b) =>
                  !searchTerm.trim() ||
                  b.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  b.code?.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map((batch) => {
                const bKey = (batch.code || batch.id || '').toUpperCase();
                const bStatus = batchStatuses[bKey];
                const isMarkedToday = bStatus && bStatus.taken;

                return (
                  <div
                    key={batch.code || batch.id}
                    onClick={() => openBatchRollCall(batch.id || batch.code)}
                    className="liquid-card"
                    style={{
                      backgroundColor: 'rgba(15, 23, 42, 0.72)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      borderRadius: '16px',
                      padding: '16px',
                      border: isMarkedToday
                        ? '1px solid rgba(16, 185, 129, 0.35)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            backgroundColor: 'rgba(197, 168, 128, 0.15)',
                            border: '1px solid rgba(197, 168, 128, 0.4)',
                            color: '#c5a880',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                          }}
                        >
                          {batch.code || batch.id}
                        </span>

                        {/* Live Roll Call Status Pill */}
                        {isMarkedToday ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#34d399',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.35)',
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Check size={11} strokeWidth={3} />
                            <span>{bStatus.present} Present · {bStatus.absent} Absent</span>
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#fbbf24',
                              backgroundColor: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Clock size={11} />
                            <span>Pending Today</span>
                          </span>
                        )}

                        <span
                          style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                          }}
                        >
                          <MapPin size={11} color="#64748b" />
                          {batch.classroom || 'Room 101'}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: '16px',
                          fontWeight: 800,
                          color: '#ffffff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          letterSpacing: '-0.2px',
                        }}
                      >
                        {batch.name}
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          color: '#94a3b8',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Clock size={12} color="#64748b" />
                        <span>{batch.timing || '08:00 AM – 10:30 AM'}</span>
                        <span style={{ color: '#475569' }}>•</span>
                        <span style={{ color: '#60a5fa' }}>
                          {batch.student_count !== undefined ? `${batch.student_count} Students` : 'Enrolled'}
                        </span>
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
                        flexShrink: 0,
                      }}
                    >
                      <span>{isMarkedToday ? 'Edit' : 'Roll Call'}</span>
                      <ChevronRight size={16} />
                    </div>
                  </div>
                );
              })}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 2: STUDENT ROLL CALL SCREEN (MOBILE-FRIENDLY 2-TIER CARDS)         */}
      {/* ========================================================================= */}
      {viewMode === 'rollcall' && (
        <main style={{ padding: '16px 16px 130px 16px', maxWidth: '640px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
          {/* Header: Back Navigation + Date Selector */}
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
              className="touch-action-btn"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ffffff',
                padding: '9px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              }}
            >
              <ArrowLeft size={16} color="#c5a880" />
              <span>← Batches</span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '12px',
                padding: '4px 10px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
              }}
            >
              <Calendar size={14} color="#c5a880" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 700,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          </div>

          {/* Active Class Title & Chips */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  backgroundColor: 'rgba(197, 168, 128, 0.15)',
                  border: '1px solid rgba(197, 168, 128, 0.4)',
                  color: '#c5a880',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                }}
              >
                {activeBatch.code || selectedBatchId}
              </span>
              <span
                style={{
                  fontSize: '11px',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <MapPin size={11} color="#64748b" />
                {activeBatch.classroom || 'Room 101'}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
              {activeBatch.name}
            </h2>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {activeBatch.timing || 'Daily Roll Call Session'}
            </div>
          </div>

          {/* 4 Roll Call Metric Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '8px',
              marginBottom: '14px',
            }}
          >
            {/* Enrolled */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #3b82f6',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
                Enrolled
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                {totalCount}
              </div>
            </div>

            {/* Present */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #10b981',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>
                Present
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                {presentCount}
              </div>
            </div>

            {/* Late */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #f59e0b',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#fbbf24', textTransform: 'uppercase', fontWeight: 700 }}>
                Late
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
                {lateCount}
              </div>
            </div>

            {/* Absent */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderTop: '2px solid #ef4444',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 6px 18px rgba(0,0,0,0.2)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#f87171', textTransform: 'uppercase', fontWeight: 700 }}>
                Absent
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
                {absentCount}
              </div>
            </div>
          </div>

          {/* Quick Mark Shortcuts */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              onClick={markAllPresent}
              className="touch-action-btn"
              style={{
                flex: 1,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)',
              }}
            >
              <CheckCheck size={14} color="#34d399" />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={markAllAbsent}
              className="touch-action-btn"
              style={{
                flex: 1,
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#f87171',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
              }}
            >
              <XCircle size={14} color="#f87171" />
              <span>Mark All Absent</span>
            </button>
          </div>

          {/* Student Search */}
          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <Search
              size={14}
              color="#94a3b8"
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search student name or roll number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 36px',
                fontSize: '12px',
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                color: '#ffffff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* MOBILE-FIRST 2-TIER STUDENT CARDS: 100% FULL NAME READABILITY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredStudents.map((student) => {
              const status = attendanceMap[student.id] || 'Present';
              const isPresent = status === 'Present';
              const isLate = status === 'Late';
              const isAbsent = status === 'Absent';

              return (
                <div
                  key={student.id}
                  className="liquid-card"
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.72)',
                    backdropFilter: 'blur(18px)',
                    WebkitBackdropFilter: 'blur(18px)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px',
                    padding: '14px',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {/* TIER 1: Student Details with FULL NAME VISIBILITY (NO TRUNCATION) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      {/* Roll Number Badge */}
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          backgroundColor: 'rgba(197, 168, 128, 0.15)',
                          border: '1px solid rgba(197, 168, 128, 0.35)',
                          color: '#c5a880',
                          fontSize: '14px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
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
                            color: '#ffffff',
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                          }}
                        >
                          {student.full_name || student.name || student['Student Name'] || `Student ${student.roll_no || student.admission_no}`}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#94a3b8',
                            marginTop: '2px',
                            fontWeight: 600,
                          }}
                        >
                          ID: <span style={{ color: '#cbd5e1', fontFamily: 'monospace' }}>{student.admission_no}</span>
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
                        backgroundColor: isPresent ? 'rgba(16, 185, 129, 0.18)' : isLate ? 'rgba(245, 158, 11, 0.18)' : 'rgba(239, 68, 68, 0.18)',
                        color: isPresent ? '#34d399' : isLate ? '#fbbf24' : '#f87171',
                        border: `1px solid ${isPresent ? 'rgba(16, 185, 129, 0.4)' : isLate ? 'rgba(245, 158, 11, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                        flexShrink: 0,
                        backdropFilter: 'blur(8px)',
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
                      backgroundColor: 'rgba(2, 6, 23, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      padding: '4px',
                      borderRadius: '12px',
                    }}
                  >
                    {/* Present Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Present')}
                      className="touch-action-btn"
                      style={{
                        backgroundColor: isPresent ? '#059669' : 'transparent',
                        backgroundImage: isPresent ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)' : 'none',
                        color: isPresent ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        borderRadius: '9px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: isPresent ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isPresent ? '0 4px 14px rgba(16, 185, 129, 0.4)' : 'none',
                      }}
                    >
                      <Check size={15} strokeWidth={isPresent ? 3 : 2} color={isPresent ? '#ffffff' : '#94a3b8'} />
                      <span>Present</span>
                    </button>

                    {/* Late Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Late')}
                      className="touch-action-btn"
                      style={{
                        backgroundColor: isLate ? '#d97706' : 'transparent',
                        backgroundImage: isLate ? 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)' : 'none',
                        color: isLate ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        borderRadius: '9px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: isLate ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isLate ? '0 4px 14px rgba(245, 158, 11, 0.4)' : 'none',
                      }}
                    >
                      <Clock size={15} strokeWidth={isLate ? 3 : 2} color={isLate ? '#ffffff' : '#94a3b8'} />
                      <span>Late</span>
                    </button>

                    {/* Absent Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Absent')}
                      className="touch-action-btn"
                      style={{
                        backgroundColor: isAbsent ? '#dc2626' : 'transparent',
                        backgroundImage: isAbsent ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)' : 'none',
                        color: isAbsent ? '#ffffff' : '#94a3b8',
                        border: 'none',
                        borderRadius: '9px',
                        padding: '10px 4px',
                        fontSize: '13px',
                        fontWeight: isAbsent ? 800 : 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: isAbsent ? '0 4px 14px rgba(239, 68, 68, 0.4)' : 'none',
                      }}
                    >
                      <X size={15} strokeWidth={isAbsent ? 3 : 2} color={isAbsent ? '#ffffff' : '#94a3b8'} />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sticky Bottom "DONE — Save to School PC" Action Bar (Floating Liquid Glass Dock) */}
          <div
            style={{
              position: 'fixed',
              bottom: '64px',
              left: 0,
              right: 0,
              backgroundColor: 'rgba(10, 17, 34, 0.88)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '10px 16px',
              zIndex: 40,
              boxShadow: '0 -8px 30px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || students.length === 0}
                className="touch-action-btn"
                style={{
                  width: '100%',
                  backgroundColor: '#059669',
                  backgroundImage: 'linear-gradient(135deg, #065f46 0%, #059669 50%, #10b981 100%)',
                  border: '1px solid rgba(52, 211, 153, 0.4)',
                  color: '#ffffff',
                  padding: '14px 18px',
                  borderRadius: '14px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
                }}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw size={17} className="animate-spin" />
                    <span>Synchronizing to School PC...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#ffffff" />
                    <span>
                      ✓ Save to School PC ({presentCount} Present · {absentCount} Absent)
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
            className="liquid-card"
            style={{
              backgroundColor: 'rgba(10, 17, 34, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 20px rgba(16, 185, 129, 0.2)',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '2px solid #10b981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
                boxShadow: '0 0 20px rgba(16, 185, 129, 0.35)',
              }}
            >
              <CheckCircle2 size={34} color="#34d399" />
            </div>

            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
              Roll Call Recorded!
            </h3>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', lineHeight: 1.4 }}>
              Attendance data has been synchronized with the School PC in real-time.
            </div>

            {/* Summary Breakdown */}
            <div
              style={{
                marginTop: '16px',
                backgroundColor: 'rgba(2, 6, 23, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700 }}>Total</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                  {savedSummary.total}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#34d399', fontWeight: 700 }}>Present</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                  {savedSummary.present}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: 700 }}>Late</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
                  {savedSummary.late}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#f87171', fontWeight: 700 }}>Absent</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
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
              className="touch-action-btn"
              style={{
                marginTop: '18px',
                width: '100%',
                backgroundColor: '#059669',
                backgroundImage: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '13px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 6px 18px rgba(16, 185, 129, 0.35)',
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
            backgroundColor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="liquid-card"
            style={{
              backgroundColor: 'rgba(10, 17, 34, 0.95)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(197, 168, 128, 0.35)',
              borderRadius: '20px',
              padding: '22px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
                School PC Wi-Fi Connection
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.45 }}>
              Enter the local IP address of your School PC. Both devices must be on the same School Wi-Fi network.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#c5a880', marginBottom: '6px' }}>
                SCHOOL PC WI-FI URL:
              </label>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="http://192.168.0.104:5173"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '13px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(2, 6, 23, 0.75)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
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
                  marginTop: '8px',
                }}
              >
                ↺ Reset to Default (192.168.0.104:5173)
              </button>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  handleTriggerAutoDiscovery();
                }}
                disabled={isAutoDiscovering}
                className="touch-action-btn"
                style={{
                  width: '100%',
                  backgroundColor: '#059669',
                  backgroundImage: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '11px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isAutoDiscovering ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                }}
              >
                <Search size={14} />
                <span>Auto-Detect School PC on Wi-Fi</span>
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="touch-action-btn"
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1',
                  padding: '11px',
                  borderRadius: '10px',
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
                  verifyConnection(clean, false);
                }}
                className="touch-action-btn"
                style={{
                  flex: 1,
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(197, 168, 128, 0.4)',
                  color: '#c5a880',
                  padding: '11px',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 800,
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
      {/* ARTISANAL LIQUID GLASS FIXED MOBILE BOTTOM NAVIGATION BAR                */}
      {/* ========================================================================= */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          backgroundColor: 'rgba(10, 17, 34, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
          boxShadow: '0 -6px 20px rgba(0,0,0,0.35)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* 1. Batches Cohorts */}
        <button
          onClick={() => setViewMode('batches')}
          className="touch-action-btn"
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
          <div
            style={{
              padding: '2px 10px',
              borderRadius: '12px',
              backgroundColor: viewMode === 'batches' ? 'rgba(197, 168, 128, 0.15)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <School size={20} color={viewMode === 'batches' ? '#c5a880' : '#94a3b8'} />
          </div>
          <span style={{ fontSize: '10px', fontWeight: viewMode === 'batches' ? 800 : 500 }}>Batches</span>
        </button>

        {/* 2. Camera QR Scanner */}
        <button
          onClick={() => setShowCameraScanner(true)}
          className="touch-action-btn"
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
          className="touch-action-btn"
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

        {/* 4. Auto-Scan Wi-Fi */}
        <button
          onClick={handleTriggerAutoDiscovery}
          className="touch-action-btn"
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '3px',
            color: connectionStatus.ok ? '#34d399' : '#fbbf24',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          {isAutoDiscovering ? (
            <RefreshCw size={20} color="#34d399" className="animate-spin" />
          ) : (
            <Search size={20} color={connectionStatus.ok ? '#34d399' : '#fbbf24'} />
          )}
          <span style={{ fontSize: '10px', fontWeight: 700 }}>
            {connectionStatus.ok ? 'Wi-Fi PC' : 'Find PC'}
          </span>
        </button>

        {/* 5. Settings */}
        <button
          onClick={() => setShowSettingsModal(true)}
          className="touch-action-btn"
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
