const LABELS = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };

/** Shape + label + colour, so risk never depends on colour alone. */
export function RiskIcon({ level, size = 14 }) {
  const common = { width: size, height: size, viewBox: '0 0 16 16', 'aria-hidden': true };
  if (level === 'high') {
    return (
      <svg {...common}>
        <path d="M5 1h6l4 4v6l-4 4H5l-4-4V5z" fill="currentColor" />
        <path d="M8 4.5v4.2" stroke="var(--on-status)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="1.1" fill="var(--on-status)" />
      </svg>
    );
  }
  if (level === 'medium') {
    return (
      <svg {...common}>
        <path d="M8 1.2 15.2 14H.8z" fill="currentColor" strokeLinejoin="round" />
        <path d="M8 5.8v3.6" stroke="var(--on-status)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.6" r="1" fill="var(--on-status)" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="m4.8 8.2 2.1 2.1 4.3-4.4" stroke="var(--on-status)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RiskBadge({ level, score, large = false }) {
  return (
    <span className={`risk-badge risk-${level} ${large ? 'risk-badge-lg' : ''}`}>
      <RiskIcon level={level} size={large ? 20 : 14} />
      <span className="risk-badge-label">{LABELS[level]}</span>
      {score !== undefined && <span className="risk-badge-score">{score}</span>}
    </span>
  );
}

export function StatusPill({ status, label }) {
  return <span className={`status-pill status-${status}`}>{label}</span>;
}
