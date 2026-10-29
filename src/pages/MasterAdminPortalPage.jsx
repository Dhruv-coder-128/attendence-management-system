import React, { useState, useEffect } from 'react';
import AdminAuth from './AdminConsole/AdminAuth.jsx';
import LocalAdminDashboard from './AdminConsole/LocalAdminDashboard.jsx';

export default function MasterAdminPortalPage(){
  const [pin, setPin] = useState(()=> sessionStorage.getItem('sms_admin_pin') || '');
  const [authed, setAuthed] = useState(()=> Boolean(sessionStorage.getItem('sms_admin_pin')));

  // For local mode, allow simple PIN "admin" or any stored PIN — dev can set own
  // Previous Supabase PIN check is replaced by local check
  function handleAuth(p){ setPin(p); setAuthed(true); }
  function handleLogout(){ sessionStorage.removeItem('sms_admin_pin'); setPin(''); setAuthed(false); }

  // Quick local auth: if no PIN set, allow "admin" as default for dev convenience
  // User can change this by setting localStorage sms_dev_pin
  if(!authed){
    return <AdminAuth onAuthenticated={handleAuth} onCancel={null} localOnly={true} />;
  }
  return <LocalAdminDashboard pin={pin} onLogout={handleLogout} />;
}
