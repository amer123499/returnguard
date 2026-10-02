import RiskBadge from './RiskBadge.jsx';

const IMPACT_TEXT = {
  raises: 'Raises risk',
  lowers: 'Lowers risk',
  neutral: 'No concern',
};

/** Score meter with the low / medium / high bands marked. */
export function ScoreMeter({ score, level }) {
  return (
    <div className="meter" role="img" aria-label={`Risk score ${score} out of 100`}>
      <div className="meter-track">
        <div className="meter-band band-low" style={{ width: '35%' }} />
        <div className="meter-band band-medium" style={{ width: '25%' }} />
        <div className="meter-band band-high" style={{ width: '40%' }} />
        <div className={`meter-marker risk-${level}`} style={{ left: `${score}%` }} />
      </div>
      <div className="meter-scale">
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: '35%' }}>35</span>
        <span style={{ left: '60%' }}>60</span>
        <span style={{ left: '100%' }}>100</span>
      </div>
    </div>
  );
}

/**
 * The heart of ReturnGuard: the score, a one-line summary, what to do,
 * and every factor with a plain-language reason.
 */
export default function RiskExplanation({ score, riskLevel, summary, recommendation, factors, modelVersion }) {
  const raising = factors.filter((f) => f.points > 0);
  const other = factors.filter((f) => f.points <= 0);

  return (
    <section className="card explanation">
      <div className="explanation-head">
        <RiskBadge level={riskLevel} score={score} large />
        <ScoreMeter score={score} level={riskLevel} />
      </div>

      <p className="explanation-summary">{summary}</p>

      <div className={`recommendation rec-${riskLevel}`}>
        <strong>What to do</strong>
        <p>{recommendation}</p>
      </div>

      <h3 className="section-title">Why this score</h3>
      {raising.length === 0 && <p className="muted">Nothing about this return raised its risk.</p>}
      <ul className="factor-list">
        {raising.map((f) => <Factor key={f.key} f={f} />)}
      </ul>

      {other.length > 0 && (
        <>
          <h4 className="subsection-title">Also checked</h4>
          <ul className="factor-list">
            {other.map((f) => <Factor key={f.key} f={f} />)}
          </ul>
        </>
      )}
      <p className="fineprint">
        Score = sum of the points above (0–100). 0–34 low, 35–59 medium, 60+ high. Scoring rules {modelVersion}.
      </p>
    </section>
  );
}

function Factor({ f }) {
  const width = f.maxPoints ? `${(Math.abs(f.points) / f.maxPoints) * 100}%` : '0%';
  return (
    <li className={`factor impact-${f.impact}`}>
      <div className="factor-top">
        <span className="factor-label">{f.label}</span>
        <span className="factor-points">
          {f.points > 0 ? `+${f.points}` : f.points} <span className="muted">pts</span>
        </span>
      </div>
      <div className="factor-bar" aria-hidden="true">
        <div className="factor-bar-fill" style={{ width }} />
      </div>
      <p className="factor-detail">
        <span className="factor-impact">{IMPACT_TEXT[f.impact]}:</span> {f.detail}
      </p>
    </li>
  );
}
