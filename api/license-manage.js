/**
 * SMS — Serverless API: /api/license-manage
 * Privileged SaaS License Management — no hardcodes, env-driven auth.
 */

import { createClient } from '@supabase/supabase-js';
import { applyCors, preflightResponse } from './_lib/cors.js';
import crypto from 'crypto';

const ALLOWED_ORIGINS_EXTRA = []; // use ALLOWED_ORIGINS env for custom domains

async function fetchLicensesResilient(serverDb) {
  const { data, error } = await serverDb.from('school_licenses').select('*').order('created_at', { ascending: false });
  if (!error) return data || [];
  if (error.code === 'PGRST205' || error.code === '42P01' || String(error.message||'').includes('school_licenses')) {
    const { data: cData, error: cErr } = await serverDb.from('courses').select('*').like('code','LIC:%').order('created_at',{ascending:false});
    if (cErr) throw cErr;
    return (cData||[]).map((row)=>{
      let p={}; try{p=JSON.parse(row.description)||{};}catch{}
      return { license_key: p.license_key||p.licenseKey||row.code.replace(/^LIC:/,''), school_name: p.school_name||p.schoolName||row.name?.replace(/\s*\[.*\]/,'').trim()||'SMS Client School', contact_person: p.contact_person||p.contactPerson||'Principal', phone: p.phone||'', email: p.email||'', status: p.is_locked||p.isLocked||!row.is_active?'suspended':(p.status||'trial_active'), is_locked: Boolean(p.is_locked||p.isLocked||!row.is_active), is_timer_visible: p.is_timer_visible!==undefined?p.is_timer_visible:(p.isTimerVisible!==false), days_remaining: p.days_remaining!==undefined?p.days_remaining:(p.daysRemaining??30), max_students: p.max_students??p.maxStudents??200, trial_ends_at: p.trial_ends_at||p.trialEndsAt, bound_device_id: p.bound_device_id||p.activated_device_id||null, notes: p.notes||'', created_at: row.created_at };
    });
  }
  throw error;
}
async function upsertLicenseResilient(serverDb, payload){
  const { data, error } = await serverDb.from('school_licenses').upsert(payload, {onConflict:'license_key'}).select().maybeSingle();
  if(!error) return data;
  if(error.code==='PGRST205'||error.code==='42P01'||String(error.message||'').includes('school_licenses')){
    const code='LIC:'+payload.license_key;
    const name=`${payload.school_name||'SMS Academy'} [${String(payload.status||'').toUpperCase()}]`;
    const isActive=payload.status==='licensed'||payload.status==='trial_active';
    const {error:cErr}=await serverDb.from('courses').upsert({code,name,level:'License',description:JSON.stringify(payload),is_active:isActive,updated_at:new Date().toISOString()},{onConflict:'code'});
    if(cErr) throw cErr;
    return payload;
  }
  throw error;
}
async function updateLicenseStatusResilient(serverDb, cleanKey, updateObj){
  const { data, error } = await serverDb.from('school_licenses').update(updateObj).eq('license_key', cleanKey).select().maybeSingle();
  if(!error && data) return data;
  if(!error || error.code==='PGRST205'||error.code==='42P01'||String(error?.message||'').includes('school_licenses')){
    const code='LIC:'+cleanKey;
    const { data: existing } = await serverDb.from('courses').select('*').eq('code', code).maybeSingle();
    let payload = {}; if(existing?.description) try{payload=JSON.parse(existing.description);}catch{}; else payload={id:`LIC-${cleanKey}`,license_key:cleanKey,school_name:'SMS Academy'};
    Object.assign(payload, updateObj);
    const isActive=payload.status==='licensed'||payload.status==='trial_active';
    const name=`${payload.school_name||'SMS Academy'} [${String(payload.status||'').toUpperCase()}]`;
    await serverDb.from('courses').upsert({code,name,level:'License',description:JSON.stringify(payload),is_active:isActive,updated_at:new Date().toISOString()},{onConflict:'code'});
    return payload;
  }
  throw error;
}
async function deleteLicenseResilient(serverDb, cleanKey){
  try{ await serverDb.from('school_licenses').delete().eq('license_key', cleanKey);}catch{}
  try{ await serverDb.from('courses').delete().eq('code','LIC:'+cleanKey);}catch{}
  return true;
}
function hashPin(pin){ return crypto.createHash('sha256').update(String(pin||'')).digest('hex'); }

export default async function handler(req, res){
  applyCors(req, res, ALLOWED_ORIGINS_EXTRA);
  if(preflightResponse(req,res)) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!supabaseUrl || !serviceKey) return res.status(500).json({ok:false, error:'Licensing server not configured.'});
  const serverDb = createClient(supabaseUrl, serviceKey, {auth:{persistSession:false}});

  // Auth: hashed admin PIN or owner email token, no hardcoded PIN
  const devPinHeader = req.headers['x-developer-pin'] || req.headers['x-admin-pin'] || '';
  const devSecretHeader = req.headers['x-developer-secret'] || '';
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i,'').trim();

  const configuredPinHash = process.env.ADMIN_PIN_HASH || ''; // sha256 of PIN
  const configuredPlainPin = process.env.ADMIN_PIN || ''; // fallback plain for setup, should be hashed in prod
  const allowedEmails = (process.env.MASTER_ADMIN_EMAILS || process.env.DEVELOPER_EMAIL || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

  let isAuthorized = false;
  if (devPinHeader) {
    if (configuredPinHash && hashPin(devPinHeader) === configuredPinHash) isAuthorized = true;
    else if (configuredPlainPin && devPinHeader === configuredPlainPin) isAuthorized = true;
  }
  if (!isAuthorized && devSecretHeader && process.env.DEVELOPER_SECRET && devSecretHeader === process.env.DEVELOPER_SECRET) isAuthorized = true;
  if (!isAuthorized && token) {
    try{
      const { data:{user} } = await serverDb.auth.getUser(token);
      if(user && allowedEmails.includes(user.email?.trim().toLowerCase())) isAuthorized = true;
    }catch{}
  }
  if(!isAuthorized) return res.status(403).json({ok:false, error:'Access Denied: Admin authentication required.'});

  if(req.method==='GET'){
    try{ const licenses=await fetchLicensesResilient(serverDb); return res.status(200).json({ok:true, licenses: licenses||[]}); }
    catch(err){ return res.status(500).json({ok:false, error: err.message}); }
  }
  if(req.method==='POST'){
    const { action, license, licenseKey, durationDays, newStatus } = req.body||{};
    try{
      if(action==='upsert' && license){
        const cleanKey=String(license.licenseKey||license.license_key||'').trim().toUpperCase();
        if(!cleanKey) return res.status(400).json({ok:false, error:'licenseKey required.'});
        const payload={
          license_key: cleanKey,
          school_name: license.schoolName||license.school_name||'SMS Academy',
          contact_person: license.contactPerson||license.contact_person||'Principal / Administrator',
          email: license.email||'', phone: license.phone||'',
          status: license.status||'trial_active', is_locked: Boolean(license.isLocked||license.is_locked),
          days_remaining: license.daysRemaining??license.days_remaining??30,
          max_students: parseInt(license.maxStudents??license.max_students??200,10)||200,
          trial_started_at: license.trialStartedAt||license.trial_started_at||new Date().toISOString(),
          trial_ends_at: license.trialEndsAt||license.trial_ends_at||new Date(Date.now()+30*86400000).toISOString(),
          is_timer_visible: license.isTimerVisible!==false,
          bound_device_id: license.boundDeviceId||license.bound_device_id||null,
          notes: license.notes||'', updated_at: new Date().toISOString(),
        };
        const result=await upsertLicenseResilient(serverDb, payload);
        // audit
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action:'upsert', new_value: payload }); }catch{}
        return res.status(200).json({ok:true, license: result});
      }
      if(action==='suspend'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        const updated=await updateLicenseStatusResilient(serverDb, cleanKey, { status:'suspended', is_locked:true, updated_at:new Date().toISOString() });
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action:'suspend', new_value:{is_locked:true}});}catch{}
        return res.status(200).json({ok:true, message:`License ${cleanKey} suspended.`, license: updated});
      }
      if(action==='unlock'||action==='activate'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        const updated=await updateLicenseStatusResilient(serverDb, cleanKey, { status: newStatus||'trial_active', is_locked:false, updated_at:new Date().toISOString() });
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action:'unlock', new_value:{is_locked:false}});}catch{}
        return res.status(200).json({ok:true, message:`License ${cleanKey} unlocked.`, license: updated});
      }
      if(action==='set_days'||action==='adjust_days'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        let days=0;
        if(action==='adjust_days' && req.body?.deltaDays!==undefined) days=Math.max(0,(parseInt(req.body?.currentDays,10)||0)+parseInt(req.body.deltaDays,10));
        else days=Math.max(0, parseInt(durationDays,10)||0);
        if(days===9999) days=9999;
        const now=new Date(); const newEndsAt=new Date(now.getTime()+days*86400000).toISOString();
        const computedStatus=days>=9000?'licensed':(days>0?'trial_active':'trial_expired');
        const isLocked=days<=0 && computedStatus!=='licensed';
        const updated=await updateLicenseStatusResilient(serverDb, cleanKey, { status: isLocked?'suspended':computedStatus, is_locked:isLocked, days_remaining: days, trial_ends_at: newEndsAt, updated_at: now.toISOString() });
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action: action, old_value:{}, new_value:{days_remaining:days}});}catch{}
        return res.status(200).json({ok:true, message:`License ${cleanKey} set to ${days} days.`, license: updated, days});
      }
      if(action==='toggle_timer'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        const isTimerVisible=Boolean(req.body?.isTimerVisible);
        const updated=await updateLicenseStatusResilient(serverDb, cleanKey, { is_timer_visible: isTimerVisible, updated_at:new Date().toISOString() });
        return res.status(200).json({ok:true, message:`Timer ${isTimerVisible?'ON':'OFF'} for ${cleanKey}`, license: updated});
      }
      if(action==='reset_device'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        const updated=await updateLicenseStatusResilient(serverDb, cleanKey, { bound_device_id:null, activated_device_id:null, is_activated:false, bound_at:null, activated_at:null, updated_at:new Date().toISOString() });
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action:'reset_device', new_value:{bound_device_id:null}});}catch{}
        return res.status(200).json({ok:true, message:`Binding cleared for ${cleanKey}`, license: updated});
      }
      if(action==='delete'){
        const cleanKey=String(licenseKey).trim().toUpperCase();
        await deleteLicenseResilient(serverDb, cleanKey);
        try{ await serverDb.from('license_audit_log').insert({ license_key: cleanKey, action:'delete', new_value:{deleted:true}});}catch{}
        return res.status(200).json({ok:true, message:`License ${cleanKey} deleted.`});
      }
      if(action==='list_audit'){
        const cleanKey= licenseKey ? String(licenseKey).trim().toUpperCase() : null;
        let q=serverDb.from('license_audit_log').select('*').order('created_at',{ascending:false}).limit(100);
        if(cleanKey) q=q.eq('license_key', cleanKey);
        const { data }=await q;
        return res.status(200).json({ok:true, audits: data||[]});
      }
      return res.status(400).json({ok:false, error:'Unknown action.'});
    }catch(err){ return res.status(500).json({ok:false, error: err.message}); }
  }
  return res.status(405).json({ok:false, error:'Method Not Allowed'});
}
