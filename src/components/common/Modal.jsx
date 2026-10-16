import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const SIZE_PRESETS = {
  sm: '500px',
  md: '680px',
  lg: '880px',
  xl: '1060px',
  dossier: '1160px',
};

/**
 * Enterprise Modal / Dialog Component with Modern Responsive Size Tiers
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  maxWidth,
  className = '',
}) {
  // Determine effective max-width
  const effectiveMaxWidth = maxWidth || SIZE_PRESETS[size] || SIZE_PRESETS.md;

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-dialog modal-${size} ${className}`}
        style={{ maxWidth: effectiveMaxWidth }}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-outline"
            style={{
              padding: '6px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close modal"
          >
            <X size={18} color="var(--text-muted)" />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
