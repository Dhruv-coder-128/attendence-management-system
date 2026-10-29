import React, { useState, useEffect, useCallback } from 'react';
import { adminFetchLicenses, adminSuspend, adminUnlock, adminSetDays, adminAdjustDays, adminToggleTimer, adminResetDevice, adminDelete, adminFetchAudits, adminCreateLicense } from '../../lib/adminService.js';
import { STUDENT_CAPACITY_TIERS } from '../../lib/licenseService.js';
import { supabase } from '../../lib/supabase.js';

function daysText(n){ if(n>=9999) return '∞'; return String(n); }
function statusBadge(s){
  const map={ trial_active:'bg-emerald-100 text-emerald-700', licensed:'bg-blue-100 text-blue-700', trial_expired:'bg-amber-100 text-amber-800', suspended:'bg-red-100 text-red-700' };
  return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[s]||'bg-slate-100 text-slate-600'}`}>{s?.replace('_',' ')}</span>;
}
function countdownText(trialEndsAt, days){
  if(days>=9999) return 'Lifetime';
  if(!trialEndsAt) return `${days}d`;
  const ms=new Date(trialEndsAt).getTime()-Date.now();
  if(ms<=0) return 'Expired';
  const d=Math.floor(ms/86400000), h=Math.floor(ms%86400000/3600000), m=Math.floor(ms%3600000/60000);
  return `${d}d ${h}h ${m}m`;
}

export default function AdminDashboard({ pin, onLogout }){
  const [licenses, setLicenses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [createForm,setCreateForm]=useState({ schoolName:'', contactPerson:'', email:'', phone:'', licenseKey:'', daysRemaining:30, maxStudents:200, notes:'', isLocked:false });
  const [audits,setAudits]=useState([]);
  const [showAudits,setShowAudits]=useState(null);
  const [tick,setTick]=useState(Date.now());

  useEffect(()=>{ const id=setInterval(()=>setTick(Date.now()), 60000); return ()=>clearInterval(id); },[]);

  const load=useCallback(async()=>{
    setLoading(true); setError('');
    try{ setLicenses(await adminFetchLicenses(pin)); }catch(e){ setError(e.message);} finally{ setLoading(false); }
  },[pin]);
  useEffect(()=>{ load(); },[load]);

  // Realtime subscription
  useEffect(()=>{
    if(!supabase) return;
    const ch=supabase.channel('admin-school_licenses')
      .on('postgres_changes',{event:'*',schema:'public',table:'school_licenses'}, (payload)=>{ load(); })
      .subscribe();
    return ()=>{ try{ supabase.removeChannel(ch);}catch{} };
  },[load]);

  const filtered=licenses.filter(l=>{
    if(!search) return true;
    const q=search.toLowerCase();
    return (l.school_name||'').toLowerCase().includes(q) || (l.license_key||'').toLowerCase().includes(q) || (l.email||'').toLowerCase().includes(q);
  });

  async function handleCreate(e){
    e.preventDefault();
    const key=(createForm.licenseKey||'').trim().toUpperCase() || `SMS-${createForm.schoolName.slice(0,3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    try{
      await adminCreateLicense(pin, {
        schoolName: createForm.schoolName,
        contactPerson: createForm.contactPerson||'Principal',
        email: createForm.email, phone: createForm.phone,
        licenseKey: key, daysRemaining: parseInt(createForm.daysRemaining,10)||30,
        maxStudents: parseInt(createForm.maxStudents,10)||200,
        notes: createForm.notes, status: createForm.isLocked?'suspended':'trial_active', isLocked: createForm.isLocked,
        trialStartedAt: new Date().toISOString(),
        trialEndsAt: new Date(Date.now()+ (parseInt(createForm.daysRemaining,10)||30)*86400000).toISOString(),
      });
      setShowCreate(false);
      setCreateForm({ schoolName:'', contactPerson:'', email:'', phone:'', licenseKey:'', daysRemaining:30, maxStudents:200, notes:'', isLocked:false });
      load();
    }catch(err){ alert(err.message); }
  }

  async function doAction(fn, msg){
    try{ await fn(); load(); }catch(err){ alert(err.message); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white text-sm font-bold">A</div>
            <h1 className="font-bold text-slate-900">Admin Console</h1>
            <span className="hidden sm:inline text-xs text-slate-400 ml-2">Manage schools, time, locks & devices</span>
          </div>
          <div className="flex items-center gap-2">
            <input placeholder="Search school / license / email" value={search} onChange={e=>setSearch(e.target.value)} className="hidden sm:block w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
            <button onClick={load} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50">Refresh</button>
            <button onClick={onLogout} className="rounded-lg bg-slate-900 text-white px-4 py-1.5 text-sm">Logout</button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">Total Schools</div><div className="text-2xl font-bold">{licenses.length}</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">Active</div><div className="text-2xl font-bold text-emerald-600">{licenses.filter(l=>!l.is_locked && l.status!=='suspended').length}</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">Locked</div><div className="text-2xl font-bold text-red-600">{licenses.filter(l=>l.is_locked||l.status==='suspended').length}</div></div>
          <div className="bg-white rounded-xl border p-4"><div className="text-xs text-slate-500">Expiring ≤7d</div><div className="text-2xl font-bold text-amber-600">{licenses.filter(l=> (l.days_remaining??0) >0 && (l.days_remaining??0) <=7).length}</div></div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Schools & Licenses</h2>
          <button onClick={()=>setShowCreate(true)} className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700">+ New School License</button>
        </div>

        {error && <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="text-center py-10 text-slate-500">Loading...</div> : (
          <>
            {/* Mobile search */}
            <input placeholder="Search school / license" value={search} onChange={e=>setSearch(e.target.value)} className="sm:hidden w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <div className="grid gap-4">
              {filtered.map(l=> {
                const days=l.days_remaining??0;
                const key=l.license_key;
                return (
                  <div key={key} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{l.school_name}</div>
                        <div className="text-xs text-slate-500 font-mono">{key} · {l.contact_person||''} · {l.email||''} {l.phone||''}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {statusBadge(l.status)}
                          <span className="text-xs px-2 py-1 rounded-full bg-slate-100">{l.max_students ?? 200} students · {STUDENT_CAPACITY_TIERS.find(t=>t.maxStudents===(l.max_students||200))?.label || l.max_students}</span>
                          {l.bound_device_id ? <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-800">Bound: {String(l.bound_device_id).slice(0,12)}…</span> : <span className="text-xs px-2 py-1 rounded-full bg-slate-100">Unbound</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums">{daysText(days)} <span className="text-xs font-normal text-slate-500">days</span></div>
                        <div className="text-xs text-slate-500">⏱ {countdownText(l.trial_ends_at, days)}</div>
                        <div className="text-xs text-slate-400">Timer {l.is_timer_visible!==false ? 'visible' : 'hidden'}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                      <button onClick={()=>doAction(()=>adminAdjustDays(pin,key,50,l.days_remaining),'')} className="rounded-lg bg-emerald-600 text-white px-3 py-1.5 text-xs font-medium">+50 days</button>
                      <button onClick={()=>{ const v=prompt('Add days (negative to remove):','10'); if(v!==null) doAction(()=>adminAdjustDays(pin,key,parseInt(v,10)||0,l.days_remaining)); }} className="rounded-lg border px-3 py-1.5 text-xs">± days</button>
                      <button onClick={()=>{ const v=prompt('Set exact days:','30'); if(v!==null) doAction(()=>adminSetDays(pin,key,parseInt(v,10)||0)); }} className="rounded-lg border px-3 py-1.5 text-xs">Set days</button>
                      <button onClick={()=>doAction(()=> l.is_locked||l.status==='suspended' ? adminUnlock(pin,key) : adminSuspend(pin,key))} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${l.is_locked||l.status==='suspended' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-600 text-white'}`}>{l.is_locked||l.status==='suspended' ? 'Unlock' : 'Lock / Suspend'}</button>
                      <button onClick={()=>doAction(()=>adminToggleTimer(pin,key,!(l.is_timer_visible!==false)))} className="rounded-lg border px-3 py-1.5 text-xs">{l.is_timer_visible!==false?'Hide timer':'Show timer'}</button>
                      <button onClick={()=> doAction(()=>adminResetDevice(pin,key))} className="rounded-lg border px-3 py-1.5 text-xs">Unbind device</button>
                      <button onClick={async()=>{ const list=await adminFetchAudits(pin,key); setAudits(list); setShowAudits(key); }} className="rounded-lg border px-3 py-1.5 text-xs">Audit log</button>
                      <button onClick={()=>{ const tier=prompt('Tier capacity (200,500,1000,5000):', String(l.max_students||200)); if(tier) { /* tier update via license-manage not exposed; use upsert path: call adjust */ } }} className="rounded-lg border px-3 py-1.5 text-xs">Tier</button>
                      <button onClick={()=>{ if(confirm('Delete '+key+'? This cannot be undone.')) doAction(()=>adminDelete(pin,key)); }} className="rounded-lg bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 text-xs">Delete</button>
                    </div>
                    {l.notes && <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2">Notes: {l.notes}</div>}
                  </div>
                );
              })}
              {filtered.length===0 && <div className="text-center py-10 text-slate-500 bg-white rounded-2xl border">No schools found.</div>}
            </div>
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-20">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-auto">
            <h3 className="font-bold">Create School License</h3>
            <input required placeholder="School name *" value={createForm.schoolName} onChange={e=>setCreateForm(s=>({...s,schoolName:e.target.value}))} className="w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Contact person" value={createForm.contactPerson} onChange={e=>setCreateForm(s=>({...s,contactPerson:e.target.value}))} className="rounded-lg border px-3 py-2 text-sm" />
              <input placeholder="Phone" value={createForm.phone} onChange={e=>setCreateForm(s=>({...s,phone:e.target.value}))} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <input placeholder="Email" value={createForm.email} onChange={e=>setCreateForm(s=>({...s,email:e.target.value}))} className="w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="License key (auto if blank)" value={createForm.licenseKey} onChange={e=>setCreateForm(s=>({...s,licenseKey:e.target.value}))} className="rounded-lg border px-3 py-2 text-sm font-mono" />
              <input type="number" placeholder="Days" value={createForm.daysRemaining} onChange={e=>setCreateForm(s=>({...s,daysRemaining:e.target.value}))} className="rounded-lg border px-3 py-2 text-sm" />
            </div>
            <select value={createForm.maxStudents} onChange={e=>setCreateForm(s=>({...s,maxStudents:e.target.value}))} className="w-full rounded-lg border px-3 py-2 text-sm">
              {STUDENT_CAPACITY_TIERS.map(t=> <option key={t.id} value={t.maxStudents}>{t.label}</option>)}
            </select>
            <textarea placeholder="Notes" value={createForm.notes} onChange={e=>setCreateForm(s=>({...s,notes:e.target.value}))} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" />
            <div className="flex gap-3">
              <button type="submit" className="flex-1 rounded-xl bg-indigo-600 text-white py-2.5 text-sm font-semibold">Create</button>
              <button type="button" onClick={()=>setShowCreate(false)} className="rounded-xl border px-6 py-2.5 text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Audit drawer */}
      {showAudits && (
        <div className="fixed inset-0 bg-black/50 flex justify-end z-20" onClick={()=>setShowAudits(null)}>
          <div onClick={e=>e.stopPropagation()} className="w-full max-w-md bg-white h-full overflow-auto p-6 space-y-3">
            <div className="flex items-center justify-between"><h3 className="font-bold">Audit log — {showAudits}</h3><button onClick={()=>setShowAudits(null)} className="rounded-lg border px-3 py-1 text-sm">Close</button></div>
            {audits.length===0 ? <div className="text-sm text-slate-500">No entries yet.</div> : audits.map((a,i)=>(
              <div key={a.id||i} className="rounded-xl border p-3 text-sm">
                <div className="font-mono text-xs text-slate-500">{new Date(a.created_at).toLocaleString()} — <span className="font-semibold">{a.action}</span></div>
                <div className="mt-1 text-xs break-words">{JSON.stringify(a.new_value||a.old_value||{}).slice(0,400)}</div>
                {a.performed_by && <div className="text-xs text-slate-400">by {a.performed_by}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
