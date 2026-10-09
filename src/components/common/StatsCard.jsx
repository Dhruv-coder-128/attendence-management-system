import React from 'react';

/**
 * Executive Metric / Stat Card Component
 * Refined presentation with accent top border and tabular numeric display
 */
export default function StatsCard({
  title,
  value,
  subtext,
  icon: Icon,
  variant = 'navy',
  trend,
  className = '',
}) {
  return (
    <div className={`stat-card stat-${variant} ${className}`.trim()}>
      <div className="stat-header">
        <span className="stat-title">{title}</span>
        {Icon && (
          <div className="stat-icon">
            <Icon size={16} />
          </div>
        )}
      </div>

      <div className="stat-value">{value}</div>

      {(subtext || trend) && (
        <div className="stat-subtext" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span>{subtext}</span>
          {trend && (
            <span style={{ 
              fontSize: '11px', 
              fontWeight: 600, 
              color: trend.isPositive ? 'var(--status-present)' : 'var(--status-absent)' 
            }}>
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
