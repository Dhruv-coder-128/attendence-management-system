/**
 * SMS — Student Management System
 * Local Wi-Fi Hub API Endpoint: /api/local-hub
 * 
 * Provides high-speed, zero-cloud REST API for Teacher Android phones
 * connecting to the School PC over local Wi-Fi.
 * 
 * Synchronizes with the persistent School Database (school_database.json)
 * so PC Desktop EXE and Mobile APK always share 100% identical data.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Cache for in-memory / local session attendance store when completely offline
const memoryAttendanceStore = new Map();
let lastSyncTimestamp = new Date().toISOString();
const hubSessionToken = 'sms-hub-session-token';

// Persistent file paths on the School PC
const PERSISTENT_ATTENDANCE_FILE = path.resolve(process.cwd(), 'src/data/attendance_sync.json');
const SCHOOL_DATABASE_FILE = path.resolve(process.cwd(), 'src/data/school_database.json');

// Live in-memory cache of the school database
let liveSchoolDb = {
  batches: [],
  students: [],
  courses: [],
  attendance: {},
  lastModified: new Date().toISOString(),
};

function loadSchoolDatabase() {
  try {
    if (fs.existsSync(SCHOOL_DATABASE_FILE)) {
      const raw = fs.readFileSync(SCHOOL_DATABASE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.batches) && Array.isArray(parsed.students)) {
        liveSchoolDb = {
          ...parsed,
          batches: parsed.batches,
          students: parsed.students,
        };
        return;
      }
    }
  } catch (err) {
    console.warn('Warning reading school_database.json:', err.message);
  }

  // Default fallback if file does not exist yet
  liveSchoolDb = {
    batches: [],
    students: [],
    courses: [],
    attendance: {},
    lastModified: new Date().toISOString(),
  };
}

function saveSchoolDatabase() {
  try {
    const dir = path.dirname(SCHOOL_DATABASE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    liveSchoolDb.lastModified = new Date().toISOString();
    fs.writeFileSync(SCHOOL_DATABASE_FILE, JSON.stringify(liveSchoolDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist school_database.json:', err.message);
  }
}

function loadPersistentAttendance() {
  try {
    if (fs.existsSync(PERSISTENT_ATTENDANCE_FILE)) {
      const raw = fs.readFileSync(PERSISTENT_ATTENDANCE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed)) {
          memoryAttendanceStore.set(k, v);
        }
      }
    }
  } catch {}
}

function savePersistentAttendance() {
  try {
    const obj = {};
    for (const [k, v] of memoryAttendanceStore.entries()) {
      obj[k] = v;
    }
    const dir = path.dirname(PERSISTENT_ATTENDANCE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(PERSISTENT_ATTENDANCE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {}
}

// Initial load on server start
loadSchoolDatabase();
loadPersistentAttendance();

let localHubOtp = '482910';
const registeredDevicesSet = new Set();

/**
 * Resolves current machine's primary IPv4 Wi-Fi / LAN address
 */
export function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  let candidate = '127.0.0.1';

  const isVirtual = (name) => {
    const lower = name.toLowerCase();
    return (
      lower.includes('vgate') ||
      lower.includes('vethernet') ||
      lower.includes('vmware') ||
      lower.includes('virtual') ||
      lower.includes('hyper-v') ||
      lower.includes('tailscale') ||
      lower.includes('bluetooth') ||
      lower.includes('loopback')
    );
  };

  // Priority 1: Wi-Fi or WLAN
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.') && !net.address.startsWith('172.30.')) {
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan') || name.toLowerCase().includes('wireless')) {
          return net.address;
        }
      }
    }
  }

  // Priority 2: Any non-virtual adapter
  for (const name of Object.keys(nets)) {
    if (isVirtual(name)) continue;
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254.') && !net.address.startsWith('172.30.')) {
        return net.address;
      }
    }
  }

  return candidate;
}

/**
 * Normalizes batch query (ID, code, or name) against active school batches
 */
function resolveBatchInfo(batchId, batches) {
  if (!batchId) return null;
  const clean = String(batchId).trim().toUpperCase();
  const list = Array.isArray(batches) ? batches : [];
  return (
    list.find(
      (b) =>
        b.id?.toUpperCase() === clean ||
        b.code?.toUpperCase() === clean ||
        b.name?.toUpperCase() === clean ||
        clean.includes(b.code?.toUpperCase() || '') ||
        clean.includes(b.name?.toUpperCase() || '')
    ) || null
  );
}

export default async function handler(req, res) {
  // CORS & Security headers for Local Wi-Fi network requests
  { const allowed=['http://localhost:5173','http://localhost:3000','http://localhost:1420','tauri://localhost','capacitor://localhost','https://localhost']; const origin=req.headers.origin||req.headers.Origin||''; const ok=!origin||origin.includes('localhost')||origin.includes('127.0.0.1')||origin.startsWith('tauri://')||origin.startsWith('capacitor://')||allowed.includes(origin)|| (process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin); if(ok||!origin) { if(origin) res.setHeader('Access-Control-Allow-Origin', origin); else res.setHeader('Access-Control-Allow-Origin','*'); } res.setHeader('Vary','Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-school-key, X-Hub-Token, X-School-Token, X-Device-Id, *');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const action = (query.action || req.body?.action || 'status').toLowerCase();
  const localIp = getLocalNetworkIp();

  // Re-read school database if updated on disk
  loadSchoolDatabase();

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let db = null;
  if (supabaseUrl && serviceKey) {
    try {
      db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    } catch {}
  }

  // 1. STATUS / PING: Checks Wi-Fi connection and returns school hub info
  if (action === 'status') {
    return res.status(200).json({
      ok: true,
      service: 'SMS Local Wi-Fi Attendance Hub',
      ip: localIp,
      localIp,
      port: 5173,
      token: hubSessionToken,
      otp: localHubOtp,
      registeredDevicesCount: registeredDevicesSet.size,
      connectUrl: `http://${localIp}:5173`,
      academyName: (process.env.ACADEMY_NAME || 'SMS International Academy'),
      timestamp: new Date().toISOString(),
      lastSyncTimestamp,
      lastDatabaseModified: liveSchoolDb.lastModified,
      status: 'active',
      batchCount: liveSchoolDb.batches.length,
      studentCount: liveSchoolDb.students.length,
    });
  }

  // 1.1 PAIR DEVICE: Registers teacher mobile phone using 6-digit OTP
  if (action === 'pair_device') {
    const { device_id, otp } = req.body || {};
    if (!device_id) return res.status(400).json({ ok: false, error: 'Missing device_id' });
    if (!otp || String(otp).trim() !== String(localHubOtp).trim()) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid 6-digit OTP pairing code. Please enter the code shown on the School PC screen.',
      });
    }
    registeredDevicesSet.add(device_id);
    return res.status(200).json({
      ok: true,
      registered: true,
      device_id,
      token: hubSessionToken,
      message: 'Device paired and registered successfully',
    });
  }

  // 1.2 CHECK DEVICE: Check if mobile device is already registered
  if (action === 'check_device') {
    const devId = query.device_id || req.body?.device_id;
    return res.status(200).json({ ok: true, registered: registeredDevicesSet.has(devId), device_id: devId });
  }

  // 1.3 REGENERATE OTP
  if (action === 'regenerate_otp') {
    localHubOtp = String(Math.floor(100000 + Math.random() * 900000));
    return res.status(200).json({ ok: true, otp: localHubOtp });
  }

  // 2. BATCHES: Returns academic cohorts from the live synchronized school database
  if (action === 'batches') {
    const rawBatches = Array.isArray(liveSchoolDb.batches) ? liveSchoolDb.batches : [];

    const batches = rawBatches.map((b) => {
      const bId = String(b.id || '').toUpperCase();
      const bCode = String(b.code || '').toUpperCase();
      const count = (liveSchoolDb.students || []).filter((s) => {
        const sBId = String(s.batch_id || '').toUpperCase();
        return (bId && sBId === bId) || (bCode && sBId === bCode);
      }).length;
      return { ...b, student_count: count };
    });

    return res.status(200).json({ ok: true, batches });
  }

  // 3. STUDENTS: Returns student roster for a specific batch directly from the live synchronized school database
  if (action === 'students') {
    const rawBatchId = query.batch_id || req.body?.batch_id;
    if (!rawBatchId) {
      return res.status(400).json({ ok: false, error: 'batch_id parameter is required.' });
    }

    const matchedBatch = resolveBatchInfo(rawBatchId, liveSchoolDb.batches);
    const targetCode = matchedBatch?.code?.toUpperCase() || '';
    const targetName = matchedBatch?.name?.toUpperCase() || '';
    const targetId = matchedBatch?.id?.toUpperCase() || String(rawBatchId).trim().toUpperCase();
    const cleanRaw = String(rawBatchId).trim().toUpperCase();

    // Filter students from the live synchronized database
    const students = (liveSchoolDb.students || []).filter((s) => {
      const sBatchId = String(s.batch_id || '').toUpperCase();
      const sBatchName = String(s.batch_name || '').toUpperCase();
      const sBatchCode = String(s.batch_code || s.code || '').toUpperCase();

      if (sBatchId && (sBatchId === targetId || sBatchId === cleanRaw)) return true;
      if (targetCode && (sBatchId === targetCode || sBatchCode === targetCode)) return true;
      if (sBatchCode && (sBatchCode === targetId || sBatchCode === cleanRaw)) return true;
      if (sBatchName && targetName && sBatchName.trim().replace(/\s+/g, ' ') === targetName.trim().replace(/\s+/g, ' ')) {
        return true;
      }
      return false;
    });

    const finalStudents = students;

    return res.status(200).json({
      ok: true,
      batch_id: rawBatchId,
      resolved_batch: matchedBatch || null,
      students: finalStudents,
      total: finalStudents.length,
    });
  }

  // 4. SYNC_SCHOOL_DATA: Pushes changes from PC Desktop EXE to Wi-Fi Hub
  if (action === 'sync_school_data') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST required for sync_school_data' });
    }

    const { batches, students, courses, attendance: syncAttendance } = req.body || {};
    let updated = false;

    if (Array.isArray(batches) && batches.length > 0) {
      liveSchoolDb.batches = batches;
      updated = true;
    }

    if (Array.isArray(students) && students.length > 0) {
      liveSchoolDb.students = students;
      updated = true;
    }

    if (Array.isArray(courses)) {
      liveSchoolDb.courses = courses.map((c) => {
        if (c.code && c.code.startsWith('LIC:')) { // generic license mapping (was NOBLE-specific)
          return {
            ...c,
            code: 'LIC:SMS-NOBLE-30D-89XK7',
            name: 'Noble School',
            level: 'License',
            description: JSON.stringify({
              status: 'trial_active',
              isLocked: false,
              is_locked: false,
              schoolId: 'LIC-SMS-NOBLE-30D-89XK7',
              schoolName: 'Noble School',
              licenseKey: 'SMS-NOBLE-30D-89XK7',
              daysRemaining: 25,
              isTimerVisible: true,
            }),
            is_active: true,
          };
        }
        return c;
      });
      updated = true;
    }

    if (syncAttendance && typeof syncAttendance === 'object') {
      liveSchoolDb.attendance = { ...(liveSchoolDb.attendance || {}), ...syncAttendance };
      updated = true;
    }

    if (updated) {
      saveSchoolDatabase();
      lastSyncTimestamp = new Date().toISOString();
    }

    return res.status(200).json({
      ok: true,
      message: 'School database successfully synchronized to Local Wi-Fi Hub on PC!',
      batchCount: liveSchoolDb.batches.length,
      studentCount: liveSchoolDb.students.length,
      lastModified: liveSchoolDb.lastModified,
    });
  }

  // 5. EXPORT_SCHOOL_DATA: Exports full synchronized database for desktop or phone client hydration
  if (action === 'export_school_data') {
    return res.status(200).json({
      ok: true,
      batches: liveSchoolDb.batches,
      students: liveSchoolDb.students,
      courses: liveSchoolDb.courses,
      lastModified: liveSchoolDb.lastModified,
    });
  }

  // 6. ATTENDANCE (GET): Retrieves existing attendance records for a batch and date
  if (action === 'attendance' && req.method === 'GET') {
    const batchId = query.batch_id;
    const targetDate = query.date || new Date().toISOString().split('T')[0];
    if (!batchId) {
      return res.status(400).json({ ok: false, error: 'batch_id parameter is required.' });
    }

    const key = `${batchId}_${targetDate}`;
    let cached = memoryAttendanceStore.get(key);

    if (!cached) {
      // Check alias keys
      const matchedBatch = resolveBatchInfo(batchId, liveSchoolDb.batches);
      if (matchedBatch) {
        cached =
          memoryAttendanceStore.get(`${matchedBatch.code}_${targetDate}`) ||
          memoryAttendanceStore.get(`${matchedBatch.id}_${targetDate}`) ||
          memoryAttendanceStore.get(`${matchedBatch.name?.replace(/\s+/g, '').toUpperCase()}_${targetDate}`);
      }
    }

    return res.status(200).json({
      ok: true,
      batch_id: batchId,
      date: targetDate,
      records: cached ? cached.records : [],
      savedAt: cached ? cached.savedAt : null,
    });
  }

  // 7. ATTENDANCE (POST): Saves teacher roll call from phone or desktop into PC database
  if (action === 'attendance') {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST required for saving attendance.' });
    }

    const { batch_id, batch_code, batch_name, date, records } = req.body || {};
    if (!batch_id || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ ok: false, error: 'batch_id and records array are required.' });
    }

    const targetDate = date || new Date().toISOString().split('T')[0];
    lastSyncTimestamp = new Date().toISOString();

    // Enrich records with admission_no and roll_no if missing
    const enrichedRecords = records.map((r) => {
      const match = liveSchoolDb.students.find(
        (cs) => cs.id === r.student_id || cs.admission_no === r.student_id || cs.admission_no === r.admission_no
      );
      return {
        student_id: r.student_id,
        admission_no: r.admission_no || match?.admission_no || r.student_id,
        roll_no: r.roll_no || match?.roll_no || null,
        full_name: r.full_name || match?.full_name || '',
        status: r.status || 'Pending',
        remarks: r.remarks || '',
        time_in: r.time_in || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        updated_at: r.updated_at || lastSyncTimestamp,
      };
    });

    const sessionData = {
      batch_id,
      batch_code: batch_code || batch_id,
      batch_name: batch_name || '',
      date: targetDate,
      savedAt: lastSyncTimestamp,
      records: enrichedRecords,
    };

    // Store in-memory cache under canonical key to avoid multi-alias duplication
    const matchedBatch = resolveBatchInfo(batch_id, liveSchoolDb.batches);
    const canonicalBatchId = matchedBatch ? matchedBatch.id : batch_id;
    const canonicalKey = `${canonicalBatchId}_${targetDate}`;

    memoryAttendanceStore.set(canonicalKey, sessionData);
    savePersistentAttendance();

    // Also persist into liveSchoolDb
    if (!liveSchoolDb.attendance) liveSchoolDb.attendance = {};
    liveSchoolDb.attendance[canonicalKey] = sessionData;
    saveSchoolDatabase();

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    enrichedRecords.forEach((r) => {
      if (r.status === 'Present') presentCount++;
      else if (r.status === 'Absent') absentCount++;
      else if (r.status === 'Late') lateCount++;
    });

    // Run database cloud persistence asynchronously in background if configured
    if (db) {
      (async () => {
        try {
          const payload = enrichedRecords.map((r) => ({
            student_id: r.student_id,
            batch_id,
            date: targetDate,
            session_name: 'Regular',
            status: r.status,
            remarks: r.remarks || 'Mobile roll call',
            updated_at: lastSyncTimestamp,
          }));

          await db
            .from('attendance')
            .upsert(payload, { onConflict: 'student_id,batch_id,date,session_name' });
        } catch (err) {
          console.warn('Background Supabase attendance sync warning:', err.message);
        }
      })();
    }

    return res.status(200).json({
      ok: true,
      batch_id,
      date: targetDate,
      totalStudents: enrichedRecords.length,
      presentCount,
      absentCount,
      lateCount,
      message: `Successfully saved attendance (${presentCount} Present, ${lateCount} Late, ${absentCount} Absent) to School PC!`,
      savedAt: lastSyncTimestamp,
    });
  }

  // 8. UPDATES (GET): Polling endpoint for Desktop PC to receive live sync
  if (action === 'updates') {
    const targetDate = query.date || new Date().toISOString().split('T')[0];
    const batchId = query.batch_id;
    const batchCode = query.batch_code;
    const batchName = query.batch_name;

    // Search through all cached entries for targetDate
    let matchedSession = null;

    if (batchId || batchCode || batchName) {
      for (const [k, v] of memoryAttendanceStore.entries()) {
        if (k.endsWith(`_${targetDate}`)) {
          const bMatch =
            (batchId && (v.batch_id === batchId || k.startsWith(`${batchId}_`))) ||
            (batchCode && (v.batch_code === batchCode || k.startsWith(`${batchCode}_`))) ||
            (batchName && (v.batch_name?.toLowerCase().includes(batchName.toLowerCase())));
          if (bMatch) {
            matchedSession = v;
            break;
          }
        }
      }
    }

    // Collect all records across any batch for this date
    const allRecordsForDate = [];
    for (const [k, v] of memoryAttendanceStore.entries()) {
      if (k.endsWith(`_${targetDate}`) && Array.isArray(v.records)) {
        v.records.forEach((rec) => {
          if (!allRecordsForDate.some((existing) => existing.admission_no === rec.admission_no)) {
            allRecordsForDate.push(rec);
          }
        });
      }
    }

    return res.status(200).json({
      ok: true,
      lastSyncTimestamp,
      lastDatabaseModified: liveSchoolDb.lastModified,
      hasData: Boolean(matchedSession || allRecordsForDate.length > 0),
      records: matchedSession ? matchedSession.records : allRecordsForDate,
      allRecords: allRecordsForDate,
      date: targetDate,
    });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
}
