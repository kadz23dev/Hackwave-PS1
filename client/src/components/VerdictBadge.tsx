import React from 'react';

export const BADGE_DEFINITIONS: Record<string, [string, string, string]> = {
  PASS: ['✓', 'PASS', 'badge--pass'],
  HEALED_PASS: ['⚡', 'HEALED', 'badge--healed'],
  APP_BUG: ['✕', 'APP BUG', 'badge--bug'],
  NEEDS_REVIEW: ['?', 'NEEDS REVIEW', 'badge--review'],
  FAIL_UNREPAIRABLE: ['!', 'FAIL UNREPAIRABLE', 'badge--fail'],
  PROPOSED: ['✦', 'PROPOSED', 'badge--proposed'],
};

interface VerdictBadgeProps {
  verdict: string;
  className?: string;
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict, className = '' }) => {
  const norm = (verdict || 'PASS').toUpperCase();
  const def = BADGE_DEFINITIONS[norm] || ['•', norm, 'badge--neutral'];
  const [icon, label, variantClass] = def;

  return (
    <span className={`badge ${variantClass} ${className}`.trim()} role="status">
      <span className="badge__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="badge__label">{label}</span>
    </span>
  );
};
