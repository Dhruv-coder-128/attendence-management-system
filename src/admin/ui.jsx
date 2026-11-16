import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';

export function Badge({ tone = 'gray', children }) {
  return <span className={`adm-badge adm-badge-${tone}`}>{children}</span>;
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="adm-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`adm-modal ${wide ? 'adm-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="adm-modal-head">
          <h2>{title}</h2>
          <button className="adm-icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="adm-modal-body">{children}</div>
        {footer && <footer className="adm-modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      {children}
      {hint && <span className="adm-field-hint">{hint}</span>}
    </label>
  );
}

/** Asks for confirmation. If `typeToConfirm` is set, the user must type it before the button enables. */
export function ConfirmDialog({ title, message, confirmLabel, danger, typeToConfirm, onConfirm, onClose }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = !typeToConfirm || typed.trim() === typeToConfirm;
  const run = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="adm-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className={`adm-btn ${danger ? 'adm-btn-danger' : 'adm-btn-primary'}`} disabled={!ok || busy} onClick={run}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="adm-muted">{message}</p>
      {typeToConfirm && (
        <Field label={`Type "${typeToConfirm}" to confirm`}>
          <input className="adm-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
        </Field>
      )}
    </Modal>
  );
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback((message, tone = 'ok') => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className={`adm-toast adm-toast-${toast.tone}`} role="status">{toast.message}</div>}
    </ToastContext.Provider>
  );
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, label = 'Copy' }) {
  const toast = useToast();
  return (
    <button
      className="adm-btn adm-btn-sm"
      onClick={async () => toast((await copyText(text)) ? 'Copied to clipboard' : 'Copy failed. Select the text and copy it manually.', 'ok')}
    >
      {label}
    </button>
  );
}
