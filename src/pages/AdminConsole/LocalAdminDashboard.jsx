import React, { useState, useEffect } from 'react';
import { createLicenseToken, parseLicenseToken, getLocalRegistry, upsertLocalClient, deleteLocalClient } from '../../lib/localLicenseVault.js';
import { STUDENT_CAPACITY_TIERS } from '../../lib/licenseService.js';

function daysLabel(n){ if(n>=9999) return '∞ Lifetime'; return `${n} days`; }
function badge(s){
  const m={ trial_active:'bg-emerald-100 text-emerald-700', licensed:'bg-blue-100 text-blue-700', trial_expired:'bg-amber-100 text-amber-800', suspended:'bg-red-100 text-red-700' };
  return <span className={`px-2 py-1 rounded-full text-xs font-bold ${m[s]||'bg-slate-100'}`}>{s}</span>;
}

export default function LocalAdminDashboard({ onLogout }){
  const [list,setList]=useState(()=> getLocalRegistry());
  const [search,setSearch]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [form,setForm]=useState({ schoolName:'', contactPerson:'', email:'', phone:'', licenseKey:'', daysRemaining:30, maxStudents:200, isLocked:false, isTimerVisible:true, notes:'' });
  const [editKey,setEditKey]=useState(null);
  const [tokenOut,setTokenOut]=useState('');
  const [tokenFor,setTokenFor]=useState('');
  const [importToken,setImportToken]=useState('');
  const [msg,setMsg]=useState('');

  function refresh(){ setList(getLocalRegistry()); }

  const filtered = list.filter(c=>{
    if(!search) return true;
    const q=search.toLowerCase();
    return (c.schoolName||'').toLowerCase().includes(q) || (c.licenseKey||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q);
  });

  function handleCreate(e){
    e.preventDefault();
    if(!form.schoolName.trim()){ alert('School name required'); return; }
    const token = createLicenseToken(form);
    const parsed = parseLicenseToken(token);
    const client = { ...parsed.data, licenseKey: parsed.data.licenseKey, updatedAt: new Date().toISOString() };
    upsertLocalClient(client);
    setTokenOut(token); setTokenFor(client.licenseKey);
    setShowCreate(false);
    refresh();
    setMsg(`Created ${client.schoolName} — token below. Send this code to client via WhatsApp.`);
    setEditKey(null);
    setForm({ schoolName:'', contactPerson:'', email:'', phone:'', licenseKey:'', daysRemaining:30, maxStudents:200, isLocked:false, isTimerVisible:true, notes:'' });
  }

  function startEdit(c){
    setForm({ schoolName:c.schoolName, contactPerson:c.contactPerson||'', email:c.email||'', phone:c.phone||'', licenseKey:c.licenseKey, daysRemaining:c.daysRemaining, maxStudents:c.maxStudents||200, isLocked:!!c.isLocked, isTimerVisible:c.isTimerVisible!==false, notes:c.notes||'' });
    setEditKey(c.licenseKey);
    setShowCreate(true);
  }

  function doAdjust(c, delta){
    const newDays = Math.max(0, Math.min(9999, (parseInt(c.daysRemaining,10)||0)+delta));
    const token = createLicenseToken({ ...c, daysRemaining: newDays });
    const p=parseLicenseToken(token);
    upsertLocalClient({ ...p.data });
    refresh(); setTokenOut(token); setTokenFor(c.licenseKey); setMsg(`Updated ${c.schoolName}: ${delta>0?'+':''}${delta} days -> ${newDays} days. Send new code to client.`);
  }
  function doLockToggle(c){
    const token = createLicenseToken({ ...c, isLocked: !c.isLocked });
    const p=parseLicenseToken(token);
    upsertLocalClient({ ...p.data }); refresh(); setTokenOut(token); setTokenFor(c.licenseKey); setMsg(`${c.isLocked?'Unlocked':'Locked'} ${c.schoolName}. Send code to client to apply.`);
  }
  function doDelete(k){
    if(!confirm('Delete '+k+' ?')) return;
    deleteLocalClient(k); refresh(); setMsg('Deleted '+k);
  }
  function doCopyToken(){
    navigator.clipboard.writeText(tokenOut).then(()=> setMsg('Token copied! Send to client on WhatsApp.')).catch(()=>{});
  }
  function doExportAll(){
    const json = JSON.stringify(list, null, 2);
    const blob=new Blob([json],{type:'application/json'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='sms-clients-backup.json'; a.click();
  }
  function doImportRegistry(e){
    const file=e.target.files?.[0]; if(!file) return;
    const r=new FileReader(); r.onload=()=>{
      try{ const arr=JSON.parse(r.result); if(Array.isArray(arr)){ localStorage.setItem('sms_saas_clients_registry_v2', JSON.stringify(arr)); refresh(); setMsg('Imported '+arr.length+' clients'); } }catch(err){ alert('Invalid JSON') }
    }; r.readAsText(file);
  }
  function doGenerateForClient(c){
    const token = createLicenseToken(c);
    setTokenOut(token); setTokenFor(c.licenseKey); setMsg('Generated fresh code for '+c.schoolName+' — client must paste this in his EXE.');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 bg-white border-b p-3 flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">A</div>
          <div>
            <div className="font-bold">Admin Panel — Local Mode (No Supabase)</div>
            <div className="text-xs text-slate-500">100% offline • Tokens are copy-paste codes • Client pastes inside his EXE</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={doExportAll} className="border px-3 py-1.5 rounded-lg text-sm">Export JSON</button>
          <label className="border px-3 py-1.5 rounded-lg text-sm cursor-pointer">Import JSON <input type="file" accept=".json" onChange={doImportRegistry} className="hidden"/></label>
          <button onClick={onLogout} className="bg-slate-900 text-white px-4 py-1.5 rounded-lg text-sm">Logout</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {msg && <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-sm flex justify-between"><span>{msg}</span><button onClick={()=>setMsg('')} className="text-slate-500">×</button></div>}

        {/* Token output — this is what you send to client */}
        {tokenOut && (
          <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 space-y-2">
            <div className="font-bold text-sm">🔑 Client Update Code for {tokenFor} — SEND THIS TO CLIENT</div>
            <div className="text-xs text-slate-600">Client ne aa code copy karine ena EXE ma Settings → License → Enter Update Code ma paste karvu pade. Immediately days/lock apply thai jase.</div>
            <div className="bg-slate-950 text-emerald-300 p-3 rounded-xl text-xs font-mono break-all max-h-32 overflow-auto">{tokenOut}</div>
            <div className="flex gap-2">
              <button onClick={doCopyToken} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm">Copy Code</button>
              <button onClick={()=>{ const wa=`https://wa.me/?text=${encodeURIComponent('Your SMS license update code:\n'+tokenOut)}`; window.open(wa,'_blank'); }} className="border px-4 py-2 rounded-lg text-sm">Send via WhatsApp</button>
              <button onClick={()=>setTokenOut('')} className="border px-4 py-2 rounded-lg text-sm">Dismiss</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2">
            <button onClick={()=>{ setEditKey(null); setForm({ schoolName:'', contactPerson:'', email:'', phone:'', licenseKey:'', daysRemaining:30, maxStudents:200, isLocked:false, isTimerVisible:true, notes:'' }); setShowCreate(true); }} className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-bold">+ New School</button>
            <span className="text-sm text-slate-500 py-2">{list.length} schools</span>
          </div>
          <input placeholder="Search school / license / email" value={search} onChange={e=>setSearch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-64"/>
        </div>

        {/* Client cards */}
        <div className="grid gap-3">
          {filtered.map(c=> (
            <div key={c.licenseKey} className="bg-white border rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="font-bold">{c.schoolName}</div>
                  <div className="text-xs font-mono text-slate-500">{c.licenseKey} • {c.contactPerson||''} {c.email||''} {c.phone||''}</div>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {badge(c.status|| (c.isLocked?'suspended':'trial_active'))}
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded-full">{c.maxStudents||200} students</span>
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded-full">{daysLabel(c.daysRemaining)} {c.isLocked?'🔒 Locked':'🔓 Active'}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Ends: {c.trialEndsAt ? new Date(c.trialEndsAt).toLocaleDateString() : '-'}</div>
                  <div>{c.isTimerVisible!==false?'Timer visible':'Timer hidden'}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t pt-2">
                <button onClick={()=>doAdjust(c, 50)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs">+50 days</button>
                <button onClick={()=>{ const v=prompt('Add/remove days (+/-):','10'); if(v!==null) doAdjust(c, parseInt(v,10)||0); }} className="border px-3 py-1.5 rounded-lg text-xs">± days</button>
                <button onClick={()=>{ const v=prompt('Set exact days:','30'); if(v!==null){ const nd=parseInt(v,10)||0; const tok=createLicenseToken({...c, daysRemaining: nd}); const p=parseLicenseToken(tok); upsertLocalClient({...p.data}); refresh(); setTokenOut(tok); setTokenFor(c.licenseKey); } }} className="border px-3 py-1.5 rounded-lg text-xs">Set days</button>
                <button onClick={()=>doLockToggle(c)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${c.isLocked?'bg-emerald-100 text-emerald-700':'bg-red-600 text-white'}`}>{c.isLocked?'Unlock':'Lock'}</button>
                <button onClick={()=>doGenerateForClient(c)} className="border px-3 py-1.5 rounded-lg text-xs">Generate Code</button>
                <button onClick={()=>startEdit(c)} className="border px-3 py-1.5 rounded-lg text-xs">Edit</button>
                <button onClick={()=>doDelete(c.licenseKey)} className="bg-red-50 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg text-xs">Delete</button>
              </div>
              {c.notes && <div className="text-xs bg-slate-50 p-2 rounded-lg">Notes: {c.notes}</div>}
            </div>
          ))}
          {filtered.length===0 && <div className="text-center py-8 bg-white rounded-2xl border text-slate-500">No schools yet. Click + New School.</div>}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <div className="font-bold">Kem kaam kare che? (Gujarati)</div>
          <ol className="list-decimal ml-5 mt-2 space-y-1 text-slate-700">
            <li>Tame aa panel ma client add karo, days set karo, lock/unlock karo.</li>
            <li><b>Generate Code</b> dabao → ek <code>SMS-LOCAL-....</code> code bane.</li>
            <li>Aa code client ne WhatsApp par moklo.</li>
            <li>Client ena PC ma EXE kholi <b>Settings → License → Enter Update Code</b> ma paste kare → immediately days/lock update thai jase. Internet joye nahi.</li>
            <li>Badhu local DB ma j save chhe, Supabase bandh chhe.</li>
          </ol>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-auto">
            <h3 className="font-bold">{editKey?'Edit School':'New School'}</h3>
            <input required placeholder="School name *" value={form.schoolName} onChange={e=>setForm(s=>({...s, schoolName:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Contact person" value={form.contactPerson} onChange={e=>setForm(s=>({...s, contactPerson:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm"/>
              <input placeholder="Phone" value={form.phone} onChange={e=>setForm(s=>({...s, phone:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm"/>
            </div>
            <input placeholder="Email" value={form.email} onChange={e=>setForm(s=>({...s, email:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm"/>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="License key (auto if blank)" value={form.licenseKey} onChange={e=>setForm(s=>({...s, licenseKey:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm font-mono"/>
              <input type="number" placeholder="Days" value={form.daysRemaining} onChange={e=>setForm(s=>({...s, daysRemaining:e.target.value}))} className="border rounded-lg px-3 py-2 text-sm"/>
            </div>
            <select value={form.maxStudents} onChange={e=>setForm(s=>({...s, maxStudents:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm">
              {STUDENT_CAPACITY_TIERS.map(t=> <option key={t.id} value={t.maxStudents}>{t.label}</option>)}
            </select>
            <textarea placeholder="Notes" value={form.notes} onChange={e=>setForm(s=>({...s, notes:e.target.value}))} rows={2} className="w-full border rounded-lg px-3 py-2 text-sm"/>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isLocked} onChange={e=>setForm(s=>({...s, isLocked:e.target.checked}))}/> Locked / Suspended</label>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-bold">{editKey?'Save & Generate Code':'Create & Generate Code'}</button>
              <button type="button" onClick={()=>setShowCreate(false)} className="border px-6 py-2.5 rounded-xl text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
