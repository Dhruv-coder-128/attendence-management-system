import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const f of ['.env.local', '.env']) {
  if (fs.existsSync(f)) {
    for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
      const idx = l.indexOf('=');
      if (idx > 0 && !l.trim().startsWith('#')) {
        env[l.slice(0, idx).trim()] = l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      }
    }
  }
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function inspect() {
  const { data: parents, count: pCount } = await sb.from('parents').select('id, full_name, phone, student_id', { count: 'exact' });
  console.log('Supabase parents count:', pCount || parents?.length);

  const { data: att, count: aCount } = await sb.from('attendance').select('id, student_id, batch_id, date, status', { count: 'exact' });
  console.log('Supabase attendance count:', aCount || att?.length);

  // Group attendance by date
  if (att) {
    const byDate = {};
    att.forEach(r => {
      byDate[r.date] = (byDate[r.date] || 0) + 1;
    });
    console.log('Attendance by date:', byDate);
  }

  const { data: st, count: sCount } = await sb.from('students').select('id, admission_no, roll_no, full_name', { count: 'exact' });
  console.log('Supabase students count:', sCount || st?.length);
}

inspect().catch(console.error);
