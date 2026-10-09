import React from 'react';

/**
 * Enterprise Status Badge Component
 * Automatically matches status string or explicit variant
 */
export default function Badge({
  status,
  variant,
  children,
  className = '',
}) {
  // Infer variant from status text if not directly specified
  const normalized = (variant || status || 'default').toLowerCase();
  
  let appliedVariant = 'gold';
  if (normalized.includes('present')) appliedVariant = 'present';
  else if (normalized.includes('absent')) appliedVariant = 'absent';
  else if (normalized.includes('late')) appliedVariant = 'late';
  else if (normalized.includes('excused')) appliedVariant = 'excused';
  else if (normalized.includes('active') || normalized.includes('delivered')) appliedVariant = 'active';
  else if (normalized.includes('paid')) appliedVariant = 'paid';
  else if (normalized.includes('pending') || normalized.includes('queued')) appliedVariant = 'pending';
  else if (normalized.includes('overdue') || normalized.includes('failed')) appliedVariant = 'overdue';
  else if (normalized === 'gold') appliedVariant = 'gold';

  return (
    <span className={`badge badge-${appliedVariant} ${className}`.trim()}>
      {children || status}
    </span>
  );
}
