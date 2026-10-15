import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
    const idx = trimmed.indexOf('=');
    const k = trimmed.substring(0, idx).trim();
    const v = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    env[k] = v;
  }
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function checkAttendanceColumns() {
  const { data, error } = await sb
    .from('attendance')
    .select('id, telegram_error, telegram_delivery_status')
    .limit(1);

  console.log('attendance select telegram columns:');
  console.log('  Data:', data);
  console.log('  Error:', error ? `${error.code} - ${error.message}` : 'None');
}

checkAttendanceColumns();
