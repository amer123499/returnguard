import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import { fmtMoney, timeAgo } from '../format.js';
import RiskBadge, { StatusPill } from '../components/RiskBadge.jsx';

const PAGE = 25;
const VIEWS = [
  { key: 'pending_review', label: 'Needs review' },
  { key: 'approved,denied', label: 'Decided by staff' },
  { key: 'auto_approved', label: 'Auto-approved' },
  { key: 'all', label: 'All returns' },
];

export default function Queue() {
  const meta = useMeta();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'pending_review';
  const level = params.get('level') || 'all';
  const sort = params.get('sort') || 'risk';
  const page = Number(params.get('page')) || 0;
  const urlQ = params.get('q') || '';
  const [q, setQ] = useState(urlQ);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Keep the search box in step with the URL (e.g. the nav link clears the search).
  useEffect(() => setQ(urlQ), [urlQ]);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k); else next.set(k, v);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setError(null);
    api.listReturns({ status, level, sort, q: params.get('q') || '', limit: PAGE, offset: page * PAGE })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status, level, sort, page, params]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p className="muted">Medium- and high-risk returns wait here for a decision. Riskiest first.</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={status === v.key}
            className={`tab ${status === v.key ? 'active' : ''}`}
            onClick={() => update({ status: v.key })}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="filters">
        <form className="search-row" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <input
            aria-label="Search returns"
            placeholder="Search order #, customer or product"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn">Search</button>
        </form>
        <label className="inline-field">
          Risk
          <select value={level} onChange={(e) => update({ level: e.target.value })}>
            <option value="all">All levels</option>
            <option value="high">High only</option>
            <option value="medium,high">Medium &amp; high</option>
            <option value="medium">Medium only</option>
            <option value="low">Low only</option>
          </select>
        </label>
        <label className="inline-field">
          Sort
          <select value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="risk">Highest risk first</option>
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {data && data.items.length === 0 && (
        <div className="card empty">
          {status === 'pending_review' ? 'Nothing waiting for review. Nice work.' : 'No returns match these filters.'}
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Risk</th>
                <th>Customer &amp; item</th>
                <th>Why flagged</th>
                <th className="num">Day</th>
                <th className="num">Refund</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="clickable" onClick={(e) => { if (!e.target.closest('a')) navigate(`/returns/${r.id}`); }}>
                  <td><RiskBadge level={r.risk_level} score={r.score} /></td>
                  <td>
                    <Link className="row-link strong" to={`/returns/${r.id}`}>{r.customer_name}</Link>
                    <div className="small muted">{r.product_name} · {meta.categories[r.category]?.label}</div>
                    <div className="small muted mono">{r.order_number} · {timeAgo(r.requested_at)}</div>
                  </td>
                  <td className="why">{r.summary.replace(/^[^.]*\.\s*(Main reasons:\s*)?/, '')}</td>
                  <td className="num">{r.days_to_return}</td>
                  <td className="num">{fmtMoney(r.refund_amount)}</td>
                  <td><StatusPill status={r.status} label={meta.statuses[r.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pager">
            <span className="muted">
              {page * PAGE + 1}–{page * PAGE + data.items.length} of {data.total}
            </span>
            <button className="btn btn-quiet" disabled={page === 0} onClick={() => update({ page: page - 1 })}>Previous</button>
            <button className="btn btn-quiet" disabled={(page + 1) * PAGE >= data.total} onClick={() => update({ page: page + 1 })}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
