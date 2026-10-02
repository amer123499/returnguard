import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import { fmtMoneyShort, pct } from '../format.js';
import { RiskIcon } from '../components/RiskBadge.jsx';

const RANGES = [8, 12, 26];
const weekLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function Dashboard() {
  const meta = useMeta();
  const [weeks, setWeeks] = useState(12);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    setError(null);
    api.dashboard(weeks).then(setData).catch((e) => setError(e.message));
  }, [weeks]);

  if (error) return <div className="page"><p className="error">{error}</p></div>;
  if (!data) return <div className="page muted">Loading trends…</div>;

  const s = data.summary;
  const weekly = data.weekly.map((w) => ({
    ...w,
    label: weekLabel(w.week_start),
    flaggedPct: w.total ? Math.round(((w.medium + w.high) / w.total) * 100) : null,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Return-fraud trends</h1>
          <p className="muted">How many returns ReturnGuard flags, why, and where. Weeks start on Monday.</p>
        </div>
        <div className="segmented" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r} className={weeks === r ? 'active' : ''} aria-pressed={weeks === r} onClick={() => setWeeks(r)}>
              {r} weeks
            </button>
          ))}
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Returns requested" value={s.total} sub={`${fmtMoneyShort(s.requested_value)} in refunds requested`} />
        <Kpi label="Flagged for review" value={pct(s.flagged, s.total)} sub={`${s.flagged} medium or high risk`} />
        <Kpi label="High risk" value={s.high} sub={`${pct(s.high, s.total)} of all returns`} />
        <Kpi label="Refunds withheld" value={fmtMoneyShort(s.denied_value)} sub={`${s.denied} returns denied after review`} />
        <Kpi
          label="Waiting for review"
          value={s.pendingReview}
          sub={<Link to="/queue">Open the queue →</Link>}
        />
      </div>

      <div className="chart-grid">
        <section className="card">
          <h3 className="section-title">Returns per week, by risk level</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weekly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip content={<LevelTooltip />} cursor={{ fill: 'var(--hover)' }} />
                <Legend content={<LevelLegend />} />
                <Bar dataKey="low" name="Low" stackId="r" fill="var(--good)" stroke="var(--surface)" strokeWidth={2} />
                <Bar dataKey="medium" name="Medium" stackId="r" fill="var(--warning)" stroke="var(--surface)" strokeWidth={2} />
                <Bar dataKey="high" name="High" stackId="r" fill="var(--critical)" stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Share of returns flagged (medium + high)</h3>
          <div className="chart">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={weekly} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--grid)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                <Tooltip
                  cursor={{ stroke: 'var(--axis)' }}
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }}
                  formatter={(v, _n, p) => [v === null ? 'no returns' : `${v}% (${p.payload.medium + p.payload.high} of ${p.payload.total})`, 'Flagged']}
                />
                <Line dataKey="flaggedPct" name="Flagged" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface)' }} activeDot={{ r: 5 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="table-toggle">
        <button className="btn btn-quiet" onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Hide' : 'Show'} weekly numbers as a table
        </button>
      </div>
      {showTable && (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>Week of</th><th className="num">Returns</th><th className="num">Low</th><th className="num">Medium</th><th className="num">High</th><th className="num">Flagged</th><th className="num">Denied</th><th className="num">Avg score</th></tr></thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.week_start}>
                  <td>{w.label}</td><td className="num">{w.total}</td><td className="num">{w.low}</td><td className="num">{w.medium}</td>
                  <td className="num">{w.high}</td><td className="num">{w.flaggedPct === null ? '—' : `${w.flaggedPct}%`}</td>
                  <td className="num">{w.denied}</td><td className="num">{w.total ? w.avg_score : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="chart-grid">
        <section className="card">
          <h3 className="section-title">Flag rate by category</h3>
          <table className="table compact">
            <thead><tr><th>Category</th><th className="num">Returns</th><th>Flagged</th><th className="num">Avg score</th></tr></thead>
            <tbody>
              {data.byCategory.map((c) => {
                const share = c.total ? c.flagged / c.total : 0;
                return (
                  <tr key={c.category}>
                    <td>{meta.categories[c.category]?.label || c.category}</td>
                    <td className="num">{c.total}</td>
                    <td>
                      <div className="inline-bar" title={`${c.flagged} of ${c.total} flagged`}>
                        <div className="inline-bar-track"><div className="inline-bar-fill" style={{ width: `${share * 100}%` }} /></div>
                        <span className="inline-bar-value">{Math.round(share * 100)}%</span>
                      </div>
                    </td>
                    <td className="num">{c.avg_score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="stack">
          <section className="card">
            <h3 className="section-title">Main reasons returns get flagged</h3>
            <ul className="reason-list">
              {data.topFactors.map((f) => {
                const flagged = s.flagged || 1;
                return (
                  <li key={f.key}>
                    <div className="reason-top"><span>{f.label}</span><span className="muted">{f.times} of {s.flagged} flagged</span></div>
                    <div className="inline-bar-track"><div className="inline-bar-fill" style={{ width: `${(f.times / flagged) * 100}%` }} /></div>
                  </li>
                );
              })}
              {data.topFactors.length === 0 && <li className="muted">No flagged returns in this period.</li>}
            </ul>
          </section>

          <section className="card">
            <h3 className="section-title">Customers with repeated high-risk returns</h3>
            {data.repeatCustomers.length === 0 && <p className="muted">None in this period.</p>}
            <ul className="mini-list">
              {data.repeatCustomers.map((c) => (
                <li key={c.id}>
                  <Link to={`/queue?status=all&q=${encodeURIComponent(c.email)}`}>
                    <span className="grow">
                      <span className="strong">{c.full_name}</span><br />
                      <span className="muted small">{c.email}</span>
                    </span>
                    <span className="small">{c.high_risk} high-risk of {c.returns} · avg {c.avg_score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="card kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub muted small">{sub}</div>
    </div>
  );
}

const LEVELS = [
  { key: 'high', name: 'High', level: 'high' },
  { key: 'medium', name: 'Medium', level: 'medium' },
  { key: 'low', name: 'Low', level: 'low' },
];

function LevelLegend() {
  return (
    <div className="legend">
      {[...LEVELS].reverse().map((l) => (
        <span key={l.key} className={`legend-item risk-${l.level}`}>
          <RiskIcon level={l.level} size={12} /> <span className="legend-text">{l.name} risk</span>
        </span>
      ))}
    </div>
  );
}

function LevelTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="strong">Week of {label}</div>
      {LEVELS.map((l) => (
        <div key={l.key} className={`tt-row risk-${l.level}`}>
          <RiskIcon level={l.level} size={12} />
          <span className="tt-name">{l.name}</span>
          <span className="tt-val">{row[l.key]}</span>
        </div>
      ))}
      <div className="tt-row tt-total"><span /><span className="tt-name">Total</span><span className="tt-val">{row.total}</span></div>
    </div>
  );
}
