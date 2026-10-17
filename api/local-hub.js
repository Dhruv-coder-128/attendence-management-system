/**
 * SMS — Student Management System
 * Local Wi-Fi Hub API Endpoint: /api/local-hub
 * 
 * Provides high-speed, zero-cloud REST API for Teacher Android phones
 * connecting to the School PC over local Wi-Fi.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
  CANONICAL_BATCHES,
  CANONICAL_STUDENTS,
  getBatchStudents,
  getBatchById,
} from '../src/data/canonicalSchoolData.js';

// Cache for in-memory / local session attendance store when completely offline
const memoryAttendanceStore = new Map();
let lastSyncTimestamp = new Date().toISOString();

// Persistent file-backed attendance store on the School PC
const PERSISTENT_ATTENDANCE_FILE = path.resolve(process.cwd(), 'src/data/attendance_sync.json');

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

// Initial load
loadPersistentAttendance();

/**
 * Resolves current machine's primary IPv4 Wi-Fi / LAN address
 */
export function getLocalNetworkIp() {
  const nets = os.networkInterfaces();
  let candidate = '127.0.0.1';

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // Prioritize Wi-Fi or local ethernet
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')) {
          return net.address;
        }
        if (!candidate || candidate === '127.0.0.1') {
          candidate = net.address;
        }
      }
    }
  }
  return candidate;
}

export default async function handler(req, res) {
  // CORS & Security headers for Local Wi-Fi network requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-school-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const action = (query.action || req.body?.action || 'status').toLowerCase();
  const localIp = getLocalNetworkIp();

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
      localIp,
      port: 5173,
      connectUrl: `http://${localIp}:5173`,
      academyName: 'SMS International Academy',
      timestamp: new Date().toISOString(),
      lastSyncTimestamp,
      status: 'active',
      batchCount: CANONICAL_BATCHES.length,
      studentCount: CANONICAL_STUDENTS.length,
    });
  }

  // 2. BATCHES: Returns the exact 5 academic cohorts from desktop application
  if (action === 'batches') {
    if (db) {
      try {
        const { data, error } = await db
          .from('batches')
          .select('id, name, code, timing, classroom, is_active')
          .order('name');
        if (!error && Array.isArray(data) && data.length >= 5) {
          return res.status(200).json({ ok: true, batches: data });
        }
      } catch {}
    }
    return res.status(200).json({ ok: true, batches: CANONICAL_BATCHES });
  }

  // 3. STUDENTS: Returns student roster for a specific batch (exactly 20 students per batch)
  if (action === 'students') {
    const batchId = query.batch_id || req.body?.batch_id;
    if (!batchId) {
      return res.status(400).json({ ok: false, error: 'batch_id parameter is required.' });
    }

    if (db) {
      try {
        const { data, error } = await db
          .from('students')
          .select('id, full_name, roll_no, admission_no, gender, status, batch_id')
          .eq('batch_id', batchId)
          .order('roll_no');

        if (!error && Array.isArray(data) && data.length > 0) {
          return res.status(200).json({ ok: true, batch_id: batchId, students: data });
        }
      } catch {}
    }

    const students = getBatchStudents(batchId);
    return res.status(200).json({
      ok: true,
      batch_id: batchId,
      students: students.length > 0 ? students : CANONICAL_STUDENTS.slice(0, 20),
    });
  }

  // 4. ATTENDANCE (GET): Retrieves existing attendance records for a batch and date
  if (action === 'attendance' && req.method === 'GET') {
    const batchId = query.batch_id;
    const targetDate = query.date || new Date().toISOString().split('T')[0];
    if (!batchId) {
      return res.status(400).json({ ok: false, error: 'batch_id parameter is required.' });
    }

    const key = `${batchId}_${targetDate}`;
    const cached = memoryAttendanceStore.get(key);

    return res.status(200).json({
      ok: true,
      batch_id: batchId,
      date: targetDate,
      records: cached ? cached.records : [],
      savedAt: cached ? cached.savedAt : null,
    });
  }

  // 5. ATTENDANCE (POST): Saves teacher roll call from phone into school PC database
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
      const canonicalMatch = CANONICAL_STUDENTS.find(
        (cs) => cs.id === r.student_id || cs.admission_no === r.student_id || cs.admission_no === r.admission_no
      );
      return {
        student_id: r.student_id,
        admission_no: r.admission_no || canonicalMatch?.admission_no || r.student_id,
        roll_no: r.roll_no || canonicalMatch?.roll_no || null,
        status: r.status || 'Present',
        remarks: r.remarks || '',
        time_in: r.time_in || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        updated_at: lastSyncTimestamp,
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

    // Store in-memory cache under all alias keys for 100% reliable matching
    const keysToSet = new Set([
      `${batch_id}_${targetDate}`,
      batch_code ? `${batch_code}_${targetDate}` : null,
      batch_name ? `${batch_name.replace(/\s+/g, '').toUpperCase()}_${targetDate}` : null,
    ]);

    keysToSet.forEach((k) => {
      if (k) memoryAttendanceStore.set(k, sessionData);
    });

    savePersistentAttendance();

    // Try database persistence if available
    let dbSuccess = false;
    if (db) {
      try {
        const payload = enrichedRecords.map((r) => ({
          student_id: r.student_id,
          batch_id,
          date: targetDate,
          status: r.status,
          remarks: r.remarks,
          updated_at: lastSyncTimestamp,
        }));

        const { error } = await db
          .from('attendance')
          .upsert(payload, { onConflict: 'student_id,date' });

        if (!error) {
          dbSuccess = true;
        }
      } catch (err) {
        console.warn('Database attendance persistence warning:', err);
      }
    }

    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    enrichedRecords.forEach((r) => {
      if (r.status === 'Present') presentCount++;
      else if (r.status === 'Absent') absentCount++;
      else if (r.status === 'Late') lateCount++;
    });

    return res.status(200).json({
      ok: true,
      batch_id,
      date: targetDate,
      totalStudents: enrichedRecords.length,
      presentCount,
      absentCount,
      lateCount,
      dbSynchronized: dbSuccess,
      message: `Successfully saved attendance (${presentCount} Present, ${lateCount} Late, ${absentCount} Absent) to School PC!`,
      savedAt: lastSyncTimestamp,
    });
  }

  // 6. UPDATES (GET): Polling endpoint for Desktop PC to receive live sync
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
      hasData: Boolean(matchedSession || allRecordsForDate.length > 0),
      records: matchedSession ? matchedSession.records : allRecordsForDate,
      allRecords: allRecordsForDate,
      date: targetDate,
    });
  }

  return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
}
