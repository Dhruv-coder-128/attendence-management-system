import React, { useState } from 'react';

export default function AdminAuth({ onAuthenticated, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!pin.trim()) { setError('Enter admin PIN'); return; }
    setLoading(true);
    try {
      // Validate by attempting a list call
      const base = import.meta.env?.VITE_PRODUCTION_API_URL || '';
      const url = (base ? base.replace(/\/+$/,'') : '') + '/api/license-manage';
      const res = await fetch(url, { headers: { 'Content-Type':'application/json', 'x-admin-pin': pin, 'x-developer-pin': pin } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid PIN');
      // Success: store pin for session
      sessionStorage.setItem('sms_admin_pin', pin);
      onAuthenticated(pin);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold">A</div>
          <h1 className="text-xl font-bold text-slate-900">Admin Console</h1>
          <p className="text-sm text-slate-500">Enter your admin PIN to continue</p>
          <p className="text-xs text-slate-400">PIN is configured via <code>ADMIN_PIN</code> env — never hardcoded.</p>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Admin PIN</label>
          <input
            type="password"
            value={pin}
            onChange={e=>setPin(e.target.value)}
            placeholder="Enter PIN"
            className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="flex-1 rounded-xl bg-indigo-600 text-white py-3 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {loading ? 'Verifying...' : 'Unlock Console'}
          </button>
          {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border px-6 py-3 text-sm font-medium">Cancel</button>}
        </div>
        <p className="text-center text-xs text-slate-400">Rate-limited · hashed PIN · no secrets in code</p>
      </form>
    </div>
  );
}
