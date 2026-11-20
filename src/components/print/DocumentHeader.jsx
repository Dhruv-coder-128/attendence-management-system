import React from 'react';
import { GraduationCap } from 'lucide-react';

/** The same school letterhead on every printed document. Empty settings are simply left out. */
export function DocumentHeader({ branding, title, meta = [] }) {
  const line1 = [branding.branch_name, branding.address].filter(Boolean).join(' • ');
  const line2 = [branding.phone && `Phone: ${branding.phone}`, branding.email && `Email: ${branding.email}`].filter(Boolean).join(' • ');
  const cells = meta.filter(([, v]) => v !== undefined && v !== null && v !== '');
  return (
    <div className="doc-header">
      <div className="doc-header-brand">
        {branding.logo_url ? <img src={branding.logo_url} alt="" className="doc-logo" /> : <GraduationCap size={30} />}
        <span className="doc-school">{branding.academy_name}</span>
      </div>
      {line1 && <div className="doc-line1">{line1}</div>}
      {line2 && <div className="doc-line2">{line2}</div>}
      {branding.tagline && <div className="doc-tagline">{branding.tagline}</div>}
      <div className="doc-title">{title}</div>
      {cells.length > 0 && (
        <div className="doc-meta">
          {cells.map(([k, v]) => (
            <span key={k}>{k}: <strong>{v}</strong></span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Signature lines + a plain "generated on" note, the same on every document. */
export function DocumentFooter({ signatures = ['Authorized Signatory'], note }) {
  return (
    <div className="doc-footer">
      <div className="doc-signatures">
        {signatures.map((s) => <div key={s} className="doc-signature">{s}</div>)}
      </div>
      <div className="doc-generated">
        {note ? `${note} • ` : ''}Computer-generated document • {new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
