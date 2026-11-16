/**
 * POST /api/parent-portal-auth — parent portal login with a one-time code sent to the parent's Telegram.
 *
 * { action: 'request_otp', phone, identifier }  → sends a 6-digit code to the linked Telegram chat
 * { action: 'verify_otp', phone, code }          → { ok, parent, students, sessionToken }
 * { action: 'portal_data', sessionToken, studentId } → real attendance + published exam results
 *
 * Env: SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, PARENT_SESSION_SECRET (32+ chars).
 */
import crypto from 'node:crypto';
import { applyCors, rateLimited, clientIp, getServerDb, safeEqual } from './_lib/license.js';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const cleanPhone = (p) => String(p || '').replace(/[^0-9]/g, '').slice(-10);
const cleanIdent = (id) => String(id || '').trim().toLowerCase();
const hashCode = (phone, code) =>
  crypto.createHmac('sha256', process.env.PARENT_SESSION_SECRET).update(`${phone}:${code}`).digest('hex');

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', process.env.PARENT_SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readSession(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', process.env.PARENT_SESSION_SECRET).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  return payload.exp > Date.now() ? payload : null;
}

/** Finds the parent with this phone and all their linked children. */
async function findParentWithStudents(db, phone) {
  const { data: parents, error } = await db.from('parents').select('*').like('phone', `%${phone}`);
  if (error) throw error;
  const parent = (parents || []).find((p) => cleanPhone(p.phone) === phone);
  if (!parent) return null;
  const { data: links, error: linkErr } = await db
    .from('parent_students')
    .select('students(id, admission_no, full_name, roll_no, gender, status, enrollment_date, batch_id, batches(id, name, code, timing, classroom), courses(id, name, code, level))')
    .eq('parent_id', parent.id);
  if (linkErr) throw linkErr;
  return { parent, students: (links || []).map((l) => l.students).filter(Boolean) };
}

async function sendTelegram(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(data.ok);
}

async function requestOtp(db, req, res) {
  const phone = cleanPhone(req.body?.phone);
  const ident = cleanIdent(req.body?.identifier);
  if (phone.length !== 10 || !ident) {
    return res.status(400).json({ ok: false, error: 'Enter your 10-digit mobile number and your child\'s roll or admission number.' });
  }
  if (rateLimited('otp-phone:' + phone, 3, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many codes requested. Please wait 15 minutes.' });
  }

  const found = await findParentWithStudents(db, phone);
  const childMatches = found?.students.some((s) => cleanIdent(s.admission_no) === ident || cleanIdent(s.roll_no) === ident);
  if (!found || !childMatches) {
    return res.status(404).json({ ok: false, error: 'Mobile number and roll / admission number do not match our records. Please contact the school office.' });
  }
  if (!found.parent.telegram_chat_id) {
    return res.status(409).json({
      ok: false,
      error: 'Your number is not linked to the school\'s Telegram bot yet. Ask the school office for your Telegram invite link, then try again.',
    });
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const { error } = await db.from('parent_portal_otps').upsert({
    phone,
    code_hash: hashCode(phone, code),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    attempts: 0,
  });
  if (error) throw error;

  const sent = await sendTelegram(found.parent.telegram_chat_id, `Your parent portal login code is ${code}. It expires in 5 minutes. Do not share it with anyone.`);
  if (!sent) return res.status(502).json({ ok: false, error: 'Could not send the code on Telegram. Please try again in a minute.' });
  return res.status(200).json({ ok: true, message: 'A 6-digit code was sent to your Telegram.' });
}

async function verifyOtp(db, req, res) {
  const phone = cleanPhone(req.body?.phone);
  const code = String(req.body?.code || '').trim();
  const { data: row, error } = await db.from('parent_portal_otps').select('*').eq('phone', phone).maybeSingle();
  if (error) throw error;

  const expired = !row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= MAX_OTP_ATTEMPTS;
  if (expired) return res.status(401).json({ ok: false, error: 'This code has expired. Please request a new one.' });
  if (!safeEqual(row.code_hash, hashCode(phone, code))) {
    await db.from('parent_portal_otps').update({ attempts: row.attempts + 1 }).eq('phone', phone);
    return res.status(401).json({ ok: false, error: 'Wrong code. Please check your Telegram and try again.' });
  }
  await db.from('parent_portal_otps').delete().eq('phone', phone);

  const found = await findParentWithStudents(db, phone);
  if (!found || found.students.length === 0) return res.status(404).json({ ok: false, error: 'No students are linked to this number.' });
  const sessionToken = signSession({ pid: found.parent.id, sids: found.students.map((s) => s.id), exp: Date.now() + SESSION_TTL_MS });
  return res.status(200).json({
    ok: true,
    parent: { id: found.parent.id, full_name: found.parent.full_name, phone, relationship: found.parent.relationship || 'Parent' },
    students: found.students,
    selectedStudentId: found.students[0].id,
    authenticatedAt: new Date().toISOString(),
    sessionToken,
  });
}

async function portalData(db, req, res) {
  const session = readSession(req.body?.sessionToken);
  if (!session) return res.status(401).json({ ok: false, error: 'Your session has expired. Please log in again.' });
  const studentId = req.body?.studentId;
  if (!session.sids.includes(studentId)) return res.status(403).json({ ok: false, error: 'Not your child.' });

  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [{ data: attendance, error: attErr }, { data: marks, error: marksErr }] = await Promise.all([
    db.from('attendance').select('date, status, time_in, remarks, session_name').eq('student_id', studentId).gte('date', since).order('date', { ascending: false }),
    db.from('exam_marks').select('exam_id, marks_obtained, is_absent, remarks, exams!inner(id, name, exam_type, subject, exam_date, total_marks, is_published)').eq('student_id', studentId).eq('exams.is_published', true),
  ]);
  if (attErr) throw attErr;
  if (marksErr) throw marksErr;

  // Rank within each exam = 1 + number of students who scored higher.
  const examIds = (marks || []).map((m) => m.exam_id);
  const { data: allMarks, error: allErr } = examIds.length
    ? await db.from('exam_marks').select('exam_id, marks_obtained').in('exam_id', examIds)
    : { data: [] };
  if (allErr) throw allErr;
  const exams = (marks || []).map((m) => {
    const peers = allMarks.filter((x) => x.exam_id === m.exam_id && x.marks_obtained !== null);
    return {
      id: m.exam_id,
      title: m.exams.name,
      type: m.exams.exam_type,
      subject: m.exams.subject,
      date: m.exams.exam_date,
      max_marks: Number(m.exams.total_marks),
      marks_obtained: m.is_absent ? null : Number(m.marks_obtained),
      is_absent: m.is_absent,
      teacher_remarks: m.remarks || '',
      rank: m.is_absent || m.marks_obtained === null ? null : 1 + peers.filter((p) => Number(p.marks_obtained) > Number(m.marks_obtained)).length,
      totalStudents: peers.length,
    };
  });
  return res.status(200).json({ ok: true, attendance: attendance || [], exams });
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  const db = getServerDb();
  if (!db || !process.env.TELEGRAM_BOT_TOKEN || String(process.env.PARENT_SESSION_SECRET || '').length < 32) {
    return res.status(500).json({ ok: false, error: 'Parent portal is not configured on the server.' });
  }
  if (rateLimited('parent-auth:' + clientIp(req), 30, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a few minutes.' });
  }

  try {
    const action = req.body?.action;
    if (action === 'request_otp') return await requestOtp(db, req, res);
    if (action === 'verify_otp') return await verifyOtp(db, req, res);
    if (action === 'portal_data') return await portalData(db, req, res);
    return res.status(400).json({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    console.error('parent-portal-auth error:', err);
    return res.status(500).json({ ok: false, error: 'Server error. Please try again.' });
  }
}
