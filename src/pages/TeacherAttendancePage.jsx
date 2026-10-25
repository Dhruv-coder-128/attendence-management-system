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
  Cake,
  ChevronDown,
  Layers,
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
import { groupBatchesByStandard } from '../lib/classHierarchyHelper';
import BirthdayWishModal from '../components/students/BirthdayWishModal';


export const CANONICAL_BATCH_CODES = [];

export function getCanonicalBatchCode(raw) {
  if (!raw) return '';
  const s = String(raw).trim().toUpperCase();
  // Do NOT collapse multi-section codes like 11COM-B or 11TH-B into 11-COM!
  if (s.endsWith('-B') || s.endsWith(' B') || s.endsWith('_B') || s.includes('DIV B') || s.includes('SECTION B') || s.includes('DIVITION B')) {
    return s;
  }
  if (s === 'B11' || s === '11-COM') return '11-COM';
  if (s === 'B12' || s === '12-COM') return '12-COM';
  if (s === 'BFY' || s === 'FY-BCA' || s === 'FY') return 'FY-BCA';
  if (s === 'BSY' || s === 'SY-BCA' || s === 'SY') return 'SY-BCA';
  if (s === 'BTY' || s === 'TY-BCA' || s === 'TY') return 'TY-BCA';
  return s;
}

const DAILY_METRICS_KEY_PREFIX = 'sms_daily_metrics_v3_';
const BATCH_ATTENDANCE_STATUS_KEY_PREFIX = 'sms_batch_status_v3_';

function getStoredDailyMetrics(date) {
  if (typeof window === 'undefined') return { total: 100, present: 0, absent: 0, late: 0, pending: 100, marked: false };
  try {
    const raw = localStorage.getItem(DAILY_METRICS_KEY_PREFIX + (date || new Date().toISOString().split('T')[0]));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.pending === undefined) {
        parsed.pending = Math.max(0, (parsed.total || 100) - ((parsed.present || 0) + (parsed.absent || 0) + (parsed.late || 0)));
      }
      return parsed;
    }
  } catch {}
  return { total: 100, present: 0, absent: 0, late: 0, pending: 100, marked: false };
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
  const [batches, setBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [students, setStudents] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({}); // { student_id: 'Present' | 'Late' | 'Absent' }

  // Birthday Greeting Console State
  const [activeBirthdayStudent, setActiveBirthdayStudent] = useState(null);
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = useState(false);

  // Strict Deduplication of Batches by Unique Code (Declared early so callbacks can access safely)
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

  // Class Hierarchy: Standard -> Section State
  const [expandedStandard, setExpandedStandard] = useState(null);
  const [selectedStandard, setSelectedStandard] = useState(null);

  const standardGroups = useMemo(() => {
    return groupBatchesByStandard(uniqueBatches);
  }, [uniqueBatches]);

  const activeStandardGroup = useMemo(() => {
    if (!selectedStandard) return null;
    return standardGroups.find(
      (g) => g.standardName.toLowerCase() === selectedStandard.toLowerCase()
    ) || null;
  }, [standardGroups, selectedStandard]);

  // Active Batch Object (Declared early so callbacks can access safely)
  const activeBatch = useMemo(() => {
    return (
      uniqueBatches.find(
        (b) =>
          b.id === selectedBatchId ||
          b.code === selectedBatchId ||
          b.name === selectedBatchId ||
          b.name?.toLowerCase() === selectedBatchId?.toLowerCase() ||
          b.code?.toLowerCase() === selectedBatchId?.toLowerCase()
      ) || uniqueBatches[0] || {}
    );
  }, [uniqueBatches, selectedBatchId]);

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
  const activeStandardGroupRef = useRef(activeStandardGroup);
  activeStandardGroupRef.current = activeStandardGroup;
  const lastBackPressTimeRef = useRef(0);
  const verifyConnectionRef = useRef(null);
  const hubUrlRef = useRef(hubUrl);

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
      // 4. If in student roll call, return to divisions if multi-section or batches if single
      if (viewModeRef.current === 'rollcall') {
        if (activeStandardGroupRef.current?.hasMultipleSections) {
          setViewMode('divisions');
        } else {
          setViewMode('batches');
        }
        return;
      }
      // 5. If in divisions view, return to master standards/classes
      if (viewModeRef.current === 'divisions') {
        setViewMode('batches');
        return;
      }

      // 6. On batches root screen: require double back-tap within 2.0s before exit
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

    let stateHandle = null;
    try {
      App.addListener('backButton', handleBackAction)
        .then((handle) => {
          listenerHandle = handle;
        })
        .catch(() => {});

      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive && typeof verifyConnectionRef.current === 'function') {
          verifyConnectionRef.current(hubUrlRef.current, false);
        }
      })
        .then((handle) => {
          stateHandle = handle;
        })
        .catch(() => {});
    } catch {}

    // Web / browser popstate support
    const handlePopState = (e) => {
      if (viewModeRef.current === 'rollcall') {
        e?.preventDefault?.();
        if (activeStandardGroupRef.current?.hasMultipleSections) {
          setViewMode('divisions');
        } else {
          setViewMode('batches');
        }
      } else if (viewModeRef.current === 'divisions') {
        e?.preventDefault?.();
        setViewMode('batches');
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
      if (stateHandle && typeof stateHandle.remove === 'function') {
        stateHandle.remove();
      }
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showToast]);

  // 1. Load Batches
  const loadBatches = useCallback(async (targetUrl = hubUrl) => {
    setIsLoading(true);
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(Array.isArray(list) ? list : []);
    setIsLoading(false);
  }, [hubUrl]);

  // Refresh authoritative daily metrics across all batches from PC Hub with canonical deduplication
  const refreshHubMetrics = useCallback(async (targetUrl = hubUrl, date = selectedDate) => {
    const activeUrl = targetUrl || getStoredHubUrl();
    if (!activeUrl) return;
    try {
      const res = await fetch(`${activeUrl.replace(/\/+$/, '')}/api/local-hub?action=updates&date=${encodeURIComponent(date)}`);
      if (res.ok) {
        const data = await res.json();
        const records = data.records || data.allRecords || [];
        if (Array.isArray(records) && records.length > 0) {
          // Student lookup map
          const studentLookup = new Map();
          (batches || []).forEach((b) => {
            (b.students || []).forEach((s) => {
              if (s.admission_no) studentLookup.set(s.admission_no.trim().toUpperCase(), s);
              if (s.id) studentLookup.set(s.id.trim(), s);
              if (s.full_name) studentLookup.set(s.full_name.trim().toLowerCase(), s);
            });
          });

          // Strict student-level deduplication: exactly 1 state per student
          const studentAttendanceMap = new Map();
          records.forEach((r) => {
            const rawAdm = (r.admission_no || '').trim().toUpperCase();
            const rawId = (r.student_id || '').trim();
            const rawName = (r.full_name || '').trim().toLowerCase();
            const matched = studentLookup.get(rawAdm) || studentLookup.get(rawId) || studentLookup.get(rawName);

            // Discard test mock records
            if (rawAdm.startsWith('SMS-2026-') || (rawId && rawId.startsWith('SMS-2026-'))) return;

            const studentKey = matched ? matched.admission_no : (rawAdm || rawId || null);
            if (!studentKey) return;

            const existingEntry = studentAttendanceMap.get(studentKey);
            if (!existingEntry) {
              studentAttendanceMap.set(studentKey, {
                ...r,
                admission_no: matched ? matched.admission_no : studentKey,
                batch_code: getCanonicalBatchCode(matched ? matched.batch_code : (r.batch_code || r.batch_id)),
                status: r.status || 'Pending',
              });
            } else {
              const existingTime = new Date(existingEntry.updated_at || 0).getTime();
              const incomingTime = new Date(r.updated_at || 0).getTime();
              if (incomingTime > existingTime) {
                studentAttendanceMap.set(studentKey, {
                  ...r,
                  admission_no: matched ? matched.admission_no : studentKey,
                  batch_code: getCanonicalBatchCode(matched ? matched.batch_code : (r.batch_code || r.batch_id)),
                  status: r.status || 'Pending',
                });
              }
            }
          });

          // Compute exact per-batch counts and daily totals
          const batchMap = {};
          let totalPresent = 0;
          let totalAbsent = 0;
          let totalLate = 0;

          // Initialize batchMap dynamically for all actual batches
          uniqueBatches.forEach((b) => {
            const bKey = (b.code || b.id || '').toUpperCase();
            const count = typeof b.student_count === 'number' ? b.student_count : (typeof b.enrolled === 'number' ? b.enrolled : 0);
            if (bKey) {
              batchMap[bKey] = { present: 0, absent: 0, late: 0, total: count, pending: count, taken: false };
            }
          });


          studentAttendanceMap.forEach((entry) => {
            const bCode = (entry.batch_code || '').toUpperCase();
            if (bCode && batchMap[bCode]) {
              batchMap[bCode].taken = true;
              if (entry.status === 'Present') {
                batchMap[bCode].present += 1;
                totalPresent += 1;
              } else if (entry.status === 'Late') {
                batchMap[bCode].late += 1;
                totalLate += 1;
              } else if (entry.status === 'Absent') {
                batchMap[bCode].absent += 1;
                totalAbsent += 1;
              }
            }
          });

          // Calculate exact pending for each cohort
          Object.keys(batchMap).forEach((code) => {
            const b = batchMap[code];
            b.pending = Math.max(0, b.total - (b.present + b.absent + b.late));
          });

          const totalCapacity = typeof data.studentsCount === 'number'
            ? data.studentsCount
            : (typeof data.studentCount === 'number' ? data.studentCount : schoolTotalStudents);
          const totalPending = Math.max(0, totalCapacity - (totalPresent + totalAbsent + totalLate));

          const newMetrics = {
            total: totalCapacity,
            present: totalPresent,
            absent: totalAbsent,
            late: totalLate,
            pending: totalPending,
            marked: true,
          };

          setDailyMetrics(newMetrics);
          setStoredDailyMetrics(date, newMetrics);
          setBatchStatuses(batchMap);
          setStoredBatchStatuses(date, batchMap);
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
    verifyConnectionRef.current = verifyConnection;
    hubUrlRef.current = hubUrl;
  }, [verifyConnection, hubUrl]);

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

  // Note: Destructive 3-second poll in roll call mode removed to prevent clobbering active teacher edits

  // Recheck when phone reconnects to network
  useEffect(() => {
    const handleNetworkChange = () => verifyConnection(hubUrl, false);
    window.addEventListener('online', handleNetworkChange);
    return () => {
      window.removeEventListener('online', handleNetworkChange);
    };
  }, [hubUrl, verifyConnection]);

  // 3. Load Students when batch is opened & load existing attendance from PC
  const openBatchRollCall = async (batchId, standardName = null) => {
    setSelectedBatchId(batchId);
    if (standardName) setSelectedStandard(standardName);
    setViewMode('rollcall');
    setIsLoading(true);

    try {
      window.history.pushState({ view: 'rollcall' }, '');
    } catch {}

    let studentList = await fetchStudentsFromHub(batchId, hubUrl);
    if (!Array.isArray(studentList)) studentList = [];

    setStudents(studentList);

    // Fetch existing attendance previously marked today on PC or phone
    const existingRecords = await fetchExistingAttendanceFromHub(batchId, selectedDate, hubUrl);
    const initialMap = {};
    if (Array.isArray(existingRecords) && existingRecords.length > 0) {
      existingRecords.forEach((r) => {
        const targetAdm = String(r.admission_no || r.student_id || '').trim().toUpperCase();
        const matched = studentList.find(
          (s) =>
            s.id === r.student_id ||
            (s.admission_no && s.admission_no.trim().toUpperCase() === targetAdm) ||
            (s.full_name && r.full_name && s.full_name.trim().toLowerCase() === r.full_name.trim().toLowerCase())
        );
        if (matched) {
          initialMap[matched.id] = r.status;
        }
      });
      showToast('✓ Loaded existing roll call');
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
        const targetAdm = String(r.admission_no || r.student_id || '').trim().toUpperCase();
        const matched = students.find(
          (s) =>
            s.id === r.student_id ||
            (s.admission_no && s.admission_no.trim().toUpperCase() === targetAdm) ||
            (s.full_name && r.full_name && s.full_name.trim().toLowerCase() === r.full_name.trim().toLowerCase())
        );
        if (matched) {
          map[matched.id] = r.status;
        }
      });
      showToast(`Loaded records for ${newDate}`);
    }
    setAttendanceMap(map);
    setIsLoading(false);
  };

  // Auto-sync debounced ref
  const autoSyncTimerRef = useRef(null);

  const syncRollCallToHubDebounced = useCallback((updatedMap) => {
    const activeUrl = hubUrl || getStoredHubUrl();
    if (!activeUrl || !selectedBatchId) return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        const bCode = getCanonicalBatchCode(activeBatch?.code || selectedBatchId);
        const records = students.map((s) => ({
          student_id: s.id,
          admission_no: s.admission_no || s.id,
          roll_no: s.roll_no,
          full_name: s.full_name || s.name || '',
          status: updatedMap[s.id] || updatedMap[s.admission_no] || 'Pending',
          remarks: '',
          time_in: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        }));

        await submitAttendanceToHub(
          activeBatch?.id || selectedBatchId,
          selectedDate,
          records,
          activeUrl,
          {
            batch_code: bCode,
            batch_name: activeBatch?.name || '',
          },
          false // Don't spam offline queue on auto-sync keystrokes
        );
      } catch (err) {
        console.warn('Background auto-sync deferred:', err);
      }
    }, 600);
  }, [hubUrl, selectedBatchId, activeBatch, students, selectedDate]);

  // Recalculates batch and top metrics immediately from a map
  const updateMetricsFromMap = useCallback((newMap) => {
    const bCode = getCanonicalBatchCode(activeBatch?.code || selectedBatchId);
    let pCount = 0;
    let aCount = 0;
    let lCount = 0;

    students.forEach((s) => {
      const st = newMap[s.id] || newMap[s.admission_no];
      if (st === 'Present') pCount++;
      else if (st === 'Late') lCount++;
      else if (st === 'Absent') aCount++;
    });

    const batchTotal = students.length;

    const newBatchInfo = {
      present: pCount,
      absent: aCount,
      late: lCount,
      total: batchTotal,
      pending: Math.max(0, batchTotal - (pCount + aCount + lCount)),
      taken: (pCount + aCount + lCount) > 0,
    };

    setBatchStatuses((prev) => {
      const next = { ...prev, [bCode]: newBatchInfo };
      setStoredBatchStatuses(selectedDate, next);

      let sumPresent = 0;
      let sumAbsent = 0;
      let sumLate = 0;
      let sumTotal = 0;
      Object.keys(next).forEach((c) => {
        const b = next[c];
        if (b) {
          sumPresent += b.present || 0;
          sumAbsent += b.absent || 0;
          sumLate += b.late || 0;
          sumTotal += b.total || 0;
        }
      });

      const effectiveTotal = Math.max(schoolTotalStudents, sumTotal);
      const totalPending = Math.max(0, effectiveTotal - (sumPresent + sumAbsent + sumLate));
      const metrics = {
        total: effectiveTotal,
        present: sumPresent,
        absent: sumAbsent,
        late: sumLate,
        pending: totalPending,
        marked: true,
      };
      setDailyMetrics(metrics);
      setStoredDailyMetrics(selectedDate, metrics);

      return next;
    });
  }, [activeBatch, selectedBatchId, students, selectedDate]);

  // Toggle single student status (Present / Late / Absent)
  const setStudentStatus = (studentId, status) => {
    setAttendanceMap((prev) => {
      const next = {
        ...prev,
        [studentId]: status,
      };
      updateMetricsFromMap(next);
      syncRollCallToHubDebounced(next);
      return next;
    });
  };

  // Bulk actions: Mark All Present & Mark All Absent (Strictly 1 state per student)
  const markAllPresent = () => {
    const next = {};
    students.forEach((s) => {
      next[s.id] = 'Present';
    });
    setAttendanceMap(next);
    updateMetricsFromMap(next);
    syncRollCallToHubDebounced(next);
    showToast(`✓ All ${students.length} students marked Present`);
  };

  const markAllAbsent = () => {
    const next = {};
    students.forEach((s) => {
      next[s.id] = 'Absent';
    });
    setAttendanceMap(next);
    updateMetricsFromMap(next);
    syncRollCallToHubDebounced(next);
    showToast(`✓ All ${students.length} students marked Absent`);
  };

  // Metric Computations (Present, Late, Absent, Total) - strictly 1 state per student
  const getStudentStatus = (s) => attendanceMap[s.id] || (s.admission_no ? attendanceMap[s.admission_no] : null) || 'Pending';
  const totalCount = students.length;
  const presentCount = useMemo(() => {
    return students.filter((s) => getStudentStatus(s) === 'Present').length;
  }, [students, attendanceMap]);

  const lateCount = useMemo(() => {
    return students.filter((s) => getStudentStatus(s) === 'Late').length;
  }, [students, attendanceMap]);

  const absentCount = useMemo(() => {
    return students.filter((s) => getStudentStatus(s) === 'Absent').length;
  }, [students, attendanceMap]);

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

  // Submit attendance ("DONE" Action)
  const handleSubmit = async () => {
    if (!selectedBatchId || students.length === 0) return;

    setIsSubmitting(true);
    const records = students.map((s) => ({
      student_id: s.id,
      admission_no: s.admission_no || s.id,
      roll_no: s.roll_no,
      full_name: s.full_name || s.name || '',
      status: attendanceMap[s.id] || (s.admission_no ? attendanceMap[s.admission_no] : null) || 'Pending',
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
    const bKey = getCanonicalBatchCode(activeBatch.code || selectedBatchId);
    const batchTotal = totalCount;

    const newBatchInfo = {
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      total: batchTotal,
      pending: Math.max(0, batchTotal - (presentCount + absentCount + lateCount)),
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
      Object.keys(currentMap).forEach((c) => {
        const st = currentMap[c];
        if (st) {
          sumTotal += st.total || 0;
          sumPresent += st.present || 0;
          sumAbsent += st.absent || 0;
          sumLate += st.late || 0;
        }
      });
      const effectiveTotal = Math.max(schoolTotalStudents, sumTotal);
      const totalPending = Math.max(0, effectiveTotal - (sumPresent + sumAbsent + sumLate));
      const next = {
        total: effectiveTotal,
        present: sumPresent,
        absent: sumAbsent,
        late: sumLate,
        pending: totalPending,
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
    // If connected to PC and Hub reports authoritative student count, use it directly
    if (connectionStatus?.ok && typeof connectionStatus?.studentsCount === 'number' && connectionStatus.studentsCount > 0) {
      return connectionStatus.studentsCount;
    }
    // Sum real students across batches; empty custom cohorts count as 0, not phantom 20
    const sum = uniqueBatches.reduce((acc, b) => {
      const count = typeof b.student_count === 'number' ? b.student_count : (typeof b.enrolled === 'number' ? b.enrolled : (b.is_canonical ? 20 : 0));
      return acc + count;
    }, 0);
    return sum || 100;
  }, [uniqueBatches, connectionStatus]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        backgroundImage: `
          radial-gradient(circle at 12% 8%, rgba(219, 234, 254, 0.6) 0%, transparent 45%),
          radial-gradient(circle at 88% 22%, rgba(254, 243, 199, 0.45) 0%, transparent 45%),
          radial-gradient(circle at 50% 85%, rgba(209, 250, 229, 0.4) 0%, transparent 50%)
        `,
        color: '#0f172a',
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
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: `1px solid ${
                toast.type === 'error'
                  ? '#fecaca'
                  : toast.type === 'warning'
                  ? '#fde68a'
                  : '#a7f3d0'
              }`,
              boxShadow: `0 16px 36px rgba(15, 23, 42, 0.12), 0 0 20px ${
                toast.type === 'error'
                  ? 'rgba(239, 68, 68, 0.15)'
                  : toast.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.15)'
              }`,
              borderRadius: '16px',
              padding: '12px 18px',
              color: '#0f172a',
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
                    ? '#fee2e2'
                    : toast.type === 'warning'
                    ? '#fef3c7'
                    : '#d1fae5',
              }}
            >
              {toast.type === 'error' ? (
                <XCircle size={18} color="#dc2626" />
              ) : toast.type === 'warning' ? (
                <AlertTriangle size={18} color="#d97706" />
              ) : (
                <CheckCircle2 size={18} color="#059669" />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, lineHeight: 1.4, color: '#0f172a' }}>
              {toast.message}
            </div>
            <button
              onClick={() => setToast(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
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
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(226, 232, 240, 0.85)',
          padding: '12px 16px',
          boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
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
                backgroundColor: '#f1f5f9',
                border: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
              }}
            >
              <School size={20} color="#0284c7" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
                {academySettings.academy_name || 'SMS Student System'}
              </div>
              <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={11} color="#0284c7" />
                <span>Teacher Roll Call Hub</span>
              </div>
            </div>
          </div>

          {/* Right Status / Wi-Fi Indicator Pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowSettingsModal(true)}
              style={{
                backgroundColor: connectionStatus.ok ? '#ecfdf5' : '#fffbeb',
                border: `1px solid ${connectionStatus.ok ? '#a7f3d0' : '#fde68a'}`,
                color: connectionStatus.ok ? '#059669' : '#b45309',
                padding: '6px 10px',
                borderRadius: '10px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
              }}
              title={connectionStatus.ok ? 'Connected to School PC' : 'Tap to configure School PC connection'}
            >
              <ShieldCheck size={14} color={connectionStatus.ok ? '#059669' : '#b45309'} />
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
            backgroundColor: connectionStatus.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${connectionStatus.ok ? '#bbf7d0' : '#fecaca'}`,
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
                boxShadow: connectionStatus.ok ? '0 0 8px #10b981' : '0 0 8px #ef4444',
                animation: 'pulseGlow 2s infinite ease-in-out',
              }}
            />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: connectionStatus.ok ? '#166534' : '#991b1b',
              }}
            >
              {connectionStatus.ok
                ? 'School PC Connected & Active'
                : connectionStatus.state === 'wifi_disconnected'
                ? 'Phone Wi-Fi Disconnected'
                : 'School PC Not Found / Tap to Scan'}
            </span>
          </div>
          <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', fontWeight: 600 }}>
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
                border: '1px solid #fde68a',
                borderRadius: '14px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#d97706" />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>
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
                  boxShadow: '0 2px 8px rgba(217, 119, 6, 0.3)',
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
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '16px',
                padding: '16px',
                marginBottom: '16px',
                boxShadow: '0 4px 16px rgba(239, 68, 68, 0.08)',
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
                    Connect to School Wi-Fi Network
                  </div>
                  <div style={{ fontSize: '12px', color: '#7f1d1d', marginTop: '3px', lineHeight: 1.4 }}>
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
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
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
                border: '1px solid #e2e8f0',
                borderRadius: '18px',
                padding: '18px',
                marginBottom: '16px',
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.05)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '14px',
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <QrCode size={26} color="#2563eb" />
              </div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                School PC Hub Not Detected
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                Cannot reach School PC at <span style={{ color: '#0284c7', fontFamily: 'monospace', fontWeight: 700 }}>{hubUrl}</span>. Auto-detect below or scan the QR code displayed on your PC screen.
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
                  boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
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
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>OR SCAN QR CODE</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
              </div>

              {/* Large Camera Scan Button */}
              <button
                onClick={() => setShowCameraScanner(true)}
                className="touch-action-btn"
                style={{
                  width: '100%',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                }}
              >
                <Camera size={18} color="#0284c7" />
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
                    backgroundColor: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
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
                    backgroundColor: '#0f172a',
                    border: 'none',
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
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '6px',
              marginBottom: '18px',
            }}
          >
            {/* Total Students */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #2563eb',
                borderRadius: '14px',
                padding: '10px 2px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2px' }}>
                Enrolled
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {schoolTotalStudents}
              </div>
            </div>

            {/* Present Today (Persistent across RAM kill - Never shows '--') */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #10b981',
                borderRadius: '14px',
                padding: '10px 2px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#059669', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2px' }}>
                Present
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                {dailyMetrics?.marked ? dailyMetrics.present : (savedSummary?.present ?? 0)}
              </div>
            </div>

            {/* Absent Today (Persistent across RAM kill - Never shows '--') */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #ef4444',
                borderRadius: '14px',
                padding: '10px 2px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#dc2626', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2px' }}>
                Absent
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
                {dailyMetrics?.marked ? dailyMetrics.absent : (savedSummary?.absent ?? 0)}
              </div>
            </div>

            {/* Pending Today (Strict Invariant: Present + Absent + Pending = 100) */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #f59e0b',
                borderRadius: '14px',
                padding: '10px 2px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#d97706', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2px' }}>
                Pending
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>
                {dailyMetrics?.marked
                  ? (dailyMetrics.pending !== undefined
                      ? dailyMetrics.pending
                      : Math.max(0, 100 - ((dailyMetrics.present || 0) + (dailyMetrics.absent || 0) + (dailyMetrics.late || 0))))
                  : 100}
              </div>
            </div>

            {/* Batches / Cohorts */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #8b5cf6',
                borderRadius: '14px',
                padding: '10px 2px',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#7c3aed', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.2px' }}>
                Batches
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#7c3aed', marginTop: '2px' }}>
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
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
                Academic Batches
              </h1>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Select a class cohort to record student attendance
              </div>
            </div>
            <span
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#1d4ed8',
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
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                color: '#0f172a',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Hierarchical Standard & Division Cards Grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {standardGroups
              .filter((group) => {
                if (!searchTerm.trim()) return true;
                const term = searchTerm.toLowerCase();
                const matchesStandard = group.standardName.toLowerCase().includes(term);
                const matchesAnySection = group.sections.some(
                  (b) =>
                    b.name?.toLowerCase().includes(term) ||
                    b.code?.toLowerCase().includes(term) ||
                    String(b.section || '').toLowerCase().includes(term)
                );
                return matchesStandard || matchesAnySection;
              })
              .map((group) => {
                const totalDivisions = group.sections.length;
                let markedDivisionsCount = 0;
                let totalStudentsInStandard = 0;
                group.sections.forEach((b) => {
                  const bKey = getCanonicalBatchCode(b.code || b.id);
                  if (batchStatuses[bKey]?.taken) markedDivisionsCount++;
                  totalStudentsInStandard += typeof b.student_count === 'number' ? b.student_count : (typeof b.enrolled === 'number' ? b.enrolled : 0);
                });

                // If standalone single-division class, can launch directly; if multiple divisions, drills down to divisions screen
                const handleCardClick = () => {
                  if (group.hasMultipleSections) {
                    setSelectedStandard(group.standardName);
                    setViewMode('divisions');
                  } else {
                    const singleBatch = group.sections[0];
                    openBatchRollCall(singleBatch.id || singleBatch.code, group.standardName);
                  }
                };

                return (
                  <div
                    key={group.standardName}
                    onClick={handleCardClick}
                    className="liquid-card"
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '16px',
                      padding: '16px',
                      border: markedDivisionsCount === totalDivisions && totalDivisions > 0 ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                      borderLeft: '4px solid #4f46e5',
                      boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            backgroundColor: '#e0e7ff',
                            border: '1px solid #c7d2fe',
                            color: '#4338ca',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Layers size={12} />
                          <span>{group.hasMultipleSections ? 'Standard Group' : 'Class'}</span>
                        </span>

                        <span
                          style={{
                            backgroundColor: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            color: '#475569',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontSize: '11px',
                            fontWeight: 700,
                          }}
                        >
                          {totalDivisions} {totalDivisions === 1 ? 'Division' : 'Divisions'} ({group.sections.map((s) => s.section).join(', ')})
                        </span>

                        {markedDivisionsCount === totalDivisions && totalDivisions > 0 ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#059669',
                              backgroundColor: '#ecfdf5',
                              border: '1px solid #a7f3d0',
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Check size={11} strokeWidth={3} />
                            <span>All Marked Today</span>
                          </span>
                        ) : markedDivisionsCount > 0 ? (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#0284c7',
                              backgroundColor: '#f0f9ff',
                              border: '1px solid #bae6fd',
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontWeight: 700,
                            }}
                          >
                            {markedDivisionsCount}/{totalDivisions} Marked
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#b45309',
                              backgroundColor: '#fffbeb',
                              border: '1px solid #fde68a',
                              padding: '2px 8px',
                              borderRadius: '20px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <Clock size={11} />
                            <span>Roll Call Pending</span>
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          fontSize: '17px',
                          fontWeight: 800,
                          color: '#0f172a',
                          letterSpacing: '-0.3px',
                        }}
                      >
                        {group.standardName}
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          color: '#64748b',
                          marginTop: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <Users size={12} color="#64748b" />
                        <span>{totalStudentsInStandard} Total Enrolled</span>
                        <span style={{ color: '#cbd5e1' }}>•</span>
                        <span style={{ color: '#4f46e5', fontWeight: 600 }}>
                          {group.hasMultipleSections ? 'Tap to view divisions' : 'Tap to take roll call'}
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#4f46e5',
                        fontSize: '12px',
                        fontWeight: 700,
                        paddingLeft: '12px',
                        flexShrink: 0,
                      }}
                    >
                      <span>{group.hasMultipleSections ? 'View Divisions' : 'Roll Call'}</span>
                      <ChevronRight size={18} />
                    </div>
                  </div>
                );
              })}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 2: DIVISIONS / SECTIONS DRILL-DOWN SCREEN (USER SKETCH IMAGE 2)    */}
      {/* ========================================================================= */}
      {viewMode === 'divisions' && activeStandardGroup && (
        <main style={{ padding: '16px 16px 130px 16px', maxWidth: '640px', margin: '0 auto', minHeight: '100vh', boxSizing: 'border-box' }}>
          {/* Top Back Navigation Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setViewMode('batches')}
              className="touch-action-btn"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                padding: '9px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              }}
            >
              <ArrowLeft size={16} color="#0284c7" />
              <span>← All Classes</span>
            </button>

            <span
              style={{
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#1d4ed8',
              }}
            >
              {activeStandardGroup.sections.length} Divisions
            </span>
          </div>

          {/* Standard Cohort Banner */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
              marginBottom: '16px',
              borderLeft: '4px solid #4f46e5',
            }}
          >
            <div style={{ fontSize: '11px', color: '#4f46e5', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>
              Standard Cohort
            </div>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              {activeStandardGroup.standardName}
            </h1>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Users size={13} color="#64748b" />
              <span>{activeStandardGroup.totalStudents} Enrolled Students</span>
              <span style={{ color: '#cbd5e1' }}>•</span>
              <span>Select a division below to take roll call</span>
            </div>
          </div>

          {/* Division Cards List (Image 2) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {activeStandardGroup.sections.map((batch) => {
              const bKey = getCanonicalBatchCode(batch.code || batch.id);
              const bStatus = batchStatuses[bKey];
              const isMarked = bStatus && bStatus.taken;

              return (
                <div
                  key={batch.code || batch.id}
                  onClick={() => openBatchRollCall(batch.id || batch.code, activeStandardGroup.standardName)}
                  className="liquid-card"
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '16px',
                    padding: '16px',
                    border: isMarked ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                    borderLeft: '4px solid #2563eb',
                    boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          padding: '2px 10px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          letterSpacing: '0.2px',
                        }}
                      >
                        Division {batch.section || 'A'}
                      </span>

                      <span
                        style={{
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#0f172a',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: 'monospace',
                        }}
                      >
                        {batch.code || batch.id}
                      </span>

                      {isMarked ? (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#059669',
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #a7f3d0',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Check size={11} strokeWidth={3} />
                          <span>{bStatus.present}P · {bStatus.absent}A · {bStatus.pending} Pending</span>
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            color: '#b45309',
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fde68a',
                            padding: '2px 8px',
                            borderRadius: '20px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Clock size={11} />
                          <span>Roll Call Pending</span>
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>
                      {batch.displayName || batch.name}
                    </div>

                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={12} color="#64748b" />
                      <span>{batch.timing || '08:00 AM – 10:30 AM'}</span>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <MapPin size={12} color="#64748b" />
                      <span>{batch.classroom || 'Room 101'}</span>
                      <span style={{ color: '#cbd5e1' }}>•</span>
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>
                        {typeof batch.student_count === 'number' ? `${batch.student_count} Students` : '0 Students'}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#2563eb',
                      fontSize: '13px',
                      fontWeight: 700,
                      paddingLeft: '12px',
                      flexShrink: 0,
                    }}
                  >
                    <span>{isMarked ? 'Edit' : 'Take Roll Call'}</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 3: STUDENT ROLL CALL SCREEN (MOBILE-FRIENDLY 2-TIER CARDS)         */}
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
              type="button"
              onClick={() => {
                if (activeStandardGroup?.hasMultipleSections) {
                  setViewMode('divisions');
                } else {
                  setViewMode('batches');
                }
              }}
              className="touch-action-btn"
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#0f172a',
                padding: '9px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              }}
            >
              <ArrowLeft size={16} color="#0284c7" />
              <span>{activeStandardGroup?.hasMultipleSections ? `← ${activeStandardGroup.standardName}` : '← All Classes'}</span>
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '4px 10px',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
              }}
            >
              <Calendar size={14} color="#0284c7" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#0f172a',
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
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
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
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <MapPin size={11} color="#64748b" />
                {activeBatch.classroom || 'Room 101'}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              {activeBatch.name}
            </h2>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
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
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderTop: '3px solid #2563eb',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.04)',
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
              className="liquid-card"
              style={{
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                borderTop: '3px solid #10b981',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.06)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#047857', textTransform: 'uppercase', fontWeight: 700 }}>
                Present
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                {presentCount}
              </div>
            </div>

            {/* Late */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderTop: '3px solid #f59e0b',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 4px 12px rgba(245, 158, 11, 0.06)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#92400e', textTransform: 'uppercase', fontWeight: 700 }}>
                Late
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                {lateCount}
              </div>
            </div>

            {/* Absent */}
            <div
              className="liquid-card"
              style={{
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                borderTop: '3px solid #ef4444',
                borderRadius: '12px',
                padding: '8px 4px',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.06)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '9px', color: '#9f1239', textTransform: 'uppercase', fontWeight: 700 }}>
                Absent
              </div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#e11d48', marginTop: '2px' }}>
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
                backgroundColor: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)',
              }}
            >
              <CheckCheck size={14} color="#059669" />
              <span>Mark All Present</span>
            </button>

            <button
              onClick={markAllAbsent}
              className="touch-action-btn"
              style={{
                flex: 1,
                backgroundColor: '#fff1f2',
                border: '1px solid #fecdd3',
                color: '#e11d48',
                borderRadius: '10px',
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.1)',
              }}
            >
              <XCircle size={14} color="#ef4444" />
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
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
              }}
            />
          </div>

          {/* MOBILE-FIRST 2-TIER STUDENT CARDS: 100% FULL NAME READABILITY */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredStudents.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '16px',
                  border: '2px dashed #cbd5e1',
                  padding: '36px 20px',
                  textAlign: 'center',
                  margin: '10px 0',
                }}
              >
                <div
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    backgroundColor: '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}
                >
                  <Users size={28} color="#64748b" />
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                  No Students Enrolled in {activeBatch.name || 'this Division'}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', maxWidth: '320px', margin: '0 auto', lineHeight: 1.5 }}>
                  {searchTerm.trim()
                    ? `No students found matching "${searchTerm}". Try a different name or admission number.`
                    : 'This cohort does not have any students assigned yet. Add students from the School PC Admin portal to begin taking attendance.'}
                </div>
              </div>
            ) : (
              filteredStudents.map((student) => {
              const status = attendanceMap[student.id] || attendanceMap[student.admission_no] || 'Pending';
              const isPresent = status === 'Present';
              const isLate = status === 'Late';
              const isAbsent = status === 'Absent';
              const isPending = status === 'Pending';

              return (
                <div
                  key={student.id}
                  className="liquid-card"
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '14px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
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
                          backgroundColor: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          color: '#0f172a',
                          fontSize: '14px',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.05)',
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
                            lineHeight: 1.3,
                            wordBreak: 'break-word',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <span>{student.full_name || student.name || student['Student Name'] || `Student ${student.roll_no || student.admission_no}`}</span>
                          {isStudentBirthdayToday(student.dob) && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                backgroundColor: '#fce7f3',
                                color: '#be185d',
                                fontSize: '10px',
                                fontWeight: 800,
                              }}
                            >
                              🎂 Birthday!
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: '#64748b',
                            marginTop: '2px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <span>ID: <span style={{ color: '#334155', fontFamily: 'monospace', fontWeight: 700 }}>{student.admission_no}</span></span>
                          {isStudentBirthdayToday(student.dob) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveBirthdayStudent(student);
                                setIsBirthdayModalOpen(true);
                              }}
                              style={{
                                border: 'none',
                                background: '#ec4899',
                                color: '#ffffff',
                                borderRadius: '4px',
                                padding: '2px 8px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              🎉 Wish
                            </button>
                          )}
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
                        backgroundColor: isPresent ? '#ecfdf5' : isLate ? '#fffbeb' : isAbsent ? '#fff1f2' : '#fef3c7',
                        color: isPresent ? '#059669' : isLate ? '#b45309' : isAbsent ? '#e11d48' : '#d97706',
                        border: `1px solid ${isPresent ? '#a7f3d0' : isLate ? '#fde68a' : isAbsent ? '#fecdd3' : '#fcd34d'}`,
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
                      border: '1px solid #e2e8f0',
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
                        backgroundColor: isPresent ? '#10b981' : 'transparent',
                        color: isPresent ? '#ffffff' : '#64748b',
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
                        boxShadow: isPresent ? '0 2px 8px rgba(16, 185, 129, 0.35)' : 'none',
                      }}
                    >
                      <Check size={15} strokeWidth={isPresent ? 3 : 2} color={isPresent ? '#ffffff' : '#64748b'} />
                      <span>Present</span>
                    </button>

                    {/* Late Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Late')}
                      className="touch-action-btn"
                      style={{
                        backgroundColor: isLate ? '#f59e0b' : 'transparent',
                        color: isLate ? '#ffffff' : '#64748b',
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
                        boxShadow: isLate ? '0 2px 8px rgba(245, 158, 11, 0.35)' : 'none',
                      }}
                    >
                      <Clock size={15} strokeWidth={isLate ? 3 : 2} color={isLate ? '#ffffff' : '#64748b'} />
                      <span>Late</span>
                    </button>

                    {/* Absent Button */}
                    <button
                      type="button"
                      onClick={() => setStudentStatus(student.id, 'Absent')}
                      className="touch-action-btn"
                      style={{
                        backgroundColor: isAbsent ? '#ef4444' : 'transparent',
                        color: isAbsent ? '#ffffff' : '#64748b',
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
                        boxShadow: isAbsent ? '0 2px 8px rgba(239, 68, 68, 0.35)' : 'none',
                      }}
                    >
                      <X size={15} strokeWidth={isAbsent ? 3 : 2} color={isAbsent ? '#ffffff' : '#64748b'} />
                      <span>Absent</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

          {/* Sticky Bottom "DONE — Save to School PC" Action Bar (Floating White Glass Dock) */}
          <div
            style={{
              position: 'fixed',
              bottom: '64px',
              left: 0,
              right: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              borderTop: '1px solid #e2e8f0',
              padding: '10px 16px',
              zIndex: 40,
              boxShadow: '0 -4px 20px rgba(15, 23, 42, 0.08)',
            }}
          >
            <div style={{ maxWidth: '640px', margin: '0 auto' }}>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || students.length === 0}
                className="touch-action-btn"
                style={{
                  width: '100%',
                  backgroundColor: '#2563eb',
                  backgroundImage: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)',
                  border: 'none',
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
                  boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
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
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
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
              border: '1px solid #e2e8f0',
              padding: '18px',
              width: '100%',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
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
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                📷 Scan School PC QR Code
              </div>
              <button
                onClick={() => setShowCameraScanner(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
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
                  backgroundColor: '#fee2e2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  textAlign: 'left',
                }}
              >
                {cameraError}
              </div>
            )}

            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '12px' }}>
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
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="liquid-card"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              padding: '24px',
              width: '100%',
              maxWidth: '380px',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
            }}
          >
            <div
              style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                backgroundColor: '#ecfdf5',
                border: '2px solid #10b981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px',
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.25)',
              }}
            >
              <CheckCircle2 size={34} color="#059669" />
            </div>

            <h3 style={{ margin: 0, fontSize: '19px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
              Roll Call Recorded!
            </h3>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', lineHeight: 1.4 }}>
              Attendance data has been synchronized with the School PC in real-time.
            </div>

            {/* Summary Breakdown */}
            <div
              style={{
                marginTop: '16px',
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '6px',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 700 }}>Total</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                  {savedSummary.total}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#059669', fontWeight: 700 }}>Present</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#059669', marginTop: '2px' }}>
                  {savedSummary.present}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 700 }}>Late</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>
                  {savedSummary.late}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>Absent</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
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
                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
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
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="liquid-card"
            style={{
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              padding: '22px',
              width: '100%',
              maxWidth: '380px',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px' }}>
                School PC Wi-Fi Connection
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px', lineHeight: 1.45 }}>
              Enter the local IP address of your School PC. Both devices must be on the same School Wi-Fi network.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
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
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#0f172a',
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
                  color: '#0284c7',
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
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
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
                  backgroundColor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#334155',
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
                  backgroundColor: '#0f172a',
                  border: 'none',
                  color: '#ffffff',
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
      {/* ARTISANAL PURE WHITE FIXED MOBILE BOTTOM NAVIGATION BAR                  */}
      {/* ========================================================================= */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '64px',
          backgroundColor: 'rgba(255, 255, 255, 0.94)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
          boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.04)',
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
            color: viewMode === 'batches' ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <div
            style={{
              padding: '2px 10px',
              borderRadius: '12px',
              backgroundColor: viewMode === 'batches' ? '#eff6ff' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <School size={20} color={viewMode === 'batches' ? '#2563eb' : '#64748b'} />
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
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <Camera size={20} color="#64748b" />
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
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <RefreshCw size={20} color="#64748b" className={isLoading || isFlushingQueue ? 'animate-spin' : ''} />
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
            color: connectionStatus.ok ? '#059669' : '#b45309',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          {isAutoDiscovering ? (
            <RefreshCw size={20} color="#059669" className="animate-spin" />
          ) : (
            <Search size={20} color={connectionStatus.ok ? '#059669' : '#b45309'} />
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
            color: '#64748b',
            cursor: 'pointer',
            padding: '6px 12px',
          }}
        >
          <Settings size={20} color="#64748b" />
          <span style={{ fontSize: '10px', fontWeight: 500 }}>Settings</span>
        </button>
      </nav>

      <BirthdayWishModal
        isOpen={isBirthdayModalOpen}
        onClose={() => setIsBirthdayModalOpen(false)}
        student={activeBirthdayStudent}
      />
    </div>
  );
}
