import React from 'react';

/**
 * Enterprise Form Input Component
 */
export default function Input({
  label,
  id,
  type = 'text',
  value,
  onChange,
  placeholder,
  helperText,
  error,
  required = false,
  className = '',
  disabled = false,
  ...props
}) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label} {required && <span style={{ color: 'var(--status-absent)' }}>*</span>}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="form-input"
        style={error ? { borderColor: 'var(--status-absent)' } : {}}
        {...props}
      />
      {helperText && !error && (
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {helperText}
        </span>
      )}
      {error && (
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--status-absent)', marginTop: '4px' }}>
          {error}
        </span>
      )}
    </div>
  );
}
