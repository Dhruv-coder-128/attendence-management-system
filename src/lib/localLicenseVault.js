// Pure offline license vault — no Supabase, no internet, no secrets in code
// Dev creates token on his PC -> sends code to client -> client pastes in EXE -> days/lock update
// Uses simple HMAC-like signing with embedded dev salt (offline, not a network secret)

const STORAGE_KEY = 'sms_school_license';
const REGISTRY_KEY = 'sms_saas_clients_registry_v2';

// Salt used only to make token tamper-evident offline. Not a cloud secret.
const DEV_SALT = 'SMS-LOCAL-VAULT-2026-v2';

function b64encode(str){ try{ return btoa(unescape(encodeURIComponent(str))); }catch{ return btoa(str);} }
function b64decode(str){ try{ return decodeURIComponent(escape(atob(str))); }catch{ return atob(str);} }

function signPayload(payloadStr){
  let h=0;
  const s = payloadStr + '|' + DEV_SALT;
  for(let i=0;i<s.length;i++) h = (h*33 + s.charCodeAt(i)) >>>0;
  // add second round
  let h2=0;
  const rev = s.split('').reverse().join('');
  for(let i=0;i<rev.length;i++) h2 = (h2*31 + rev.charCodeAt(i)) >>>0;
  return h.toString(36).toUpperCase().padStart(6,'0') + h2.toString(36).toUpperCase().padStart(6,'0');
}

export function createLicenseToken(data){
  // data: { schoolName, contactPerson, email, phone, licenseKey, daysRemaining, maxStudents, isLocked, isTimerVisible, notes, trialEndsAt, trialStartedAt }
  const cleanKey = (data.licenseKey||'').trim().toUpperCase() || `SMS-${(data.schoolName||'SCH').slice(0,3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date();
  const days = parseInt(data.daysRemaining,10);
  const finalDays = isNaN(days) ? 30 : Math.max(0, Math.min(9999, days));
  const payload = {
    v:2,
    licenseKey: cleanKey,
    schoolName: (data.schoolName||'SMS Client School').trim(),
    contactPerson: (data.contactPerson||'Principal / Administrator').trim(),
    email: (data.email||'').trim(),
    phone: (data.phone||'').trim(),
    daysRemaining: finalDays,
    maxStudents: parseInt(data.maxStudents,10)||200,
    isLocked: !!data.isLocked,
    isTimerVisible: data.isTimerVisible!==false,
    status: data.isLocked ? 'suspended' : (finalDays>=9000 ? 'licensed' : (finalDays>0 ? 'trial_active' : 'trial_expired')),
    trialStartedAt: data.trialStartedAt || now.toISOString(),
    trialEndsAt: data.trialEndsAt || new Date(now.getTime()+ finalDays*86400000).toISOString(),
    notes: data.notes||'',
    issuedAt: now.toISOString(),
    issuedBy: 'local-admin',
  };
  const json = JSON.stringify(payload);
  const body = b64encode(json);
  const sig = signPayload(body);
  // Token format: SMS-LOCAL-<body>.<sig>  easy to copy-paste
  return `SMS-LOCAL-${body}.${sig}`;
}

export function parseLicenseToken(token){
  if(!token) return { ok:false, error:'Empty token' };
  const clean = token.trim().replace(/\s+/g,'');
  if(!clean.startsWith('SMS-LOCAL-')) return { ok:false, error:'Invalid token prefix. Must start with SMS-LOCAL-' };
  const rest = clean.slice('SMS-LOCAL-'.length);
  const dot = rest.lastIndexOf('.');
  if(dot===-1) return { ok:false, error:'Invalid token format' };
  const body = rest.slice(0, dot);
  const sig = rest.slice(dot+1);
  const expected = signPayload(body);
  if(sig !== expected) return { ok:false, error:'Token signature invalid — token was tampered or corrupted.' };
  try{
    const json = b64decode(body);
    const payload = JSON.parse(json);
    return { ok:true, data: payload, token:clean };
  }catch(e){
    return { ok:false, error:'Failed to decode token: '+ e.message };
  }
}

export function applyLicenseToken(token){
  const parsed = parseLicenseToken(token);
  if(!parsed.ok) return parsed;
  const p = parsed.data;
  try{
    const existingRaw = localStorage.getItem(STORAGE_KEY);
    const existing = existingRaw ? JSON.parse(existingRaw) : {};
    const merged = { ...existing, ...p, maxStudents: p.maxStudents, max_students: p.maxStudents, daysRemaining: p.daysRemaining, days_remaining: p.daysRemaining };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    // Also notify
    try{ window.dispatchEvent(new CustomEvent('sms_license_updated', { detail: merged })); }catch{}
    return { ok:true, data: merged };
  }catch(e){ return { ok:false, error: e.message }; }
}

// Dev-side registry (stored only on dev's PC). This is the "client list".
export function getLocalRegistry(){
  try{
    const raw = localStorage.getItem(REGISTRY_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
export function saveLocalRegistry(list){
  try{ localStorage.setItem(REGISTRY_KEY, JSON.stringify(list)); }catch{}
}
export function upsertLocalClient(client){
  const list = getLocalRegistry();
  const idx = list.findIndex(c=> c.licenseKey.toUpperCase() === client.licenseKey.toUpperCase());
  if(idx>=0) list[idx] = { ...list[idx], ...client, updatedAt: new Date().toISOString() };
  else list.unshift({ ...client, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  saveLocalRegistry(list);
  return list;
}
export function deleteLocalClient(licenseKey){
  const list = getLocalRegistry().filter(c=> c.licenseKey.toUpperCase() !== licenseKey.toUpperCase());
  saveLocalRegistry(list);
  return list;
}
export function getClientByKey(licenseKey){
  return getLocalRegistry().find(c=> c.licenseKey.toUpperCase()===licenseKey.toUpperCase());
}
