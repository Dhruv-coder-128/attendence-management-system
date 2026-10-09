import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Parse .env.local or .env
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
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log('Connecting to Supabase...');
console.log('URL defined:', Boolean(url));
console.log('Key defined:', Boolean(key));

if (!url || !key) {
  console.error('Missing credentials in .env or .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function inspect() {
  try {
    // 1. Courses
    const { data: courses, error: cErr } = await supabase.from('courses').select('id, code, name, level, is_active');
    console.log('\n--- COURSES ---');
    if (cErr) console.error('Error fetching courses:', cErr);
    else {
      console.log(`Found ${courses?.length || 0} courses:`);
      courses?.forEach(c => console.log(`  - [${c.id}] ${c.code} (${c.name}) active=${c.is_active}`));
    }

    // 2. Batches
    const { data: batches, error: bErr } = await supabase.from('batches').select('id, code, name, course_id, is_active, academic_year, max_capacity');
    console.log('\n--- BATCHES (ALL) ---');
    if (bErr) console.error('Error fetching batches:', bErr);
    else {
      console.log(`Found ${batches?.length || 0} batches:`);
      batches?.forEach(b => console.log(`  - [${b.id}] ${b.code} (${b.name}) course_id=${b.course_id} is_active=${b.is_active} (type: ${typeof b.is_active})`));
    }

    // Batches with is_active = true
    const { data: activeBatches, error: abErr, count: abCount } = await supabase
      .from('batches')
      .select('id, code, is_active', { count: 'exact' })
      .eq('is_active', true);
    console.log('\n--- BATCHES (eq is_active = true) ---');
    if (abErr) console.error('Error fetching active batches:', abErr);
    else {
      console.log(`Query returned count: ${abCount}, rows: ${activeBatches?.length || 0}`);
    }

    // 3. Students
    const { data: students, error: sErr, count: sCount } = await supabase
      .from('students')
      .select('id, admission_no, full_name, batch_id, status', { count: 'exact' });
    console.log('\n--- STUDENTS ---');
    if (sErr) console.error('Error fetching students:', sErr);
    else {
      console.log(`Found total ${sCount} students. First 5 sample:`);
      students?.slice(0, 5).forEach(s => console.log(`  - [${s.admission_no}] ${s.full_name} batch=${s.batch_id} status=${s.status}`));
      const batchCounts = {};
      students?.forEach(s => {
        batchCounts[s.batch_id] = (batchCounts[s.batch_id] || 0) + 1;
      });
      console.log('Students per batch_id:', batchCounts);
    }

    // 4. Parents
    const { data: parents, error: pErr, count: pCount } = await supabase
      .from('parents')
      .select('id, full_name, phone, telegram_chat_id, is_verified', { count: 'exact' });
    console.log('\n--- PARENTS ---');
    if (pErr) console.error('Error fetching parents:', pErr);
    else console.log(`Found ${pCount} parents.`);

  } catch (err) {
    console.error('Inspect exception:', err);
  }
}

inspect();
