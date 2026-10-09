import React from 'react';

/**
 * Enterprise Form Select Component
 */
export default function Select({
  label,
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Select option...',
  helperText,
  error,
  required = false,
  className = '',
  disabled = false,
  ...props
}) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label} {required && <span style={{ color: 'var(--status-absent)' }}>*</span>}
        </label>
      )}
      <select
        id={selectId}
        value={value}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className="form-select"
        style={error ? { borderColor: 'var(--status-absent)' } : {}}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt;
          const lbl = typeof opt === 'object' ? opt.label : opt;
          return (
            <option key={val} value={val}>
              {lbl}
            </option>
          );
        })}
      </select>
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
