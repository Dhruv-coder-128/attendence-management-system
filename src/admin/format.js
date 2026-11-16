export const PLANS = [
  { limit: 200, label: 'Starter · 200' },
  { limit: 500, label: 'Growth · 500' },
  { limit: 1000, label: 'Pro · 1,000' },
  { limit: 5000, label: 'Enterprise · 5,000+' },
];

export const EXPIRING_SOON_DAYS = 7;

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export function timeAgo(iso) {
  if (!iso) return 'Never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'Just now';
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 129600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** One label + colour per school, in priority order: locked > expired > expiring > active. */
export function schoolState(s) {
  if (s.isLocked) return { id: 'locked', label: 'Locked', tone: 'red' };
  if (s.status === 'trial_expired') return { id: 'expired', label: 'Expired', tone: 'red' };
  if (!s.isLifetime && s.daysRemaining <= EXPIRING_SOON_DAYS) return { id: 'expiring', label: `Ends in ${s.daysRemaining}d`, tone: 'amber' };
  if (s.type === 'paid') return { id: 'active', label: s.isLifetime ? 'Lifetime' : 'Paid', tone: 'green' };
  return { id: 'active', label: 'Trial', tone: 'blue' };
}

export const expiryText = (s) => (s.isLifetime ? 'Never' : s.trialEndsAt ? fmtDate(s.trialEndsAt) : '—');

export function activationMessage(s) {
  const validity = s.isLifetime ? 'Lifetime licence' : `${s.type === 'paid' ? 'Licence' : 'Free trial'} until ${fmtDate(s.trialEndsAt)}`;
  return [
    'SMS — Student Management System',
    '',
    `Dear ${s.contactPerson || 'School Administrator'},`,
    `Here is the activation key for ${s.schoolName}:`,
    '',
    `Licence key: ${s.licenseKey}`,
    `Validity: ${validity}`,
    `Student limit: ${s.maxStudents.toLocaleString()}`,
    'This key works on one computer. Install SMS, enter the key when asked.',
  ].join('\n');
}

export const AUDIT_LABELS = {
  create: 'Created school',
  update: 'Edited details',
  set_days: 'Changed validity',
  set_lock: 'Lock / unlock',
  set_timer: 'Timer visibility',
  set_tier: 'Student limit',
  reset_device: 'Reset computer',
  delete: 'Deleted school',
};

export function auditSummary(e) {
  const d = e.details || {};
  switch (e.action) {
    case 'create': return `${d.type === 'licensed' ? 'Paid' : 'Trial'}, ${d.days >= 9000 ? 'lifetime' : `${d.days} days`}, ${d.maxStudents} students`;
    case 'set_days': return d.exact ? `Set to ${d.days >= 9000 ? 'lifetime' : `${d.days} days from today`}` : `${d.days > 0 ? '+' : ''}${d.days} days`;
    case 'set_lock': return d.locked ? 'Locked' : 'Unlocked';
    case 'set_timer': return d.visible ? 'Timer shown' : 'Timer hidden';
    case 'set_tier': return `${d.maxStudents} students`;
    case 'reset_device': return d.previousDevice ? `Freed ${d.previousDevice}` : 'Was not bound';
    default: return '';
  }
}
