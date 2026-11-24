import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Settings,
  RefreshCw,
  Search,
  CheckCheck,
  Check,
  Camera,
  ArrowLeft,
  ChevronRight,
  Clock,
  X,
  WifiOff,
  QrCode,
  Lock,
  Users,
  AlertTriangle,
  Calendar,
  School,
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
  fetchStudentsFromHubDetailed,
  fetchExistingAttendanceFromHub,
  submitAttendanceToHub,
  getOfflineQueue,
  queueAttendanceOffline,
  flushOfflineQueue,
  pairDeviceWithHub,
  hubFetch,
} from '../lib/localWifiHubService';
import { useAcademySettings } from '../lib/academySettings';
import { groupBatchesByStandard } from '../lib/classHierarchyHelper';
import BirthdayWishModal from '../components/students/BirthdayWishModal';
import { isStudentBirthdayToday } from '../lib/telegramClient';
import { todayLocal } from '../lib/dateUtils';
import { version as APP_VERSION } from '../../package.json';
import '../teacher.css';

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

// The day's attendance records as last seen from the School PC (kept on the phone so counts show offline too).
// All counts on the class screens are worked out from these records, so they can never disagree with the PC.
const DAY_RECORDS_KEY_PREFIX = 'sms_day_records_v4_';

function getStoredDayRecords(date) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DAY_RECORDS_KEY_PREFIX + date) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredDayRecords(date, records) {
  try {
    localStorage.setItem(DAY_RECORDS_KEY_PREFIX + date, JSON.stringify(records));
  } catch {}
}

/** Key used for one class on the class screens. */
export const batchKey = (b) => String(b?.id || b?.code || b?.name || '').toUpperCase();

/**
 * Per-class counts for one day. A record belongs to a class when its batch_id / batch_code is that class's id or code.
 * One mark per student (the newest wins); "Pending" is not a mark. The class whose roll call is open uses the live
 * marks on screen instead of the saved ones.
 */
export function computeBatchStatuses(batches, records, live = null) {
  const latest = new Map();
  (records || []).forEach((r) => {
    if (!r || !r.status || r.status === 'Pending') return;
    const k = String(r.student_id || r.admission_no || '').toUpperCase();
    if (!k) return;
    const prev = latest.get(k);
    if (!prev || String(r.updated_at || '') >= String(prev.updated_at || '')) latest.set(k, r);
  });
  const out = {};
  (batches || []).forEach((b) => {
    const ids = [b.id, b.code].filter(Boolean).map((x) => String(x).toUpperCase());
    let present = 0;
    let absent = 0;
    let late = 0;
    const add = (st) => {
      if (st === 'Present') present++;
      else if (st === 'Absent') absent++;
      else if (st === 'Late') late++;
    };
    let total = typeof b.student_count === 'number' ? b.student_count : 0;
    if (live && live.key === batchKey(b)) {
      live.students.forEach((s) => add(live.map[s.id] || live.map[s.admission_no]));
      total = live.students.length || total;
    } else {
      latest.forEach((r) => {
        if (ids.includes(String(r.batch_id || '').toUpperCase()) || ids.includes(String(r.batch_code || '').toUpperCase())) add(r.status);
      });
    }
    const marked = present + absent + late;
    out[batchKey(b)] = { present, absent, late, total, pending: Math.max(0, total - marked), taken: marked > 0 };
  });
  return out;
}


// ---------------------------------------------------------------------------
// Small presentational pieces (all styling lives in src/teacher.css, classes start with tm-)
// ---------------------------------------------------------------------------

/** What the roll call shows for a student: Present / Late / Absent, or Pending when nothing is marked. */
const statusOf = (map, s) => map[s.id] || (s.admission_no ? map[s.admission_no] : null) || 'Pending';

const FILTERS = [
  ['all', 'All', ''],
  ['Pending', 'Pending', ''],
  ['Present', 'Present', 'ok'],
  ['Late', 'Late', 'warn'],
  ['Absent', 'Absent', 'bad'],
];

const fmtDay = (iso, long = false) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', long ? { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short' });
};

const badgeText = (s) => {
  const words = String(s || '').trim().split(/\s+/);
  const w = words.find((x) => /\d/.test(x)) || words[0] || '?'; // "Class 8" -> 8, "11th Commerce" -> 11th
  return w.length > 4 ? w.slice(0, 3) : w;
};

/** "Done" / "12/40 marked" / "Not taken" for a class or division. */
function StatusPill({ marked, total }) {
  const t = Math.max(total, marked);
  if (t > 0 && marked >= t) return <span className="tm-pill ok"><Check size={11} strokeWidth={3} />Done</span>;
  if (marked > 0) return <span className="tm-pill info">{marked}/{t} marked</span>;
  return <span className="tm-pill warn"><Clock size={11} />Not taken</span>;
}

/** One tappable class / division card with a progress bar. */
function ClassCard({ badge, name, meta, marked, absent, total, onClick }) {
  const t = Math.max(total, marked);
  const g = t > 0 ? Math.min(100, ((marked - absent) / t) * 100) : 0;
  const r = t > 0 ? Math.min(100 - g, (absent / t) * 100) : 0;
  const done = t > 0 && marked >= t;
  return (
    <button type="button" className={`tm-card${done ? ' done' : ''}`} onClick={onClick}>
      <div className="tm-card-top">
        <div className="tm-badge">{done ? <Check size={22} strokeWidth={3} /> : badge}</div>
        <div className="tm-card-body">
          <div className="tm-card-name">{name}</div>
          <div className="tm-card-meta">{meta}</div>
        </div>
        <ChevronRight size={20} className="tm-chev" />
      </div>
      <div className="tm-card-foot">
        <div className="tm-bar"><b className="g" style={{ width: `${g}%` }} /><b className="r" style={{ width: `${r}%` }} /></div>
        <StatusPill marked={marked} total={total} />
      </div>
    </button>
  );
}

/** Ring that shows how much of the school is marked today. */
function Ring({ pct }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="tm-ring">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="9" />
        <circle
          cx="48" cy="48" r={r} fill="none" stroke={pct >= 100 ? '#34d399' : '#dfcaa8'} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} style={{ transition: 'stroke-dashoffset .5s ease' }}
        />
      </svg>
      <div className="tm-ring-c"><b>{pct}%</b><span>marked</span></div>
    </div>
  );
}

/** Bottom sheet. Passing no onClose makes it undismissable (used for the "saved" confirmation). */
function Sheet({ title, onClose, center = false, children }) {
  return (
    <div className="tm-backdrop" onClick={onClose}>
      <div className={`tm-sheet${center ? ' center' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="tm-grab" />
        {!center && (
          <div className="tm-sheet-head">
            <h3>{title}</h3>
            {onClose && <button type="button" className="tm-sheet-x" onClick={onClose} aria-label="Close"><X size={18} /></button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * One student row. Memoised: a tap re-renders only the row whose status changed, not the whole class
 * (this is what makes a 100-student roll call stay smooth on a cheap phone).
 */
const StudentRow = React.memo(function StudentRow({ student, status, onSetStatus, onWish }) {
  const name = student.full_name || student.name || student['Student Name'] || `Student ${student.roll_no || student.admission_no}`;
  const birthday = isStudentBirthdayToday(student.dob);
  const mark = (cls, label, letter) => (
    <button type="button" className={`${cls}${status === label ? ' on' : ''}`} aria-label={label} aria-pressed={status === label} onClick={() => onSetStatus(student.id, label)}>
      {letter}
    </button>
  );
  return (
    <div className={`tm-row st-${status}`}>
      <div className="tm-roll">{student.roll_no || '-'}</div>
      <div className="tm-who">
        <div className="tm-name">{name}</div>
        <div className="tm-sub">
          <span>ID <code>{student.admission_no}</code></span>
          {birthday && <button type="button" className="tm-wish" onClick={() => onWish(student)}>🎂 Birthday · Wish</button>}
        </div>
      </div>
      <div className="tm-pla" role="group" aria-label={`Mark ${name}`}>
        {mark('p', 'Present', 'P')}
        {mark('l', 'Late', 'L')}
        {mark('a', 'Absent', 'A')}
      </div>
    </div>
  );
});

export default function TeacherAttendancePage() {
  const academySettings = useAcademySettings();
  const [hubUrl, setHubUrl] = useState(getStoredHubUrl());
  // The hub only serves data to phones that paired with the 6-digit code shown on the School PC.
  const [isPaired, setIsPaired] = useState(() => Boolean(getStoredHubToken()));
  const [pairCode, setPairCode] = useState('');
  const [pairError, setPairError] = useState('');
  const [isPairing, setIsPairing] = useState(false);
  useEffect(() => {
    const onUnpaired = () => setIsPaired(false);
    window.addEventListener('sms-hub-unpaired', onUnpaired);
    return () => window.removeEventListener('sms-hub-unpaired', onUnpaired);
  }, []);
  const [isAutoDiscovering, setIsAutoDiscovering] = useState(false);

  const [connectionStatus, setConnectionStatus] = useState({
    ok: false,
    state: 'checking', // 'checking' | 'connected' | 'wifi_disconnected' | 'pc_unreachable'
    url: hubUrl,
    error: null,
  });

  // Screens: 'batches' (class list) | 'divisions' (sections of one class) | 'rollcall' (students)
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
  const [selectedDate, setSelectedDate] = useState(() => todayLocal());
  // While the teacher has not picked another day, the app follows the calendar (an app left open overnight must not mark yesterday)
  const followTodayRef = useRef(true);
  const pickDate = useCallback((v) => {
    followTodayRef.current = v === todayLocal();
    setSelectedDate(v);
  }, []);
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

  // The day's records from the School PC (also kept on the phone for offline use)
  const [dayRecords, setDayRecords] = useState(() => getStoredDayRecords(todayLocal()));
  const dayRecordsRef = useRef(dayRecords);
  const saveDayRecords = useCallback((date, records) => {
    dayRecordsRef.current = records;
    setDayRecords(records);
    setStoredDayRecords(date, records);
  }, []);

  const [searchTerm, setSearchTerm] = useState(''); // student search inside a roll call
  const [statusFilter, setStatusFilter] = useState('all'); // all | Pending | Present | Late | Absent
  const [classQuery, setClassQuery] = useState(''); // class search on the Classes screen
  const [classFilter, setClassFilter] = useState('all'); // all | pending | done
  const [loadError, setLoadError] = useState(''); // the open class could not be loaded from the PC
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Professional Glass Toast Notification
  const [toast, setToast] = useState(null); // { id, message, type: 'success' | 'warning' | 'error' | 'info' }
  const toastTimerRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message: String(msg), type });
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
        showToast('Press back once more to exit');
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
          kickRef.current();
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
  const loadBatches = useCallback(async (targetUrl = hubUrl, silent = false) => {
    if (!silent) setIsLoading(true); // background refreshes must not blink the spinner or touch a class that is loading
    const list = await fetchBatchesFromHub(targetUrl);
    setBatches(Array.isArray(list) ? list : []);
    if (!silent) setIsLoading(false);
  }, [hubUrl]);

  // The newest values for the long-running background tasks below (they must never read stale ones)
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  // Refresh authoritative daily metrics across all batches from PC Hub with canonical deduplication
  const refreshHubMetrics = useCallback(async (targetUrl, date) => {
    const activeUrl = targetUrl || getStoredHubUrl();
    const day = date || selectedDateRef.current;
    if (!activeUrl) return;
    try {
      const res = await hubFetch(`${activeUrl.replace(/\/+$/, '')}/api/local-hub?action=updates&date=${encodeURIComponent(day)}`);
      if (res.ok) {
        const data = await res.json();
        const records = data.allRecords || data.records || [];
        if (Array.isArray(records)) saveDayRecords(day, records);
      }
    } catch {}
  }, [saveDayRecords]);

  // 2. Verify Connection with Smart Auto-Discovery.
  // Several checks can overlap (start-up, Wi-Fi back, app resume, a tap); only the newest one may update the screen.
  const verifySeqRef = useRef(0);
  const verifyConnection = useCallback(async (targetUrl = hubUrl, tryAutoScan = true) => {
    const seq = ++verifySeqRef.current;
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
        showToast('Connected to the School PC');
      }
    }

    if (seq !== verifySeqRef.current) return; // a newer check is running; its answer wins
    setConnectionStatus(res);
    const activeUrl = res?.ok ? res.url : (targetUrl || hubUrl);
    loadBatches(activeUrl);
    if (res?.ok) {
      refreshHubMetrics(activeUrl, selectedDateRef.current);
      flushOfflineQueue(activeUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    }
  }, [hubUrl, loadBatches, refreshHubMetrics, showToast]);

  useEffect(() => {
    verifyConnectionRef.current = verifyConnection;
    hubUrlRef.current = hubUrl;
  }, [verifyConnection, hubUrl]);

  useEffect(() => {
    verifyConnection(hubUrl, true);
  }, [hubUrl, verifyConnection]);

  // ---------------------------------------------------------------------------
  // Connection keeper: the phone watches the School PC all the time.
  //  - pings every 5 s; one missed ping is ignored (busy Wi-Fi), two in a row = "reconnecting"
  //  - then looks for the PC again (it may have restarted on another port or got a new Wi-Fi address)
  //  - the moment it is back: shows it, reloads the classes and sends any roll call waiting on the phone
  // ---------------------------------------------------------------------------
  const live = useRef({});
  live.current = { hubUrl, connectionStatus, isAutoDiscovering, loadBatches, refreshHubMetrics, students, activeBatch, selectedBatchId };
  const kickRef = useRef(() => {});
  useEffect(() => {
    let stopped = false;
    let pinging = false;
    let scanning = false;
    let misses = 0;
    let lastScan = 0;
    let lastBack = 0;
    let scanGap = 20000; // waits longer between full searches while the PC stays away (saves battery)

    const reconnected = async (r) => {
      misses = 0;
      scanGap = 20000;
      if (Date.now() - lastBack < 3000) return; // already handled a moment ago
      lastBack = Date.now();
      const L = live.current;
      setConnectionStatus(r);
      showToast('Reconnected to the School PC');
      L.loadBatches(r.url);
      L.refreshHubMetrics(r.url, selectedDateRef.current);
      if (L.syncDirty) L.syncDirty(); // marks tapped while the PC was away go out now
      try {
        const q = await flushOfflineQueue(r.url);
        setOfflineQueue(getOfflineQueue());
        if (q && q.flushedCount > 0) showToast(`Sent ${q.flushedCount} waiting roll call(s) to the School PC`);
      } catch {}
    };

    // Looking for a PC that moved (new Wi-Fi address or port). Slow, so it runs on the side: the quick
    // ping of the known address keeps going every 5 s and wins as soon as the PC answers there.
    const search = async () => {
      if (scanning || Date.now() - lastScan < scanGap) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return; // no Wi-Fi at all: nothing to search
      scanning = true;
      lastScan = Date.now();
      try {
        const disc = await autoDiscoverSchoolPC();
        if (stopped || live.current.connectionStatus.ok) return;
        if (disc?.ok && disc.url) {
          const r = await checkHubConnection(disc.url, false, { attempts: 2, timeout: 3500 });
          if (r.ok) {
            if (disc.url !== live.current.hubUrl) {
              setHubUrl(disc.url);
              setUrlInput(disc.url);
            }
            scanGap = 20000;
            await reconnected(r);
            return;
          }
        }
        scanGap = Math.min(scanGap * 1.5, 120000);
        if (Date.now() - lastBack > 3000) {
          setConnectionStatus((c) => (c.ok ? c : { ...c, ok: false, state: 'pc_unreachable', url: live.current.hubUrl, error: null }));
        }
      } catch {
        // never let the keeper stop; it tries again later
      } finally {
        scanning = false;
        lastScan = Date.now();
      }
    };

    const tick = async () => {
      if (stopped || pinging || document.hidden) return;
      const L = live.current;
      if (L.connectionStatus.state === 'checking' || L.isAutoDiscovering) return; // a manual check is already looking
      pinging = true;
      let lost = false;
      try {
        const url = L.hubUrl;
        if (url) {
          const r = await checkHubConnection(url, false, { attempts: 1, timeout: 3000 });
          if (stopped) return;
          if (r.ok) {
            if (!live.current.connectionStatus.ok) await reconnected(r);
            else {
              misses = 0;
              // keep the "licence paused" notice fresh without redrawing the screen every 5 s
              if (Boolean(r.data?.is_locked) !== Boolean(live.current.connectionStatus.data?.is_locked)) setConnectionStatus(r);
            }
            return;
          }
          misses += 1;
          lost = misses >= 2; // one missed ping is ignored
        } else {
          lost = true; // no PC saved yet: keep looking
        }
        if (lost && live.current.connectionStatus.ok) setConnectionStatus({ ok: false, state: 'reconnecting', url, error: null });
      } catch {
        // never let the keeper stop; it tries again on the next tick
      } finally {
        pinging = false;
      }
      if (lost) search();
    };

    kickRef.current = () => {
      lastScan = 0;
      tick();
    };
    const id = setInterval(tick, 5000);
    const wake = () => {
      if (!document.hidden) kickRef.current();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, [showToast]);

  // A new day started while the app was open or asleep: move to today (not while a roll call is open)
  useEffect(() => {
    const sync = () => {
      const t = todayLocal();
      if (followTodayRef.current && selectedDateRef.current !== t && viewModeRef.current !== 'rollcall') setSelectedDate(t);
    };
    const id = setInterval(sync, 30000);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  // One-tap manual trigger for local Wi-Fi auto-discovery
  const handleTriggerAutoDiscovery = async () => {
    setIsAutoDiscovering(true);
    showToast('Looking for the School PC on Wi-Fi…');
    const disc = await autoDiscoverSchoolPC();
    setIsAutoDiscovering(false);
    if (disc?.ok && disc?.url) {
      setStoredHubUrl(disc.url);
      setHubUrl(disc.url);
      setUrlInput(disc.url);
      verifyConnection(disc.url, false);
      showToast('Connected to ' + disc.url.replace(/^https?:\/\//, ''));
    } else {
      showToast('Could not find the School PC. Scan its QR code or type its address.', 'warning');
    }
  };

  // Continuous background refresh of cohorts while connected so PC changes show on Phone
  useEffect(() => {
    if (!connectionStatus.ok || viewMode !== 'batches') return;
    const interval = setInterval(() => {
      loadBatches(hubUrl, true);
      refreshHubMetrics(hubUrl, selectedDate);
    }, 4000);
    return () => clearInterval(interval);
  }, [connectionStatus.ok, viewMode, hubUrl, loadBatches, refreshHubMetrics, selectedDate]);

  // Note: Destructive 3-second poll in roll call mode removed to prevent clobbering active teacher edits

  // The School PC says this phone is no longer paired (e.g. the PC app was reinstalled)
  useEffect(() => {
    const onUnpaired = () => showToast('Please pair this phone again with the code on the School PC.', 'warning');
    window.addEventListener('sms-hub-unpaired', onUnpaired);
    return () => window.removeEventListener('sms-hub-unpaired', onUnpaired);
  }, [showToast]);

  // 3. Load Students when batch is opened & load existing attendance from PC
  const openSeqRef = useRef(0);
  const openBatchRollCall = async (batchId, standardName = null) => {
    const seq = ++openSeqRef.current;
    setSelectedBatchId(batchId);
    if (standardName) setSelectedStandard(standardName);
    setSearchTerm('');
    setStatusFilter('all');
    // Start clean so the previous class never shows under this class's name while the new one loads
    dirtyIdsRef.current = new Set();
    attendanceMapRef.current = {};
    setStudents([]);
    setAttendanceMap({});
    setLoadError('');
    setViewMode('rollcall');
    setIsLoading(true);

    try {
      window.history.pushState({ view: 'rollcall' }, '');
    } catch {}

    const detail = await fetchStudentsFromHubDetailed(batchId, hubUrl);
    if (seq !== openSeqRef.current) return; // another class was opened meanwhile
    const studentList = Array.isArray(detail.students) ? detail.students : [];
    setStudents(studentList);
    if (detail.failed && studentList.length === 0) setLoadError('Could not reach the School PC to load this class.');
    else if (detail.failed) showToast('School PC not reachable. Showing the copy saved on this phone.', 'warning');

    // Fetch existing attendance previously marked today on PC or phone
    const existingRecords = await fetchExistingAttendanceFromHub(batchId, selectedDate, hubUrl);
    if (seq !== openSeqRef.current) return;
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
    }

    // Marks the teacher already tapped while this was loading must not be wiped by the older copy from the PC
    const tapped = attendanceMapRef.current;
    const merged = { ...initialMap };
    dirtyIdsRef.current.forEach((id) => {
      if (tapped[id]) merged[id] = tapped[id];
    });
    attendanceMapRef.current = merged;
    setAttendanceMap(merged);
    setIsLoading(false);
  };

  // When date changes in roll call mode, re-fetch attendance for that date
  const handleDateChange = async (newDate) => {
    queueDirtyMarks(); // marks not yet confirmed by the PC belong to the old date: keep them safe first
    pickDate(newDate);
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
    }
    dirtyIdsRef.current = new Set();
    setAttendanceMap(map);
    setIsLoading(false);
  };

  // Auto-sync debounced ref
  const autoSyncTimerRef = useRef(null);
  // Students changed on this phone and not yet confirmed by the School PC. Only these are sent, and the
  // live refresh below never overwrites them (so a fast teacher is never "undone" by an older PC copy).
  const dirtyIdsRef = useRef(new Set());
  const attendanceMapRef = useRef(attendanceMap);
  useEffect(() => {
    attendanceMapRef.current = attendanceMap;
  }, [attendanceMap]);

  const syncRollCallToHubDebounced = useCallback(() => {
    const activeUrl = hubUrl || getStoredHubUrl();
    if (!activeUrl || !selectedBatchId) return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);

    autoSyncTimerRef.current = setTimeout(async () => {
      const map = attendanceMapRef.current;
      const ids = [...dirtyIdsRef.current];
      // Only the students this teacher actually changed, never "Pending" (that would wipe PC marks).
      const records = students
        .filter((s) => ids.includes(s.id) && map[s.id] && map[s.id] !== 'Pending')
        .map((s) => ({
          student_id: s.id,
          admission_no: s.admission_no || s.id,
          roll_no: s.roll_no,
          full_name: s.full_name || s.name || '',
          status: map[s.id],
          remarks: '',
          time_in: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        }));
      if (records.length === 0) return;
      try {
        const res = await submitAttendanceToHub(
          activeBatch?.id || selectedBatchId,
          selectedDate,
          records,
          activeUrl,
          { batch_code: getCanonicalBatchCode(activeBatch?.code || selectedBatchId), batch_name: activeBatch?.name || '' },
          false // failures stay "dirty" and are retried on the next tap or by the DONE button
        );
        if (res?.ok) {
          // Confirmed, unless the teacher changed that student again while we were sending.
          records.forEach((r) => {
            if (attendanceMapRef.current[r.student_id] === r.status) dirtyIdsRef.current.delete(r.student_id);
          });
        }
      } catch (err) {
        console.warn('Background auto-sync deferred:', err);
      }
    }, 300);
  }, [hubUrl, selectedBatchId, activeBatch, students, selectedDate]);
  live.current.syncDirty = syncRollCallToHubDebounced;

  // Marks the School PC has not confirmed yet go on the phone's waiting list, so they can never be lost
  // (back button, another class, another date, phone locked, app closed). They are sent as soon as the PC is reachable.
  const queueDirtyMarks = useCallback(() => {
    const L = live.current;
    const ids = dirtyIdsRef.current;
    if (!ids.size || !L.selectedBatchId) return;
    const map = attendanceMapRef.current;
    const stamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const records = (L.students || [])
      .filter((s) => ids.has(s.id) && map[s.id] && map[s.id] !== 'Pending')
      .map((s) => ({
        student_id: s.id,
        admission_no: s.admission_no || s.id,
        roll_no: s.roll_no,
        full_name: s.full_name || s.name || '',
        status: map[s.id],
        remarks: '',
        time_in: stamp,
      }));
    if (records.length === 0) return;
    const batchId = L.activeBatch?.id || L.selectedBatchId;
    const date = selectedDateRef.current;
    const waiting = getOfflineQueue().find((q) => q.batch_id === batchId && q.date === date);
    const byStudent = new Map((waiting?.records || []).map((r) => [r.student_id, r]));
    records.forEach((r) => byStudent.set(r.student_id, r));
    queueAttendanceOffline({
      batch_id: batchId,
      batch_code: getCanonicalBatchCode(L.activeBatch?.code || L.selectedBatchId),
      batch_name: L.activeBatch?.name || '',
      date,
      records: [...byStudent.values()],
    });
    setOfflineQueue(getOfflineQueue());
  }, []);
  const prevViewRef = useRef(viewMode);
  useEffect(() => {
    if (prevViewRef.current === 'rollcall' && viewMode !== 'rollcall') queueDirtyMarks();
    prevViewRef.current = viewMode;
  }, [viewMode, queueDirtyMarks]);
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) queueDirtyMarks();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', queueDirtyMarks);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', queueDirtyMarks);
    };
  }, [queueDirtyMarks]);

  // Live two-way sync: while a roll call is open, pick up marks made on the School PC (or another phone).
  useEffect(() => {
    if (viewMode !== 'rollcall' || !selectedBatchId || !connectionStatus.ok) return undefined;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy || (typeof document !== 'undefined' && document.hidden)) return;
      busy = true;
      try {
        const recs = await fetchExistingAttendanceFromHub(selectedBatchId, selectedDate, hubUrl);
        if (!Array.isArray(recs) || recs.length === 0) return;
        setAttendanceMap((prev) => {
          let changed = false;
          const next = { ...prev };
          recs.forEach((r) => {
            if (!r.status || r.status === 'Pending') return;
            const adm = String(r.admission_no || r.student_id || '').trim().toUpperCase();
            const st = students.find(
              (s) => s.id === r.student_id || (s.admission_no && String(s.admission_no).trim().toUpperCase() === adm)
            );
            if (!st || dirtyIdsRef.current.has(st.id) || next[st.id] === r.status) return;
            next[st.id] = r.status;
            changed = true;
          });
          return changed ? next : prev;
        });
      } catch {
        // PC momentarily unreachable: try again on the next tick
      } finally {
        busy = false;
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [viewMode, selectedBatchId, selectedDate, hubUrl, connectionStatus.ok, students]);

  // Toggle single student status (Present / Late / Absent)
  const setStudentStatus = (studentId, status) => {
    dirtyIdsRef.current.add(studentId);
    const next = { ...attendanceMapRef.current, [studentId]: status };
    attendanceMapRef.current = next;
    setAttendanceMap(next);
    syncRollCallToHubDebounced();
  };

  // Stable references for the memoised student cards (they always call the latest handlers).
  const latestHandlers = useRef({});
  latestHandlers.current = { setStudentStatus, setActiveBirthdayStudent, setIsBirthdayModalOpen };
  const onSetStatus = useCallback((id, st) => latestHandlers.current.setStudentStatus(id, st), []);
  const onWish = useCallback((student) => {
    latestHandlers.current.setActiveBirthdayStudent(student);
    latestHandlers.current.setIsBirthdayModalOpen(true);
  }, []);

  // Bulk actions: Mark All Present & Mark All Absent (Strictly 1 state per student)
  const markAllPresent = () => {
    const next = {};
    students.forEach((s) => {
      next[s.id] = 'Present';
      dirtyIdsRef.current.add(s.id);
    });
    attendanceMapRef.current = next;
    setAttendanceMap(next);
    syncRollCallToHubDebounced();
    showToast(`All ${students.length} students marked Present`);
  };

  const markAllAbsent = () => {
    const next = {};
    students.forEach((s) => {
      next[s.id] = 'Absent';
      dirtyIdsRef.current.add(s.id);
    });
    attendanceMapRef.current = next;
    setAttendanceMap(next);
    syncRollCallToHubDebounced();
    showToast(`All ${students.length} students marked Absent`);
  };

  // Metric Computations (Present, Late, Absent, Total) - strictly 1 state per student
  const totalCount = students.length;
  const { presentCount, lateCount, absentCount } = useMemo(() => {
    const c = { Present: 0, Late: 0, Absent: 0 };
    students.forEach((s) => {
      const st = statusOf(attendanceMap, s);
      if (st in c) c[st]++;
    });
    return { presentCount: c.Present, lateCount: c.Late, absentCount: c.Absent };
  }, [students, attendanceMap]);

  // Long classes appear instantly: draw the first 30 cards, then the rest a moment later.
  const [renderCount, setRenderCount] = useState(30);
  useEffect(() => { setRenderCount(30); }, [selectedBatchId, searchTerm, statusFilter]);

  // Filter students by the search box and the Pending / Present / Late / Absent tabs
  const filteredStudents = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return students.filter(
      (s) =>
        (statusFilter === 'all' || statusOf(attendanceMap, s) === statusFilter) &&
        (!term ||
          (s.full_name || s.name || '').toLowerCase().includes(term) ||
          String(s.roll_no || '').includes(term) ||
          String(s.admission_no || '').toLowerCase().includes(term))
    );
  }, [students, searchTerm, statusFilter, attendanceMap]);
  useEffect(() => {
    if (renderCount >= filteredStudents.length) return undefined;
    const t = setTimeout(() => setRenderCount((c) => c + 30), 60);
    return () => clearTimeout(t);
  }, [renderCount, filteredStudents.length]);

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

    const marked = records.filter((r) => r.status !== 'Pending'); // unmarked students must not wipe PC marks
    if (marked.length === 0) {
      setIsSubmitting(false);
      showToast('Mark at least one student first.', 'warning');
      return;
    }
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    const res = await submitAttendanceToHub(
      activeBatch.id || selectedBatchId,
      selectedDate,
      marked,
      hubUrl,
      {
        batch_code: activeBatch.code || selectedBatchId,
        batch_name: activeBatch.name || '',
      }
    );
    setIsSubmitting(false);

    // Show the saved marks on the class screens straight away (the PC's copy replaces this on the next refresh)
    if (res.ok || res.queued) {
      const now = new Date().toISOString();
      const ids = new Set(marked.map((r) => r.student_id));
      saveDayRecords(selectedDate, [
        ...dayRecordsRef.current.filter((r) => !ids.has(r.student_id)),
        ...marked.map((r) => ({ ...r, batch_id: activeBatch.id || selectedBatchId, batch_code: activeBatch.code || '', date: selectedDate, updated_at: now })),
      ]);
    }

    setSavedSummary({
      batchName: activeBatch.name || 'Current Class',
      date: selectedDate,
      total: totalCount,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      syncedToPc: Boolean(res.ok),
      notSyncedReason: res.ok ? '' : res.error || '',
    });

    if (res.ok) {
      // Cleared only for students unchanged since the tap; a mark changed while saving still has to go out
      marked.forEach((r) => {
        if (attendanceMapRef.current[r.student_id] === r.status) dirtyIdsRef.current.delete(r.student_id);
      });
      setShowSuccessModal(true);
      setOfflineQueue(getOfflineQueue());
      flushOfflineQueue(hubUrl).then((r) => {
        if (r && r.flushedCount > 0) {
          setOfflineQueue(getOfflineQueue());
        }
      }).catch(() => {});
    } else if (res.queued) {
      setShowSuccessModal(true);
      setOfflineQueue(getOfflineQueue());
    } else {
      showToast('Could not save attendance: ' + (res.error || 'Connection failed'), 'error');
    }
  };

  const handleFlushQueue = async () => {
    setIsFlushingQueue(true);
    const res = await flushOfflineQueue(hubUrl);
    setIsFlushingQueue(false);
    setOfflineQueue(getOfflineQueue());
    if (res.ok && res.flushedCount > 0) {
      showToast(`Sent ${res.flushedCount} waiting roll call(s) to the School PC`);
    } else if (res.remainingCount > 0) {
      showToast(`Could not reach the School PC. ${res.remainingCount} roll call(s) still waiting on this phone.`, 'warning');
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
          setIsPaired(true);
        }
        setHubUrl(target);
        setUrlInput(target);
        showToast(`Scanned. Connecting to ${target.replace(/^https?:\/\//, '')}`);
        verifyConnection(target, false);

        // Automatically flush pending queue if connected
        flushOfflineQueue(target).then((r) => {
          if (r.flushedCount > 0) {
            showToast(`Sent ${r.flushedCount} waiting roll call(s) to the School PC`);
            setOfflineQueue(getOfflineQueue());
          }
        });
      } catch {
        showToast('Scanned code: ' + rawText);
      }
    },
    [verifyConnection, showToast]
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
    return sum;
  }, [uniqueBatches, connectionStatus]);

  // Class cards and the top counters, worked out from the day's records (+ the live marks of the open roll call)
  const batchStatuses = useMemo(
    () =>
      computeBatchStatuses(
        uniqueBatches,
        dayRecords,
        viewMode === 'rollcall' && activeBatch ? { key: batchKey(activeBatch), students, map: attendanceMap } : null
      ),
    [uniqueBatches, dayRecords, viewMode, activeBatch, students, attendanceMap]
  );
  const dailyMetrics = useMemo(() => {
    let present = 0;
    let absent = 0;
    let late = 0;
    let sumTotal = 0;
    Object.values(batchStatuses).forEach((b) => {
      present += b.present;
      absent += b.absent;
      late += b.late;
      sumTotal += b.total;
    });
    const total = Math.max(schoolTotalStudents, sumTotal);
    return { total, present, absent, late, pending: Math.max(0, total - present - absent - late) };
  }, [batchStatuses, schoolTotalStudents]);

  // Another date picked: show what the phone knows for it at once, then ask the PC
  const firstDateRef = useRef(true);
  useEffect(() => {
    if (firstDateRef.current) {
      firstDateRef.current = false;
      return;
    }
    dayRecordsRef.current = getStoredDayRecords(selectedDate);
    setDayRecords(dayRecordsRef.current);
    if (connectionStatus.ok) refreshHubMetrics(hubUrl, selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // On the class screens keep the counts live (roll calls taken on the PC or other phones show up within seconds)
  useEffect(() => {
    if (viewMode === 'rollcall' || !connectionStatus.ok) return undefined;
    refreshHubMetrics(hubUrl, selectedDate);
    const t = setInterval(() => {
      if (!document.hidden) refreshHubMetrics(hubUrl, selectedDate);
    }, 5000);
    return () => clearInterval(t);
  }, [viewMode, connectionStatus.ok, hubUrl, selectedDate, refreshHubMetrics]);


  // ---------------------------------------------------------------------------
  // Screen helpers
  // ---------------------------------------------------------------------------
  const goBack = () => setViewMode(activeStandardGroup?.hasMultipleSections ? 'divisions' : 'batches');
  const openScanner = () => {
    setCameraError('');
    setShowCameraScanner(true);
  };
  const refreshAll = () => {
    verifyConnection(hubUrl);
    if (offlineQueue.length > 0) handleFlushQueue();
  };
  const connectManually = (raw) => {
    let clean = String(raw || '').trim().replace(/\/+$/, '');
    if (!clean) {
      showToast('Type the School PC address first.', 'warning');
      return;
    }
    if (!/^https?:\/\//i.test(clean)) clean = `http://${clean}`;
    setStoredHubUrl(clean);
    setHubUrl(clean);
    setUrlInput(clean);
    setShowSettingsModal(false);
    verifyConnection(clean, false);
  };
  const handlePair = async () => {
    setPairError('');
    setIsPairing(true);
    const r = await pairDeviceWithHub(hubUrl, pairCode);
    setIsPairing(false);
    if (!r.ok) {
      setPairError(r.error);
      return;
    }
    setIsPaired(true);
    setPairCode('');
    showToast('Phone paired with School PC');
    verifyConnection(hubUrl, false);
  };

  // New screen = start at the top; open sheets freeze the page behind them
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [viewMode]);
  useEffect(() => {
    document.documentElement.classList.add('tm-root');
    return () => document.documentElement.classList.remove('tm-root');
  }, []);
  const sheetOpen = showCameraScanner || showSettingsModal || showSuccessModal;
  useEffect(() => {
    document.documentElement.style.overflow = sheetOpen ? 'hidden' : '';
    return () => {
      document.documentElement.style.overflow = '';
    };
  }, [sheetOpen]);

  // Class cards: one per standard, with its day's numbers added up from the divisions
  const groupCards = useMemo(
    () =>
      standardGroups.map((group) => {
        let p = 0;
        let a = 0;
        let total = 0;
        group.sections.forEach((b) => {
          const st = batchStatuses[batchKey(b)];
          if (!st) return;
          p += st.present + st.late;
          a += st.absent;
          total += st.total;
        });
        const marked = p + a;
        const t = Math.max(total, marked);
        return { group, p, a, marked, total: t, done: t > 0 && marked >= t };
      }),
    [standardGroups, batchStatuses]
  );
  const visibleGroups = useMemo(() => {
    const term = classQuery.trim().toLowerCase();
    return groupCards.filter((c) => {
      if (classFilter === 'pending' && c.done) return false;
      if (classFilter === 'done' && !c.done) return false;
      if (!term) return true;
      return (
        c.group.standardName.toLowerCase().includes(term) ||
        c.group.sections.some(
          (b) => b.name?.toLowerCase().includes(term) || b.code?.toLowerCase().includes(term) || String(b.section || '').toLowerCase().includes(term)
        )
      );
    });
  }, [groupCards, classQuery, classFilter]);
  const doneGroups = groupCards.filter((c) => c.done).length;

  const markedCount = presentCount + lateCount + absentCount;
  const pendingCount = Math.max(0, totalCount - markedCount);
  const filterCounts = { all: totalCount, Pending: pendingCount, Present: presentCount, Late: lateCount, Absent: absentCount };
  const markedToday = dailyMetrics.present + dailyMetrics.late + dailyMetrics.absent;
  const todayPct = dailyMetrics.total > 0 ? Math.min(100, Math.round((markedToday / dailyMetrics.total) * 100)) : 0;
  const isToday = selectedDate === todayLocal();

  const connWaiting = connectionStatus.state === 'checking' || connectionStatus.state === 'reconnecting';
  const connState = connectionStatus.ok ? 'ok' : connWaiting ? 'wait' : 'bad';
  const connText = connectionStatus.ok
    ? 'Connected to School PC'
    : connectionStatus.state === 'reconnecting'
    ? 'Reconnecting to School PC…'
    : connectionStatus.state === 'checking'
    ? 'Looking for School PC…'
    : connectionStatus.state === 'wifi_disconnected'
    ? 'Wi-Fi is off'
    : 'School PC not found · tap to connect';
  const hubLocked = Boolean(connectionStatus.ok && (connectionStatus.data?.is_locked || connectionStatus.data?.isLocked));
  const needsConnect = !connectionStatus.ok && !connWaiting;
  const hasClasses = uniqueBatches.length > 0;

  const groupMeta = (c) => (
    <>
      <span className="u"><Users size={12} />{c.total} students</span>
      {c.group.hasMultipleSections && <span>Divisions {c.group.sections.map((x) => x.section).join(', ')}</span>}
      {c.marked > 0 && (
        <span>
          <span className="p">{c.p} present</span> · <span className="a">{c.a} absent</span>
        </span>
      )}
    </>
  );

  return (
    <div className="tm-app">
      {/* Toast */}
      {toast && (
        <div className={`tm-toast ${toast.type}`} key={toast.id} role="status">
          <div className="tm-toast-in">
            <div className="tm-toast-ico">
              {toast.type === 'error' ? <XCircle size={18} /> : toast.type === 'warning' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            </div>
            <div className="tm-toast-msg">{toast.message}</div>
            <button type="button" className="tm-toast-x" onClick={() => setToast(null)} aria-label="Dismiss"><X size={16} /></button>
          </div>
        </div>
      )}

      {/* ------------------------------ Top bar ------------------------------ */}
      {viewMode === 'batches' && (
        <header className="tm-top">
          <div className="tm-wrap">
            <div className="tm-top-row">
              <img className="tm-logo" src={academySettings.logo_url || '/logo.svg'} alt="" />
              <div className="tm-brand">
                <div className="tm-brand-name">{academySettings.academy_name || 'Student Management System'}</div>
                <button type="button" className={`tm-conn ${connState}`} onClick={() => setShowSettingsModal(true)}>
                  <i />
                  <span>{connText}</span>
                </button>
              </div>
              {isLoading && <RefreshCw size={18} className="tm-spin" color="#9fb0cc" style={{ flexShrink: 0 }} />}
            </div>
          </div>
        </header>
      )}

      {viewMode === 'divisions' && activeStandardGroup && (
        <header className="tm-top">
          <div className="tm-wrap">
            <div className="tm-top-row">
              <button type="button" className="tm-iconbtn" onClick={() => setViewMode('batches')} aria-label="Back to all classes"><ArrowLeft size={22} /></button>
              <div className="tm-title">
                <h1>{activeStandardGroup.standardName}</h1>
                <p>{activeStandardGroup.sections.length} divisions · {activeStandardGroup.totalStudents} students</p>
              </div>
              {isLoading && <RefreshCw size={18} className="tm-spin" color="#9fb0cc" style={{ flexShrink: 0 }} />}
            </div>
          </div>
        </header>
      )}

      {viewMode === 'rollcall' && (
        <header className="tm-top">
          <div className="tm-wrap">
            <div className="tm-top-row">
              <button type="button" className="tm-iconbtn" onClick={goBack} aria-label="Back"><ArrowLeft size={22} /></button>
              <div className="tm-title">
                <h1>{activeBatch.name || activeBatch.code || 'Roll call'}</h1>
                <p>{[activeBatch.code, activeBatch.classroom, activeBatch.timing].filter(Boolean).join(' · ') || 'Take roll call'}</p>
              </div>
              <span className={`tm-dot ${connState}`} role="img" aria-label={connText} title={connText} />
              <span className={`tm-ratio${totalCount > 0 && pendingCount === 0 ? ' full' : ''}`}>{markedCount}/{totalCount}</span>
            </div>
            <div className="tm-topbar" aria-hidden="true">
              <b style={{ width: `${totalCount ? (presentCount / totalCount) * 100 : 0}%`, background: '#34d399' }} />
              <b style={{ width: `${totalCount ? (lateCount / totalCount) * 100 : 0}%`, background: '#fbbf24' }} />
              <b style={{ width: `${totalCount ? (absentCount / totalCount) * 100 : 0}%`, background: '#f87171' }} />
            </div>
          </div>
        </header>
      )}

      {/* ----------------------------- 1. Classes ----------------------------- */}
      {viewMode === 'batches' && (
        <main key="batches" className="tm-main tm-wrap tm-screen">
          {hubLocked && (
            <div className="tm-banner bad">
              <Lock size={20} />
              <span>The school's licence is paused, so roll call cannot be saved right now. Please tell the school office.</span>
            </div>
          )}

          {offlineQueue && offlineQueue.length > 0 && (
            <div className="tm-banner warn">
              <Clock size={20} />
              <span>{offlineQueue.length} roll call{offlineQueue.length > 1 ? 's' : ''} waiting on this phone.</span>
              <button type="button" className="tm-btn ok" onClick={handleFlushQueue} disabled={isFlushingQueue}>
                {isFlushingQueue ? 'Sending…' : 'Send now'}
              </button>
            </div>
          )}

          {needsConnect && (
            <section className="tm-panel">
              <div className="tm-panel-ico">{connectionStatus.state === 'wifi_disconnected' ? <WifiOff size={26} /> : <School size={26} />}</div>
              <h3>{connectionStatus.state === 'wifi_disconnected' ? 'Join the school Wi-Fi' : 'Connect to your School PC'}</h3>
              <p>
                {hubUrl
                  ? `Cannot reach the School PC at ${hubUrl.replace(/^https?:\/\//, '')}. Make sure the SMS app is open on the PC and this phone is on the same school Wi-Fi.`
                  : 'Open the SMS app on the School PC. This phone and the PC must be on the same school Wi-Fi.'}
              </p>
              <button type="button" className="tm-btn primary block" onClick={handleTriggerAutoDiscovery} disabled={isAutoDiscovering}>
                {isAutoDiscovering ? <RefreshCw size={18} className="tm-spin" /> : <Sparkles size={18} />}
                {isAutoDiscovering ? 'Looking for the School PC…' : 'Find School PC automatically'}
              </button>
              <div className="tm-or">OR</div>
              <button type="button" className="tm-btn ghost block" onClick={openScanner}>
                <Camera size={18} />Scan the QR code on the PC
              </button>
              <div className="tm-field">
                <span>Or type the PC address</span>
                <div className="tm-row2">
                  <input
                    className="tm-input mono"
                    type="text"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="192.168.0.104:5173"
                  />
                  <button type="button" className="tm-btn soft" onClick={() => connectManually(urlInput)}>Connect</button>
                </div>
              </div>
            </section>
          )}

          {connectionStatus.ok && !isPaired && (
            <section className="tm-panel">
              <div className="tm-panel-ico"><Lock size={26} /></div>
              <h3>Pair this phone</h3>
              <p>On the School PC open <b>Connect Teacher App</b> and type the 6-digit code here, or scan its QR code.</p>
              <input
                className="tm-input otp"
                style={{ marginTop: 14 }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                aria-label="6-digit pairing code"
              />
              {pairError && <div className="tm-err">{pairError}</div>}
              <button type="button" className="tm-btn primary block" disabled={pairCode.length !== 6 || isPairing} onClick={handlePair}>
                {isPairing ? <RefreshCw size={18} className="tm-spin" /> : <CheckCircle2 size={18} />}
                {isPairing ? 'Pairing…' : 'Pair phone'}
              </button>
              <div className="tm-or">OR</div>
              <button type="button" className="tm-btn ghost block" onClick={openScanner}>
                <Camera size={18} />Scan QR code
              </button>
            </section>
          )}

          {hasClasses && (
            <section className="tm-hero" aria-label="Today at a glance">
              <div className="tm-hero-head">
                <div>
                  <div className="tm-kicker">{isToday ? 'Today' : 'Selected day'}</div>
                  <div className="tm-hero-date">{fmtDay(selectedDate, true)}</div>
                </div>
                <label className="tm-datepick">
                  <Calendar size={16} />
                  Change
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => e.target.value && pickDate(e.target.value)}
                    aria-label="Choose date"
                  />
                </label>
              </div>
              <div className="tm-hero-body">
                <Ring pct={todayPct} />
                <div className="tm-stats">
                  <div className="tm-stat ok"><b>{dailyMetrics.present + dailyMetrics.late}</b><span>Present</span></div>
                  <div className="tm-stat bad"><b>{dailyMetrics.absent}</b><span>Absent</span></div>
                  <div className="tm-stat warn"><b>{dailyMetrics.pending}</b><span>Pending</span></div>
                  <div className="tm-stat"><b>{schoolTotalStudents}</b><span>Enrolled</span></div>
                </div>
              </div>
              {!isToday && (
                <div className="tm-today-reset"><button type="button" onClick={() => pickDate(todayLocal())}>Back to today</button></div>
              )}
            </section>
          )}

          {hasClasses ? (
            <>
              <div className="tm-sec">
                <h2>Classes</h2>
                <span>{doneGroups} of {groupCards.length} done</span>
              </div>
              <label className="tm-search">
                <Search size={18} />
                <input
                  type="text"
                  placeholder="Search classes"
                  value={classQuery}
                  onChange={(e) => setClassQuery(e.target.value)}
                  aria-label="Search classes"
                />
                {classQuery && <button type="button" onClick={() => setClassQuery('')} aria-label="Clear search"><X size={14} /></button>}
              </label>
              <div className="tm-tabs" role="tablist">
                {[['all', `All ${groupCards.length}`], ['pending', `To do ${groupCards.length - doneGroups}`], ['done', `Done ${doneGroups}`]].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={classFilter === id} className={`tm-tab${classFilter === id ? ' on' : ''}`} onClick={() => setClassFilter(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {visibleGroups.length === 0 ? (
                <div className="tm-empty">
                  <div className="tm-empty-ico"><Search size={26} /></div>
                  <h3>No class found</h3>
                  <p>{classQuery ? `Nothing matches "${classQuery}".` : classFilter === 'done' ? 'No class is finished yet.' : 'Every class is done. Well done!'}</p>
                  {(classQuery || classFilter !== 'all') && (
                    <button type="button" className="tm-btn soft sm" onClick={() => { setClassQuery(''); setClassFilter('all'); }}>Show all classes</button>
                  )}
                </div>
              ) : (
                <div className="tm-list">
                  {visibleGroups.map((c) => (
                    <ClassCard
                      key={c.group.standardName}
                      badge={badgeText(c.group.standardName)}
                      name={c.group.standardName}
                      meta={groupMeta(c)}
                      marked={c.marked}
                      absent={c.a}
                      total={c.total}
                      onClick={() => {
                        if (c.group.hasMultipleSections) {
                          setSelectedStandard(c.group.standardName);
                          setViewMode('divisions');
                        } else {
                          const single = c.group.sections[0];
                          openBatchRollCall(single.id || single.code, c.group.standardName);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          ) : connWaiting || isLoading ? (
            <div className="tm-list" aria-label="Loading classes">
              <div className="tm-skel" />
              <div className="tm-skel" />
              <div className="tm-skel" />
            </div>
          ) : connectionStatus.ok ? (
            <div className="tm-empty">
              <div className="tm-empty-ico"><School size={28} /></div>
              <h3>No classes yet</h3>
              <p>Add classes and students on the School PC. They will appear here in a moment.</p>
              <button type="button" className="tm-btn soft sm" onClick={refreshAll}><RefreshCw size={16} />Refresh</button>
            </div>
          ) : null}
        </main>
      )}

      {/* ---------------------------- 2. Divisions ---------------------------- */}
      {viewMode === 'divisions' && activeStandardGroup && (
        <main key="divisions" className="tm-main tm-wrap tm-screen">
          <div className="tm-sec">
            <h2>Choose a division</h2>
            <span>Tap to take roll call</span>
          </div>
          <div className="tm-list">
            {activeStandardGroup.sections.map((batch) => {
              const st = batchStatuses[batchKey(batch)] || { present: 0, late: 0, absent: 0, total: 0 };
              const marked = st.present + st.late + st.absent;
              return (
                <ClassCard
                  key={batch.code || batch.id}
                  badge={String(batch.section || 'A').slice(0, 3)}
                  name={batch.displayName || batch.name}
                  meta={
                    <>
                      <span className="u"><Users size={12} />{st.total || batch.student_count || 0} students</span>
                      {batch.timing && <span>{batch.timing}</span>}
                      {marked > 0 && (
                        <span>
                          <span className="p">{st.present + st.late} present</span> · <span className="a">{st.absent} absent</span>
                        </span>
                      )}
                    </>
                  }
                  marked={marked}
                  absent={st.absent}
                  total={st.total || batch.student_count || 0}
                  onClick={() => openBatchRollCall(batch.id || batch.code, activeStandardGroup.standardName)}
                />
              );
            })}
          </div>
        </main>
      )}

      {/* ----------------------------- 3. Roll call ----------------------------- */}
      {viewMode === 'rollcall' && (
        <main key="rollcall" className="tm-main roll tm-wrap tm-screen">
          {!connectionStatus.ok && !loadError && (
            <div className="tm-banner warn">
              <WifiOff size={20} />
              <span>{connWaiting ? 'Reconnecting to the School PC…' : 'School PC not reachable.'} You can keep marking. Everything is kept on this phone and sent when the PC is back.</span>
            </div>
          )}
          <div className="tm-tools">
            <label className="tm-datechip">
              <Calendar size={16} />
              {fmtDay(selectedDate)}
              <input type="date" value={selectedDate} onChange={(e) => e.target.value && handleDateChange(e.target.value)} aria-label="Choose date" />
            </label>
            <div className="tm-bulk">
              <button type="button" className="ok" onClick={markAllPresent} disabled={totalCount === 0}><CheckCheck size={16} />All present</button>
              <button type="button" className="bad" onClick={markAllAbsent} disabled={totalCount === 0}><XCircle size={16} />All absent</button>
            </div>
          </div>

          <div className="tm-chips" role="tablist" aria-label="Filter students">
            {FILTERS.map(([id, label, tone]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={statusFilter === id}
                className={`tm-chip ${tone}${statusFilter === id ? ' on' : ''}`}
                onClick={() => setStatusFilter(id)}
              >
                <b>{filterCounts[id]}</b>
                <span>{label}</span>
              </button>
            ))}
          </div>

          <label className="tm-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search name, roll no or ID"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search students"
            />
            {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label="Clear search"><X size={14} /></button>}
          </label>

          {students.length > 0 && (
            <div className="tm-legend" aria-hidden="true">
              <span className="p"><b>P</b> Present</span>
              <span className="l"><b>L</b> Late</span>
              <span className="a"><b>A</b> Absent</span>
            </div>
          )}

          <div className="tm-rows">
            {filteredStudents.length === 0 ? (
              loadError ? (
                <div className="tm-empty">
                  <div className="tm-empty-ico"><WifiOff size={28} /></div>
                  <h3>Could not load this class</h3>
                  <p>{loadError} Check the Wi-Fi and try again.</p>
                  <button type="button" className="tm-btn primary sm" onClick={() => openBatchRollCall(selectedBatchId, selectedStandard)}>
                    <RefreshCw size={16} />Try again
                  </button>
                </div>
              ) : isLoading && students.length === 0 ? (
                <>
                  <div className="tm-skel" style={{ height: 68 }} />
                  <div className="tm-skel" style={{ height: 68 }} />
                  <div className="tm-skel" style={{ height: 68 }} />
                  <div className="tm-skel" style={{ height: 68 }} />
                </>
              ) : (
                <div className="tm-empty">
                  <div className="tm-empty-ico"><Users size={28} /></div>
                  <h3>{students.length === 0 ? 'No students in this class' : 'No students here'}</h3>
                  <p>
                    {students.length === 0
                      ? 'Add students to this class on the School PC and they will show up here.'
                      : searchTerm.trim()
                      ? `Nobody matches "${searchTerm}".`
                      : `Nobody is marked ${statusFilter === 'Pending' ? 'pending' : statusFilter.toLowerCase()} right now.`}
                  </p>
                  {students.length > 0 && (searchTerm || statusFilter !== 'all') && (
                    <button type="button" className="tm-btn soft sm" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}>Show everyone</button>
                  )}
                </div>
              )
            ) : (
              filteredStudents.slice(0, renderCount).map((student) => (
                <StudentRow key={student.id} student={student} status={statusOf(attendanceMap, student)} onSetStatus={onSetStatus} onWish={onWish} />
              ))
            )}
          </div>

          <div className="tm-savebar">
            <div className="tm-wrap">
              <div className="tm-savebar-info">
                <span><b>{markedCount}</b> of {totalCount} marked</span>
                <span>{pendingCount > 0 ? `${pendingCount} left` : totalCount > 0 ? 'Everyone marked' : ''}</span>
              </div>
              <button
                type="button"
                className={`tm-btn block ${pendingCount === 0 && totalCount > 0 ? 'ok' : 'primary'}`}
                onClick={handleSubmit}
                disabled={isSubmitting || students.length === 0 || markedCount === 0}
              >
                {isSubmitting ? <RefreshCw size={18} className="tm-spin" /> : <CheckCircle2 size={18} />}
                {isSubmitting ? 'Saving…' : `Save · ${presentCount + lateCount} present · ${absentCount} absent`}
              </button>
            </div>
          </div>
        </main>
      )}

      {/* ------------------------------ Bottom nav ------------------------------ */}
      {viewMode !== 'rollcall' && (
        <nav className="tm-nav" aria-label="Main">
          <div className="tm-nav-in">
            <button type="button" className={`tm-navbtn${viewMode === 'batches' || viewMode === 'divisions' ? ' on' : ''}`} onClick={() => setViewMode('batches')}>
              <i><School size={22} /></i>Classes
            </button>
            <button type="button" className="tm-navbtn" onClick={openScanner}>
              <i><Camera size={22} /></i>Scan QR
            </button>
            <button type="button" className="tm-navbtn" onClick={refreshAll}>
              <i><RefreshCw size={22} className={isLoading || isFlushingQueue ? 'tm-spin' : ''} /></i>Refresh
              {offlineQueue.length > 0 && <em>{offlineQueue.length}</em>}
            </button>
            <button type="button" className="tm-navbtn" onClick={() => setShowSettingsModal(true)}>
              <i><Settings size={22} /></i>Settings
            </button>
          </div>
        </nav>
      )}

      {/* -------------------------------- Sheets -------------------------------- */}
      {showCameraScanner && (
        <Sheet title="Scan School PC QR" onClose={() => setShowCameraScanner(false)}>
          <p className="lead">Point the camera at the QR code shown in <b>Connect Teacher App</b> on the School PC.</p>
          <div id="qr-reader" />
          {cameraError && <div className="tm-err">{cameraError}</div>}
        </Sheet>
      )}

      {showSuccessModal && savedSummary && (
        <Sheet center>
          <div className={`tm-done-ico${savedSummary.syncedToPc === false ? ' warn' : ''}`}>
            {savedSummary.syncedToPc === false ? <Clock size={36} /> : <Check size={38} strokeWidth={3} />}
          </div>
          <h3 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>
            {savedSummary.syncedToPc === false ? 'Saved on this phone' : 'Roll call saved'}
          </h3>
          <p className="lead">
            {savedSummary.batchName} · {fmtDay(savedSummary.date)}
            <br />
            {savedSummary.syncedToPc === false
              ? `Not on the School PC yet. ${savedSummary.notSyncedReason || ''} It will be sent automatically when the phone reaches the PC.`
              : 'Attendance is now on the School PC.'}
          </p>
          <div className="tm-sum">
            <div><b>{savedSummary.total}</b><span>Total</span></div>
            <div className="ok"><b>{savedSummary.present}</b><span>Present</span></div>
            <div className="late"><b>{savedSummary.late}</b><span>Late</span></div>
            <div className="bad"><b>{savedSummary.absent}</b><span>Absent</span></div>
          </div>
          <div className="tm-stack">
            <button
              type="button"
              className="tm-btn primary block"
              onClick={() => {
                setShowSuccessModal(false);
                setViewMode('batches');
                loadBatches(hubUrl);
              }}
            >
              Back to classes
            </button>
          </div>
        </Sheet>
      )}

      {showSettingsModal && (
        <Sheet title="School PC connection" onClose={() => setShowSettingsModal(false)}>
          <p className="lead">This phone and the School PC must be on the same school Wi-Fi.</p>
          <div className={`tm-status-card ${connState}`}>
            {connectionStatus.ok ? <CheckCircle2 size={24} color="#059669" /> : connWaiting ? <RefreshCw size={22} className="tm-spin" color="#64748b" /> : <WifiOff size={24} color="#dc2626" />}
            <div style={{ minWidth: 0 }}>
              <strong>{connectionStatus.ok ? 'Connected' : connWaiting ? 'Looking for the School PC…' : 'Not connected'}</strong>
              <small>{hubUrl ? hubUrl.replace(/^https?:\/\//, '') : 'No School PC saved yet'}</small>
            </div>
          </div>
          <label className="tm-field">
            <span>School PC address</span>
            <input
              className="tm-input mono"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="192.168.0.104:5173"
            />
          </label>
          {urlInput && <button type="button" className="tm-link" onClick={() => setUrlInput('')}>Clear address</button>}
          <div className="tm-stack">
            <button type="button" className="tm-btn primary block" onClick={() => connectManually(urlInput)}>Connect</button>
            <button
              type="button"
              className="tm-btn soft block"
              onClick={() => {
                setShowSettingsModal(false);
                handleTriggerAutoDiscovery();
              }}
              disabled={isAutoDiscovering}
            >
              <Sparkles size={18} />Find School PC automatically
            </button>
            <button type="button" className="tm-btn soft block" onClick={() => { setShowSettingsModal(false); openScanner(); }}>
              <QrCode size={18} />Scan QR code
            </button>
          </div>
          <div className="tm-ver">SMS Teacher · v{APP_VERSION} · {isPaired ? 'Paired with School PC' : 'Not paired yet'}</div>
        </Sheet>
      )}

      <BirthdayWishModal isOpen={isBirthdayModalOpen} onClose={() => setIsBirthdayModalOpen(false)} student={activeBirthdayStudent} />
    </div>
  );
}
