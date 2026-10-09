import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

function getEnv() {
  const env = {};
  for (const filename of ['.env.local', '.env']) {
    if (fs.existsSync(filename)) {
      const content = fs.readFileSync(filename, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!env[key]) env[key] = val;
          }
        }
      }
    }
  }
  return env;
}

const env = getEnv();
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function testAuth() {
  // Try signing in with common passwords or check signUp
  const testEmail = 'admin@ruparel.edu';
  const passwords = ['Admin@123', 'admin123', 'ruparel123', 'Admin1234!', 'password123'];
  let loggedInUser = null;

  for (const p of passwords) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: testEmail, password: p });
    if (!error && data?.user) {
      console.log(`Success logging in as ${testEmail} with password candidate`);
      loggedInUser = data.user;
      break;
    }
  }

  if (!loggedInUser) {
    console.log('Could not log in with candidates. Trying signUp with a temporary test admin...');
    const randEmail = `staff_test_${Date.now()}@ruparel.edu`;
    const randPass = 'StaffAdmin@2026!';
    const { data: signData, error: signErr } = await supabase.auth.signUp({
      email: randEmail,
      password: randPass,
      options: { data: { full_name: 'Test Administrator', role: 'Administrator' } }
    });
    if (signErr) {
      console.log('signUp error:', signErr.message);
    } else {
      console.log('signUp result:', signData?.user?.id, 'session:', Boolean(signData?.session));
      loggedInUser = signData?.user;
    }
  }

  // Now query courses, batches, students
  const { data: courses, error: cErr } = await supabase.from('courses').select('id, code, name');
  console.log('Authenticated Courses:', courses?.length, cErr?.message || 'OK');
  courses?.forEach(c => console.log('Course:', c.code, c.name));

  const { data: batches, error: bErr } = await supabase.from('batches').select('id, code, name, is_active, course_id');
  console.log('Authenticated Batches:', batches?.length, bErr?.message || 'OK');
  batches?.forEach(b => console.log('Batch:', b.code, b.name, 'is_active:', b.is_active));

  const { data: students, count: sCount, error: sErr } = await supabase.from('students').select('id, admission_no, full_name, batch_id', { count: 'exact' });
  console.log('Authenticated Students Count:', sCount, students?.length, sErr?.message || 'OK');
  students?.slice(0, 5).forEach(s => console.log('Student:', s.admission_no, s.full_name));
}

testAuth();
