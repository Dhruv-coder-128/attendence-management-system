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
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function runLiveCheck() {
  console.log('Testing live Supabase RPC functions...');
  
  // 1. get_parent_status_by_chat_id
  const { data: statusData, error: statusErr } = await sb.rpc('get_parent_status_by_chat_id', { p_chat_id: '123456789' });
  console.log('1. get_parent_status_by_chat_id:');
  console.log('   Data:', statusData);
  console.log('   Error:', statusErr ? statusErr.message : 'None');

  // 2. get_invitation_details_by_token
  const { data: invData, error: invErr } = await sb.rpc('get_invitation_details_by_token', { p_token: 'tk_test_unseeded_token' });
  console.log('2. get_invitation_details_by_token:');
  console.log('   Data:', invData);
  console.log('   Error:', invErr ? invErr.message : 'None');

  // 3. link_parent_telegram_by_token with nonexistent token
  const { data: linkData, error: linkErr } = await sb.rpc('link_parent_telegram_by_token', { p_token: 'tk_test_unseeded_token', p_chat_id: '123456789' });
  console.log('3. link_parent_telegram_by_token:');
  console.log('   Data:', linkData);
  console.log('   Error:', linkErr ? linkErr.message : 'None');
}

runLiveCheck().catch(console.error);
