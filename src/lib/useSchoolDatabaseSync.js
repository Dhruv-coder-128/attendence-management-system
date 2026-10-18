import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabase.js';
import { isTauriDesktop } from './licenseService.js';

let cachedHubUrl = 'http://127.0.0.1:5173';
let cachedHubToken = '';
let cachedResolvedHub = null;
let lastResolveTimestamp = 0;

/**
 * Resolves the active native LAN hub server URL and credentials.
 * Automatically queries Tauri IPC when executing inside the packaged Windows EXE.
 * Cached in-memory to prevent redundant IPC queries on continuous poll loops.
 */
export async function resolveHubInfo(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedResolvedHub && (now - lastResolveTimestamp < 15000)) {
    return cachedResolvedHub;
  }

  if (typeof window !== 'undefined' && isTauriDesktop()) {
    try {
      const invoke =
        window.__TAURI_INTERNALS__?.invoke ||
        window.__TAURI__?.core?.invoke ||
        (window.__TAURI__ && window.__TAURI__.invoke);
      if (typeof invoke === 'function') {
        const info = await invoke('get_hub_server_info');
        if (info && info.port > 0) {
          cachedHubUrl = `http://127.0.0.1:${info.port}`;
          cachedHubToken = info.token || '';
          cachedResolvedHub = {
            url: cachedHubUrl,
            token: cachedHubToken,
            port: info.port,
            localIp: info.local_ip,
            otp: info.pairing_otp || '',
            registeredDevicesCount: info.registered_devices_count || 0,
            running: true,
          };
          lastResolveTimestamp = now;
          return cachedResolvedHub;
        }
      }
    } catch (err) {
      console.warn('Could not query Tauri hub server info:', err);
    }
  }

  // Fallback for Vite dev server or web environment
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.origin &&
    !window.location.origin.includes('file://') &&
    !window.location.origin.includes('tauri://')
  ) {
    cachedHubUrl = window.location.origin;
  }

  cachedResolvedHub = { url: cachedHubUrl, token: cachedHubToken, port: 5173, running: true };
  lastResolveTimestamp = now;
  return cachedResolvedHub;
}

/**
 * Returns currently known hub base URL
 */
export function getActiveHubBaseUrl() {
  return cachedHubUrl;
}

/**
 * useSchoolDatabaseSync — Continuous Real-Time Wi-Fi Database Synchronization Hook
 * 
 * Synchronizes the PC Desktop EXE's primary database (IndexedDB `sms_offline_db`)
 * with the native Local Wi-Fi Hub on the School PC.
 * 
 * Guarantees:
 * 1. PC ➔ Hub: New or edited students/batches on PC are pushed to the hub immediately.
 * 2. Hub ➔ PC: Roll call attendance marked on teacher phones is ingested into IndexedDB
 *    and instantly visible across Daily Attendance, Monthly Registers, and Reports.
 * 3. Initial Hydration: Seeds IndexedDB if empty on first launch.
 */
export function useSchoolDatabaseSync() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'synced' | 'error'
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const isSyncingRef = useRef(false);
  const isPullingRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const lastProcessedAttendanceMapRef = useRef(new Map());

  // 1. PC -> Hub: Push students & batches
  const pushDatabaseToHub = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');

    try {
      const hub = await resolveHubInfo();

      // Fetch latest batches, students, courses from IndexedDB
      const { data: batches } = await supabase
        .from('batches')
        .select('id, name, code, course_id, timing, classroom, is_active');

      const { data: students } = await supabase
        .from('students')
        .select('id, admission_no, full_name, roll_no, course_id, batch_id, phone, email, gender, status');

      const { data: courses } = await supabase
        .from('courses')
        .select('id, name, code, level');

      if ((batches && batches.length > 0) || (students && students.length > 0)) {
        const batchMap = new Map();
        (batches || []).forEach((b) => {
          if (b.id) batchMap.set(b.id, b);
          if (b.code) batchMap.set(b.code, b);
        });

        const enrichedStudents = (students || []).map((s) => {
          const b = batchMap.get(s.batch_id);
          return {
            ...s,
            batch_name: b?.name || s.batch_name || '',
            batch_code: b?.code || s.batch_code || s.batch_id || '',
          };
        });

        const headers = { 'Content-Type': 'application/json' };
        if (hub.token) {
          headers['X-Hub-Token'] = hub.token;
        }

        const res = await fetch(`${hub.url}/api/local-hub?action=sync_school_data`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            batches: batches || [],
            students: enrichedStudents,
            courses: courses || [],
            lastModified: new Date().toISOString(),
          }),
        });

        if (res.ok) {
          setSyncStatus('synced');
          setLastSyncTime(new Date().toLocaleTimeString());
        } else {
          setSyncStatus('error');
        }
      } else {
        // If local database is empty, attempt initial hydration from hub
        try {
          const res = await fetch(`${hub.url}/api/local-hub?action=export_school_data`);
          if (res.ok) {
            const data = await res.json();
            if (data.ok && Array.isArray(data.batches) && data.batches.length > 0) {
              await supabase.from('batches').upsert(data.batches);
            }
            if (data.ok && Array.isArray(data.students) && data.students.length > 0) {
              await supabase.from('students').upsert(data.students);
            }
            setSyncStatus('synced');
            setLastSyncTime(new Date().toLocaleTimeString());
          }
        } catch {}
      }
    } catch (err) {
      console.warn('School database sync push warning:', err.message);
      setSyncStatus('error');
    } finally {
      isSyncingRef.current = false;
    }
  }, []);

  // 2. Hub -> PC: Ingest phone attendance into IndexedDB
  const pullAttendanceFromHub = useCallback(async () => {
    if (isPullingRef.current) return;
    isPullingRef.current = true;

    try {
      const hub = await resolveHubInfo();
      const today = new Date().toISOString().split('T')[0];

      const res = await fetch(`${hub.url}/api/local-hub?action=updates&date=${encodeURIComponent(today)}`);
      if (res.ok) {
        const data = await res.json();
        const incoming = data.records || data.allRecords || data.updates || [];

        if (Array.isArray(incoming) && incoming.length > 0) {
          const toUpsert = [];

          for (const r of incoming) {
            const studentId = r.student_id || r.admission_no;
            const batchId = r.batch_id;
            const date = r.date || today;
            const status = r.status || 'Present';
            const updatedAt = r.updated_at || '';

            if (!studentId || !batchId) continue;

            const dedupeKey = `${batchId}::${date}::${studentId}`;
            const lastKnown = lastProcessedAttendanceMapRef.current.get(dedupeKey);

            // Only upsert if status or timestamp changed
            if (!lastKnown || lastKnown.status !== status || lastKnown.updatedAt !== updatedAt) {
              lastProcessedAttendanceMapRef.current.set(dedupeKey, { status, updatedAt });
              toUpsert.push({
                student_id: studentId,
                admission_no: r.admission_no || studentId,
                roll_no: r.roll_no || null,
                batch_id: batchId,
                date,
                session_name: r.session_name || 'Regular',
                status,
                time_in: r.time_in || '09:00',
                remarks: r.remarks || 'Mobile roll call',
                updated_at: updatedAt || new Date().toISOString(),
              });
            }
          }

          if (toUpsert.length > 0) {
            await supabase
              .from('attendance')
              .upsert(toUpsert, { onConflict: 'student_id,batch_id,date,session_name' });

            // Notify UI components with source tag to avoid sync loops
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('sms-db-mutation', {
                  detail: { tableName: 'attendance', count: toUpsert.length, source: 'hub-sync' },
                })
              );
            }
          }
        }
      }
    } catch {
      // Quiet fail if hub is momentarily unreachable, reset cache to re-resolve
      cachedResolvedHub = null;
    } finally {
      isPullingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial resolution & push
    resolveHubInfo().then(() => {
      pushDatabaseToHub();
      pullAttendanceFromHub();
    });

    // Listen for local desktop mutations
    const handleMutation = (event) => {
      // Ignore mutations originating from hub-sync ingestion to prevent feedback loop
      if (event?.detail?.source === 'hub-sync') return;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        pushDatabaseToHub();
      }, 1000);
    };

    window.addEventListener('sms-db-mutation', handleMutation);

    // Continuous attendance polling from phone hub every 2.5 seconds
    const pullTimer = setInterval(() => {
      pullAttendanceFromHub();
    }, 2500);

    // Periodic heartbeat push every 60 seconds
    const heartbeatTimer = setInterval(() => {
      pushDatabaseToHub();
    }, 60000);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearInterval(pullTimer);
      clearInterval(heartbeatTimer);
      window.removeEventListener('sms-db-mutation', handleMutation);
    };
  }, [pushDatabaseToHub, pullAttendanceFromHub]);

  return { syncStatus, lastSyncTime, syncNow: pushDatabaseToHub };
}
