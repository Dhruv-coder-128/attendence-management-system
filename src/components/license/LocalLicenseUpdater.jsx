import React, { useState } from 'react';
import { parseLicenseToken, applyLicenseToken } from '../../lib/localLicenseVault.js';

export default function LocalLicenseUpdater({ onApplied }){
  const [code,setCode]=useState('');
  const [msg,setMsg]=useState('');
  const [err,setErr]=useState('');
  function handleApply(){
    setErr(''); setMsg('');
    if(!code.trim()){ setErr('Paste the code sent by admin'); return; }
    const parsed = parseLicenseToken(code.trim());
    if(!parsed.ok){ setErr(parsed.error); return; }
    const res = applyLicenseToken(code.trim());
    if(!res.ok){ setErr(res.error); return; }
    setMsg(`Success! ${parsed.data.schoolName} — ${parsed.data.daysRemaining} days, ${parsed.data.isLocked?'Locked':'Active'}. Restart or refresh.`);
    if(onApplied) onApplied(res.data);
  }
  function handlePaste(){ navigator.clipboard.readText().then(t=> setCode(t)).catch(()=>{}); }
  return (
    <div className="bg-white border rounded-2xl p-4 space-y-3">
      <div className="font-bold text-sm">Enter Update Code (from Admin)</div>
      <div className="text-xs text-slate-500">Admin e tamne je <code>SMS-LOCAL-...</code> code moklyo hoy te ahi paste karo. Paste karta j days/lock update thai jase. Internet joye nahi.</div>
      <textarea value={code} onChange={e=>setCode(e.target.value)} placeholder="Paste SMS-LOCAL-... code here" rows={3} className="w-full border rounded-lg p-3 text-xs font-mono"/>
      <div className="flex gap-2">
        <button onClick={handleApply} className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-bold">Apply Code</button>
        <button onClick={handlePaste} className="border px-4 py-2 rounded-lg text-sm">Paste from Clipboard</button>
        <button onClick={()=>{setCode(''); setErr(''); setMsg('');}} className="border px-4 py-2 rounded-lg text-sm">Clear</button>
      </div>
      {err && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded-lg text-sm">{err}</div>}
      {msg && <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-2 rounded-lg text-sm">{msg}</div>}
    </div>
  );
}
