import React, { useState, useEffect } from 'react';
import AdminAuth from './AdminConsole/AdminAuth.jsx';
import AdminDashboard from './AdminConsole/AdminDashboard.jsx';

export default function MasterAdminPortalPage(){
  const [pin, setPin] = useState(()=> sessionStorage.getItem('sms_admin_pin') || '');
  const [authed, setAuthed] = useState(()=> Boolean(sessionStorage.getItem('sms_admin_pin')));

  function handleAuth(p){ setPin(p); setAuthed(true); }
  function handleLogout(){ sessionStorage.removeItem('sms_admin_pin'); setPin(''); setAuthed(false); }

  if(!authed) return <AdminAuth onAuthenticated={handleAuth} onCancel={null} />;
  return <AdminDashboard pin={pin} onLogout={handleLogout} />;
}
